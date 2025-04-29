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
  const [profileLoading, setProfileLoading] = useState(false);
  const [authError, setError] = useState(''); // Renamed 'error' to 'authError' for clarity
  // --- End Combined Auth State ---

  // --- Supabase Auth Listener ---
  useEffect(() => {
    console.log("[AuthContext] Setting up onAuthStateChange listener.");
    let initialCheckDone = false;

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      console.log("[AuthContext] Initial Supabase session fetch:", initialSession ? 'Session found' : 'No session');
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
       if (!initialCheckDone) {
         setInitialCheckLoading(false); // Initial check finished
         initialCheckDone = true;
       }
    }).catch(error => {
      console.error("[AuthContext] Error fetching initial Supabase session:", error);
       if (!initialCheckDone) {
         setInitialCheckLoading(false); // Initial check finished (with error)
         initialCheckDone = true;
       }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      console.log(`[AuthContext] Supabase onAuthStateChange event: ${_event}`, newSession ? 'Session updated' : 'User signed out');
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (_event === 'SIGNED_OUT') {
        console.log("[AuthContext] Supabase SIGNED_OUT event, clearing related state.");
        setToken(null);
        setRefreshToken(null);
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
      }
       if (!initialCheckDone) {
         setInitialCheckLoading(false);
         initialCheckDone = true;
       }
    });

    return () => {
      console.log("[AuthContext] Cleaning up onAuthStateChange listener.");
      subscription?.unsubscribe();
    };
  }, []);
  // --- End Supabase Auth Listener ---

  // --- NEW: Dedicated Profile Fetch Effect ---
  useEffect(() => {
    const activeToken = session?.access_token || token;

    if (activeToken) {
      console.log("[AuthContext-ProfileFetchEffect] Auth token detected, fetching profile...");
      setProfileLoading(true);
      setError('');

      axios.get(`${API_BASE_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${activeToken}` }
      })
      .then(response => {
        console.log('[AuthContext-ProfileFetchEffect] Profile fetched successfully:', response.data);
        setCurrentUser(response.data);
      })
      .catch(err => {
        console.error('[AuthContext-ProfileFetchEffect] Failed to fetch profile:', err.response?.status, err.response?.data || err.message);
        setError('Failed to load user profile.');
        setCurrentUser(null);

        if (err.response && err.response.status === 401) {
            console.warn('[AuthContext-ProfileFetchEffect] Unauthorized (401) fetching profile.');
        }
      })
      .finally(() => {
        setProfileLoading(false);
      });

    } else {
      console.log("[AuthContext-ProfileFetchEffect] No active auth token, ensuring profile is null.");
      setCurrentUser(null);
      setProfileLoading(false);
    }

  }, [session, token]);
  // --- End Dedicated Profile Fetch Effect ---

  // --- Simplified Axios Header Management ---
  useEffect(() => {
    console.log(`[AuthContext-HeaderEffect] Running. Session: ${!!session}, Token: ${!!token}`);
    const tokenToSet = session?.access_token || token;

    if (tokenToSet) {
      console.log(`[AuthContext-HeaderEffect] Setting Axios header. Token starts with: ${tokenToSet.substring(0, 10)}...`);
      axios.defaults.headers.common['Authorization'] = `Bearer ${tokenToSet}`;
    } else {
      console.log("[AuthContext-HeaderEffect] No active token, clearing Axios header.");
      if (axios.defaults.headers.common['Authorization']) {
          delete axios.defaults.headers.common['Authorization'];
          console.log("[AuthContext-HeaderEffect] Axios header CLEARED.");
      }
    }
  }, [session, token]);
  // --- End Simplified Axios Header Management ---

  // --- Custom JWT LocalStorage Sync ---
  useEffect(() => {
     console.log('[AuthContext-TokenStorageEffect] Syncing tokens. Token:', !!token, 'RefreshToken:', !!refreshToken);
    if (token && refreshToken) {
        localStorage.setItem('token', token);
        localStorage.setItem('refreshToken', refreshToken);
    } else {
        if (!token) localStorage.removeItem('token');
        if (!refreshToken) localStorage.removeItem('refreshToken');
    }
  }, [token, refreshToken]);
  // --- End Custom JWT LocalStorage Sync ---

  // --- Logout Function ---
  const logout = useCallback(async () => {
    console.log('[AuthContext] Logging out...');
    setError('');
    setToken(null);
    setRefreshToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');

    const { error: supabaseError } = await supabase.auth.signOut();
    if (supabaseError) {
      console.error("[AuthContext] Error during Supabase sign out:", supabaseError);
    } else {
       console.log('[AuthContext] Supabase sign out called successfully (onAuthStateChange will confirm).');
    }
  }, []);

  // --- AUTH ACTIONS (Register, Login) ---

  const register = async (firstName, email, password) => {
    console.log(`[AuthContext] Attempting registration for: ${firstName}, ${email}`);
    setError('');
    setProfileLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/register`, {
        firstName,
        email,
        password
      });
      console.log('[AuthContext] Backend registration response:', response.data);
      
      if (response.data.confirmation_required) {
         setProfileLoading(false);
         return { ...response.data, requires_confirmation: true };
      }

      if (response.data.access_token && response.data.refresh_token) {
        setToken(response.data.access_token);
        setRefreshToken(response.data.refresh_token);
        if(response.data.user) setCurrentUser(response.data.user);
      } else if (!response.data.confirmation_required) {
         throw new Error("Registration response from backend was incomplete.");
      }
      return response.data;
    } catch (err) {
      console.error('[AuthContext] Backend registration error:', err.response?.data || err.message);
      const message = err.response?.data?.error || 'Registration failed';
      setError(message);
      setProfileLoading(false);
      throw new Error(message);
    }
  };

  const login = async (usernameOrEmail, password) => {
    console.log(`[AuthContext] Attempting login for: ${usernameOrEmail}`);
    setError('');
    setProfileLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, { username: usernameOrEmail, password });
      console.log('[AuthContext] Backend login response:', response.data);

      if (!response.data.access_token || !response.data.refresh_token) {
        throw new Error("Login response from backend was incomplete.");
      }

      setToken(response.data.access_token);
      setRefreshToken(response.data.refresh_token);
      if(response.data.user) setCurrentUser(response.data.user);

      return response.data;
    } catch (err) {
      console.error('[AuthContext] Backend login error:', err.response?.data || err.message);
      const message = err.response?.data?.error || 'Login failed';
      setError(message);
      setProfileLoading(false);
      throw new Error(message);
    }
  };

  // --- Context Value ---
  const combinedLoading = initialCheckLoading || profileLoading;

  const value = {
    session,
    supabaseUser: user,
    token,
    refreshToken,
    currentUser,

    loading: combinedLoading,
    initialCheckLoading,
    profileLoading,

    error: authError,

    isAuthenticated: !!user || !!token,

    logout,
    register,
    login,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};