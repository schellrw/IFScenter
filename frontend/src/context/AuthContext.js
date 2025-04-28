import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { supabase } from '../utils/supabase'; // Import Supabase client

const AuthContext = createContext();
// Clean up the API_BASE_URL to handle any potential quotation marks and ensure proper URL formation
let API_BASE_URL;
if (process.env.REACT_APP_API_URL === undefined || process.env.REACT_APP_API_URL === null) {
  // If not defined, use a default based on environment
  API_BASE_URL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000';
} else {
  // Otherwise use the provided value
  API_BASE_URL = process.env.REACT_APP_API_URL;
}
// Remove any quotation marks that might have been included in the environment variable
API_BASE_URL = API_BASE_URL.replace(/["']/g, '');
// Ensure API_BASE_URL doesn't end with a slash
API_BASE_URL = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;

// Session timeout configuration (COMMENTED OUT - Supabase handles session)
// const INACTIVITY_TIMEOUT = 30 * 60 * 1000; 
// const WARNING_BEFORE_TIMEOUT = 60 * 1000; 

// Add debug logging
console.log(`Using API base URL: ${API_BASE_URL}`);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  // --- Combined Auth State ---
  const [session, setSession] = useState(null); // Supabase session
  const [user, setUser] = useState(null); // Supabase user object
  const [token, setToken] = useState(localStorage.getItem('token')); // Custom JWT access token
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem('refreshToken')); // Custom JWT refresh token
  const [currentUser, setCurrentUser] = useState(null); // User data from custom /me endpoint
  const [initialCheckLoading, setInitialCheckLoading] = useState(true); // Tracks initial Supabase check
  const [authLoading, setAuthLoading] = useState(true); // NEW: Tracks if auth setup (header etc.) is complete
  const [error, setError] = useState(''); // Keep general error state
  // --- End Combined Auth State ---

  // State to track if profile fetch has been done for the current session
  const [profileFetchAttempted, setProfileFetchAttempted] = useState(false);

  // --- Moved fetchUserProfile definition UP --- 
  // Function to fetch user profile using the provided token or fallback to localStorage
  const fetchUserProfile = useCallback(async (authToken = null) => {
    // Prioritize passed token, fallback to localStorage for custom JWT flow
    const tokenToUse = authToken || localStorage.getItem('token'); 

    if (!tokenToUse) {
      console.log('[AuthContext-fetchUserProfile] Cannot fetch profile, no token provided or found.');
      // Clear currentUser if called without a token and none exists
      setCurrentUser(null); 
      // Ensure loading stops if fetch can't proceed
      setAuthLoading(false); 
      return;
    }
    console.log('[AuthContext-fetchUserProfile] Fetching user profile...');
    // Indicate loading - use authLoading? Or a separate profileLoading state? Let's reuse authLoading.
    setAuthLoading(true); 
    setError(''); // Clear previous errors
    try {
        // Set header specifically for this request
        const response = await axios.get(`${API_BASE_URL}/api/auth/me`, {
            headers: {
                'Authorization': `Bearer ${tokenToUse}`
            }
        });
        console.log('[AuthContext-fetchUserProfile] User profile fetched successfully:', response.data);
        setCurrentUser(response.data);
    } catch (err) {
        console.error('[AuthContext-fetchUserProfile] Failed to fetch user profile:', err.response?.status, err.response?.data || err.message);
        setError('Failed to load user profile.');
        setCurrentUser(null); // Clear user data on fetch error

        // If fetch fails due to invalid token (401), maybe clear the source
        if (err.response && err.response.status === 401) {
            if (authToken) {
                // If we used a Supabase token, maybe trigger Supabase sign out? Risky.
                // Let Supabase client handle session expiry.
                console.warn('[AuthContext-fetchUserProfile] Unauthorized (401) fetching profile with provided token.');
            } else {
                // If we used localStorage token, clear custom tokens
                console.log('[AuthContext-fetchUserProfile] Unauthorized (401) with localStorage token, clearing custom tokens.');
                setToken(null);
                setRefreshToken(null);
                localStorage.removeItem('token');
                localStorage.removeItem('refreshToken');
            }
        }
    } finally {
        // Set loading false regardless of success/failure, profile fetch attempt is complete
        setAuthLoading(false); 
    }
  // API_BASE_URL is stable, no other state dependencies needed here
  }, [API_BASE_URL]); 

  // --- Supabase Auth Listener ---
  useEffect(() => {
    console.log("[AuthContext] Setting up onAuthStateChange listener.");
    // Initial check is important
    let initialCheckDone = false;

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      console.log("[AuthContext] Initial Supabase session fetch:", initialSession ? 'Session found' : 'No session');
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
       if (!initialCheckDone) {
         setInitialCheckLoading(false); // Initial check finished
         // Don't set authLoading here yet, wait for header effect
         initialCheckDone = true;
       }
    }).catch(error => {
      console.error("[AuthContext] Error fetching initial Supabase session:", error);
       if (!initialCheckDone) {
         setInitialCheckLoading(false); // Initial check finished (with error)
         // Don't set authLoading here yet
         initialCheckDone = true;
       }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      console.log(`[AuthContext] Supabase onAuthStateChange event: ${_event}`, newSession ? 'Session updated' : 'User signed out');
      setSession(newSession);
      setUser(newSession?.user ?? null);

      // If Supabase signs out, ensure custom tokens are also cleared
      if (_event === 'SIGNED_OUT') {
          console.log("[AuthContext] Supabase SIGNED_OUT event, clearing related state.");
          setToken(null); // Clear custom JWT
          setRefreshToken(null);
          setCurrentUser(null);
          localStorage.removeItem('token'); // Clear storage too
          localStorage.removeItem('refreshToken');
          delete axios.defaults.headers.common['Authorization']; // Clear header on sign out
          setAuthLoading(false); // Auth state is now known (logged out)
      }
       // Ensure initialCheckLoading is false after the first event if initial check hasn't finished
       if (!initialCheckDone) {
         setInitialCheckLoading(false);
         initialCheckDone = true;
       }
       // We still wait for the header effect to set authLoading
    });

    return () => {
      console.log("[AuthContext] Cleaning up onAuthStateChange listener.");
      subscription?.unsubscribe();
    };
  }, []);
  // --- End Supabase Auth Listener ---

  // --- Consolidated Axios Header Management ---
  useEffect(() => {
    console.log(`[AuthContext-HeaderEffect] Running. Session: ${!!session}, Token: ${!!token}, InitialCheckLoading: ${initialCheckLoading}`);
    let headerSet = false;
    let usedSupabaseToken = false;

    // Priority 1: Supabase Session Token
    if (session?.access_token) {
      const tokenToSet = session.access_token;
      console.log(`[AuthContext-HeaderEffect] Using Supabase session token. Starts with: ${tokenToSet?.substring(0, 10)}...`);
      axios.defaults.headers.common['Authorization'] = `Bearer ${tokenToSet}`;
      headerSet = true;
      usedSupabaseToken = true;
      console.log("[AuthContext-HeaderEffect] Axios header SET (Supabase).");

      // Fetch profile only ONCE per Supabase session establishment
      if (!profileFetchAttempted) {
        console.log("[AuthContext-HeaderEffect] Triggering profile fetch for new/updated Supabase session.");
        setProfileFetchAttempted(true); // Mark as attempted for Supabase session
        fetchUserProfile(tokenToSet);
      } else {
        console.log("[AuthContext-HeaderEffect] Profile fetch already attempted for this Supabase session.");
      }

    // Priority 2: Custom JWT Token (if no Supabase session)
    } else if (token) { 
      console.log(`[AuthContext-HeaderEffect] No Supabase session, using custom JWT token. Starts with: ${token?.substring(0, 10)}...`);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      headerSet = true;
      console.log("[AuthContext-HeaderEffect] Axios header SET (Custom JWT).");
      // Reset Supabase fetch attempt flag if we are now using custom token
      if (profileFetchAttempted) {
          setProfileFetchAttempted(false);
      }
      // Fetch profile if currentUser is missing and we have a custom token
      // This might be redundant if login/register already set currentUser, but acts as a fallback
      if (!currentUser) {
           console.log("[AuthContext-HeaderEffect] Custom JWT exists but currentUser is null, triggering profile fetch.");
           fetchUserProfile(); // Uses token from localStorage via internal logic
      }

    // Clear Header: If neither Supabase session nor custom JWT exists
    } else { 
      console.log("[AuthContext-HeaderEffect] No active session or custom token detected.");
      if (axios.defaults.headers.common['Authorization']) {
        console.log("[AuthContext-HeaderEffect] Attempting to clear Axios header...");
        delete axios.defaults.headers.common['Authorization'];
        console.log("[AuthContext-HeaderEffect] Axios header CLEARED.");
      } else {
        console.log("[AuthContext-HeaderEffect] Axios header already clear.");
      }
      headerSet = true; // Header state is known (cleared)

      // Clear currentUser state if no auth method active
      if (currentUser) {
        console.log("[AuthContext-HeaderEffect] Clearing currentUser state.");
        setCurrentUser(null);
      }
      // Reset Supabase fetch attempt flag when no session active
      if (profileFetchAttempted) {
        console.log("[AuthContext-HeaderEffect] Resetting profile fetch attempt flag.");
        setProfileFetchAttempted(false);
      }
    }

    // Determine overall authLoading state
    // It should be false if initial check is done AND (header is set OR header is cleared because no tokens exist)
    if (!initialCheckLoading && headerSet && authLoading) {
        console.log("[AuthContext-HeaderEffect] Initial check done and header state known, setting authLoading false.");
        setAuthLoading(false);
    } else if (initialCheckLoading) {
        console.log("[AuthContext-HeaderEffect] Still waiting for initial check, authLoading remains true.");
    } else if (!headerSet) {
        // This case shouldn't happen with the logic above, but safety check
        console.warn("[AuthContext-HeaderEffect] Header state unknown after checks, authLoading might be incorrect.");
    }

    console.log(`[AuthContext-HeaderEffect] Finished. Header set: ${headerSet}, Used Supabase: ${usedSupabaseToken}`);

  // Dependencies: React to changes in Supabase session, custom token, initial check, and profile fetch attempt status
  }, [session, token, initialCheckLoading, fetchUserProfile, profileFetchAttempted]); 
  // --- End Consolidated Axios Header Management ---

  // --- Custom JWT Check on Mount --- 
  // This effect should primarily ensure localStorage is updated if tokens change
  // and potentially trigger profile fetch if needed, but NOT manage the header directly.
  useEffect(() => {
    if (token && refreshToken) {
        console.log('[AuthContext-TokenStorageEffect] Syncing custom tokens to localStorage.');
        localStorage.setItem('token', token);
        localStorage.setItem('refreshToken', refreshToken);
    } else {
        console.log('[AuthContext-TokenStorageEffect] No custom tokens, clearing localStorage.');
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
    }
  }, [token, refreshToken]);

  // --- Initial Check for Custom Auth --- (If no Supabase session found)
  useEffect(() => {
    const checkInitialCustomAuth = async () => {
        // Only run if Supabase listener finished and found no session, but custom tokens exist in localStorage
        // And also check if 'token' state is not already set (to avoid double fetch)
        if (!initialCheckLoading && !session && !token && localStorage.getItem('token') && localStorage.getItem('refreshToken')) {
            console.log("[AuthContext-InitialCustomCheck] No initial Supabase session or state token, checking localStorage token validity...");
            // Set state from localStorage first, which will trigger header effect
            const storedToken = localStorage.getItem('token');
            const storedRefreshToken = localStorage.getItem('refreshToken');
            setToken(storedToken);
            setRefreshToken(storedRefreshToken);
            // The header effect will run due to token state change and call fetchUserProfile if needed
            // await fetchUserProfile(storedToken); // Let the main effect handle this based on token state
        } else {
            console.log(`[AuthContext-InitialCustomCheck] Skipping check. InitialLoading: ${initialCheckLoading}, Session: ${!!session}, Token State: ${!!token}`);
        }
    };
    checkInitialCustomAuth();
  // Run when initial check is done, session is known, and token state changes
  }, [initialCheckLoading, session, token]); 

  // --- Combined Logout Function ---
  const logout = useCallback(async () => {
    console.log('[AuthContext] Logging out...');
    setAuthLoading(true); // Set loading during logout process

    // Clear custom JWT state and storage FIRST
    console.log('[AuthContext] Clearing custom JWT tokens.');
    setToken(null);
    setRefreshToken(null);
    setCurrentUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    // Also clear the header immediately for custom JWT logout
    delete axios.defaults.headers.common['Authorization'];

    // Then Sign out from Supabase (will trigger onAuthStateChange)
    console.log('[AuthContext] Signing out from Supabase...');
    const { error: supabaseError } = await supabase.auth.signOut();
    if (supabaseError) {
      console.error("[AuthContext] Error during Supabase sign out:", supabaseError);
      // If Supabase sign out fails, at least custom state is cleared.
      // Set loading false since the process finished (even with error)
      setAuthLoading(false);
    } else {
       console.log('[AuthContext] Supabase sign out successful (onAuthStateChange will confirm).');
       // Rely on onAuthStateChange SIGNED_OUT event to set authLoading false finally.
    }

    // Note: Axios header clearing is now handled by onAuthStateChange and the header useEffect
    // AND explicitly cleared above for the custom token case.
    // delete axios.defaults.headers.common['Authorization'];

  }, []);

  // --- Restored Register Function (Calls Backend API) ---
  const register = async (username, email, password) => {
    console.log(`[AuthContext] Attempting registration via backend API for: ${username}`);
    setInitialCheckLoading(true);
    setError('');
    try {
      const response = await axios.post(`${API_BASE_URL}/api/register`, { username, email, password });
      console.log('[AuthContext] Backend registration response:', response.data);
      
      if (response.data.confirmation_required) {
         // Handle confirmation required case (e.g., show message)
         setInitialCheckLoading(false);
         return { ...response.data, requires_confirmation: true };
      }

      // Assuming backend returns tokens and user data on successful non-confirmed registration
      if (response.data.access_token && response.data.refresh_token && response.data.user) {
        setToken(response.data.access_token);
        setRefreshToken(response.data.refresh_token);
        setCurrentUser(response.data.user); // Set user data from backend
      } else {
         throw new Error("Registration response from backend was incomplete.");
      }
      setInitialCheckLoading(false);
      return response.data;
    } catch (err) {
      console.error('[AuthContext] Backend registration error:', err.response?.data || err.message);
      const message = err.response?.data?.error || 'Registration failed';
      setError(message);
      setInitialCheckLoading(false);
      throw new Error(message);
    }
  };

  // --- Restored Login Function (Calls Backend API) ---
  const login = async (usernameOrEmail, password) => {
    console.log(`[AuthContext] Attempting login via backend API for: ${usernameOrEmail}`);
    setInitialCheckLoading(true);
    setError('');
    try {
      // Use username field, backend handles if it's email or username
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, { username: usernameOrEmail, password });
      console.log('[AuthContext] Backend login response:', response.data);

      if (!response.data.access_token || !response.data.refresh_token || !response.data.user) {
        console.error('[AuthContext] Backend login response missing required fields.');
        throw new Error('Login failed: Invalid response from server.');
      }
      
      setToken(response.data.access_token);
      setRefreshToken(response.data.refresh_token);
      setCurrentUser(response.data.user); // Set user data from backend
      setInitialCheckLoading(false);
      return response.data;

    } catch (err) {
      console.error('[AuthContext] Backend login error:', err.response?.data || err.message);
      const message = err.response?.data?.error || 'Login failed';
      setError(message);
      setInitialCheckLoading(false);
      throw new Error(message);
    }
  };
  
  // --- Context Value ---
  const value = {
    // Supabase specific
    session, 
    supabaseUser: user, // Rename to avoid clash with currentUser from custom JWT
    // Custom JWT specific
    token,
    refreshToken,
    currentUser, // User data from custom /me endpoint
    // Combined state
    loading: initialCheckLoading || authLoading, // Overall loading is true if either check is pending
    authLoading, // Specific flag for API call readiness
    error,
    // Determine authentication based on EITHER Supabase user OR custom JWT token presence
    isAuthenticated: !!user || !!token, // Updated logic
    // Functions
    logout, 
    register, // Uses backend API
    login,    // Uses backend API
    fetchUserProfile // Function to explicitly get profile via custom JWT
    // Add other functions or state if needed (e.g., extendSession for custom JWT)
  };

  return (
    <AuthContext.Provider value={value}>
      {/* Render children only when initial check is done? Or let consumers use loading state? */}
      {/* Let consumers use the loading state */}
      {children}
    </AuthContext.Provider>
  );
}; 