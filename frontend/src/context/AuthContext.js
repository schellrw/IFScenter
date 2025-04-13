import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

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

// Session timeout configuration
// --- PRODUCTION VALUES --- 
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
const WARNING_BEFORE_TIMEOUT = 60 * 1000; // Show warning 1 minute before logout
// const INACTIVITY_TIMEOUT = 3 * 60 * 1000; // TEST: 3 minutes inactivity
// const WARNING_BEFORE_TIMEOUT = 30 * 1000; // TEST: Show warning 30 seconds before calculated expiry
// Note: Warning timer logic inside the useEffect is based on tokenExpiryTime, 
// which correctly relates to the 1-hour token, not the inactivity timeout.

// Add debug logging
console.log(`Using API base URL: ${API_BASE_URL}`);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem('refreshToken'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailedError, setDetailedError] = useState(null);
  
  // New state for token expiration and inactivity tracking
  const [tokenExpiryTime, setTokenExpiryTime] = useState(null);
  const [showExpiryWarning, setShowExpiryWarning] = useState(false);
  const [remainingTime, setRemainingTime] = useState(null);

  // Wrap calculateExpiryTime in useCallback
  const calculateExpiryTime = useCallback((token) => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp) {
        return payload.exp * 1000; // Convert to milliseconds
      }
    } catch (e) {
      console.error('Error parsing token expiration:', e);
    }
    return Date.now() + 24 * 60 * 60 * 1000; // Fallback
  }, []);

  // Updated logout function
  const logout = useCallback(() => {
    console.log('Logging out user');
    setToken(null);
    setRefreshToken(null);
    setCurrentUser(null);
    setTokenExpiryTime(null);
    setShowExpiryWarning(false);
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
  }, []);

  // Update useEffect to handle both tokens
  useEffect(() => {
    if (token && refreshToken) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      localStorage.setItem('token', token);
      localStorage.setItem('refreshToken', refreshToken);
      console.log('Access Token set:', token.substring(0, 10) + '...');
      console.log('Refresh Token set:', refreshToken.substring(0, 10) + '...');
      
      const expiryTime = calculateExpiryTime(token);
      setTokenExpiryTime(expiryTime);
      console.log(`Token will expire at: ${new Date(expiryTime).toLocaleString()}`);
    } else {
      delete axios.defaults.headers.common['Authorization'];
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      console.log('Tokens removed from localStorage and axios headers');
      if (currentUser) {
          logout();
      }
    }
  }, [token, refreshToken, calculateExpiryTime, logout, currentUser]);

  // Global interceptor for handling 401 errors
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => response,
      error => {
        if (error.response && error.response.status === 401) {
          // Check if it's the refresh token endpoint itself failing
          if (error.config.url.includes('/api/refresh-token')) {
            console.error('Refresh token failed (401), logging out.');
          } else {
            console.error('Received 401 unauthorized, token might be expired or invalid. Logging out.');
            // Optional: Here you could attempt ONE refresh before logging out
            // attemptTokenRefresh().catch(() => logout()); 
          }
          logout(); // Logout on 401
        }
        return Promise.reject(error);
      }
    );
    
    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [logout]); // Dependency

  // Inactivity timer and token expiration timer with added logging
  useEffect(() => {
    // If no token, do nothing related to timers
    if (!token || !refreshToken) {
      console.log('[TimerEffect] Skipping effect: No tokens.');
      return; 
    }

    let inactivityTimer;
    let expiryTimer;
    let warningTimer;
    let timeInterval; // Declare timeInterval here

    console.log('[TimerEffect] Running effect, token exists.'); // Log effect run

    const resetInactivityTimer = () => {
      clearTimeout(inactivityTimer);
      // console.log('[TimerEffect] Inactivity timer reset.'); // Log reset - Can be too noisy

      inactivityTimer = setTimeout(() => {
        console.error('[TimerEffect] User inactive for too long, logging out!'); // Log logout trigger
        logout();
      }, INACTIVITY_TIMEOUT); // Uses the 3-minute value
       console.log(`[TimerEffect] New inactivity timer set for ${INACTIVITY_TIMEOUT/1000}s`); // Log new timer set
    };

    // Set expiry timer logic (unchanged for now)
    if (tokenExpiryTime) {
       console.log('[TimerEffect] Setting up expiry/warning timers.');
       const timeUntilExpiry = Math.max(0, tokenExpiryTime - Date.now());

       warningTimer = setTimeout(() => {
         console.log('[TimerEffect] Token expiration warning triggered.');
         setShowExpiryWarning(true);
       }, Math.max(0, timeUntilExpiry - WARNING_BEFORE_TIMEOUT));

       expiryTimer = setTimeout(() => {
         console.log('[TimerEffect] Token expired, logging out.');
         logout();
       }, timeUntilExpiry);

       // Assign to declared variable
       timeInterval = setInterval(() => { 
         const remaining = Math.max(0, tokenExpiryTime - Date.now());
         setRemainingTime(remaining);
         if (remaining <= 0) {
           clearInterval(timeInterval);
         }
       }, 1000);
    } else {
       console.log('[TimerEffect] No tokenExpiryTime, skipping expiry timers.');
    }

    // Set initial inactivity timer
    console.log('[TimerEffect] Setting initial inactivity timer.');
    resetInactivityTimer();

    // Event listeners to reset inactivity timer
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    console.log('[TimerEffect] Adding event listeners:', events);
    const listenerCallback = (event) => { // Named callback for logging
        // console.log(`[TimerEffect] Activity detected: ${event.type}`); // Can be too noisy, enable if needed
        resetInactivityTimer();
    };
    events.forEach(event => {
      document.addEventListener(event, listenerCallback);
    });

    // Cleanup function
    return () => {
      console.log('[TimerEffect] Cleaning up timers and listeners.'); // Log cleanup
      clearTimeout(inactivityTimer);
      clearTimeout(expiryTimer);
      clearTimeout(warningTimer);
      // Check if interval exists before clearing
      if(timeInterval) clearInterval(timeInterval); 
      events.forEach(event => {
        document.removeEventListener(event, listenerCallback);
      });
       console.log('[TimerEffect] Cleanup complete.');
    };
  // Ensure all relevant dependencies are included
  }, [token, refreshToken, tokenExpiryTime, logout, calculateExpiryTime, INACTIVITY_TIMEOUT, WARNING_BEFORE_TIMEOUT]); // Add timeouts constants to dependencies

  // Update initial auth check to also check for refresh token
  useEffect(() => {
    const initialToken = localStorage.getItem('token');
    const initialRefreshToken = localStorage.getItem('refreshToken');
    if (initialToken && initialToken !== 'undefined' && initialToken !== 'null' &&
        initialRefreshToken && initialRefreshToken !== 'undefined' && initialRefreshToken !== 'null') {
      console.log('Found tokens in localStorage');
      setToken(initialToken);
      setRefreshToken(initialRefreshToken);
    } else {
      console.log('Valid token pair not found in localStorage');
      setToken(null);
      setRefreshToken(null);
    }
  }, []);

  // Check token validity (logic remains similar, but ensure setLoading(false) is hit)
  useEffect(() => {
    const checkAuth = async () => {
      if (token && refreshToken) { 
        try {
          console.log('Checking stored token validity...');
          const response = await axios.get(`${API_BASE_URL}/api/me`); 
          console.log('Token appears valid, user data:', response.data);
          setCurrentUser(response.data); 
        } catch (err) {
          console.error('Auth token validation failed:', err.response?.status, err.response?.data || err.message);
          logout();
          setDetailedError({
            message: 'Session invalid or expired', 
            status: err.response?.status,
            data: err.response?.data,
            error: err.message
          });
        }
      } else {
        console.log('No tokens found, user not authenticated');
        setCurrentUser(null);
      }
      setLoading(false);
    };

    checkAuth();
  }, [token, refreshToken, logout]);

  const register = async (username, email, password) => {
    setLoading(true);
    setError('');
    setDetailedError(null);
    try {
      console.log('Attempting registration with:', { username, email });
      const response = await axios.post(`${API_BASE_URL}/api/register`, {
        username,
        email,
        password
      });
      console.log('Registration response:', response.data);
      
      if (response.data.confirmation_required) {
        console.log('Email confirmation required for registration');
        return {
          ...response.data,
          requires_confirmation: true
        };
      }
      
      setToken(response.data.access_token);
      setRefreshToken(response.data.refresh_token || null);
      setCurrentUser(response.data.user);
      return response.data;
    } catch (err) {
      console.error('Registration error details:', err.response?.data || err.message);
      const message = err.response?.data?.error || 'Registration failed';
      setError(message);
      setDetailedError({
        message: message,
        status: err.response?.status,
        data: err.response?.data,
        error: err.message
      });
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    setLoading(true);
    setError('');
    setDetailedError(null);
    try {
      console.log(`Attempting login for user: ${username} to ${API_BASE_URL}/api/login`);
      const response = await axios.post(`${API_BASE_URL}/api/login`, {
        username,
        password
      });
      console.log('Login successful, response:', response.data);
      
      if (!response.data.access_token || !response.data.refresh_token) {
        console.error('Login response missing access_token or refresh_token');
        throw new Error('Login failed: Invalid response from server.');
      }
      
      setToken(response.data.access_token);
      setRefreshToken(response.data.refresh_token);
      setCurrentUser(response.data.user);
      
      console.log(`Access Token saved: ${response.data.access_token.substring(0, 10)}...`);
      console.log(`Refresh Token saved: ${response.data.refresh_token.substring(0, 10)}...`);
      
      return response.data;
    } catch (err) {
      console.error('Login failed with error:', err);
      console.error('Response status:', err.response?.status);
      console.error('Response data:', err.response?.data);
      
      const message = err.response?.data?.error || 'Login failed';
      setError(message);
      setDetailedError({
        message: message,
        status: err.response?.status,
        data: err.response?.data,
        error: err.message
      });
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  // Ensure extendSession is wrapped in useCallback
  const extendSession = useCallback(async () => {
    const currentRefreshToken = localStorage.getItem('refreshToken');
    if (!currentRefreshToken) {
      console.error('Cannot refresh session: No refresh token available.');
      logout();
      return; 
    }

    console.log('Attempting to refresh token...');
    setShowExpiryWarning(false);
    
    try {
      const response = await axios.post(`${API_BASE_URL}/api/refresh-token`, { 
        refresh_token: currentRefreshToken 
      });
      
      if (response.data && response.data.access_token && response.data.refresh_token) {
        const newAccessToken = response.data.access_token;
        const newRefreshToken = response.data.refresh_token;
        
        setToken(newAccessToken);
        setRefreshToken(newRefreshToken);
        
        const expiryTime = calculateExpiryTime(newAccessToken);
        setTokenExpiryTime(expiryTime);
        
        console.log('Token refreshed successfully.');
        console.log(`New expiry time: ${new Date(expiryTime).toLocaleString()}`);
      } else {
        console.error('Token refresh failed: Invalid response from server.', response.data);
        logout();
      }
    } catch (error) {
      console.error('Failed to refresh token:', error.response?.status, error.response?.data || error.message);
      logout(); 
    }
  // Add dependencies for extendSession: logout, calculateExpiryTime, setToken, setRefreshToken, setTokenExpiryTime, setShowExpiryWarning
  }, [logout, calculateExpiryTime, setToken, setRefreshToken, setTokenExpiryTime, setShowExpiryWarning]); 

  const value = {
    token,
    refreshToken,
    currentUser,
    loading,
    error,
    detailedError,
    login,
    logout,
    register,
    isAuthenticated: !!token && !!refreshToken,
    showExpiryWarning,
    remainingTime,
    extendSession
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 