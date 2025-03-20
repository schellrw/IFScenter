import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext();
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// Session timeout configuration
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
const WARNING_BEFORE_TIMEOUT = 60 * 1000; // Show warning 1 minute before logout

// Add debug logging
console.log(`Using API base URL: ${API_BASE_URL}`);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailedError, setDetailedError] = useState(null);
  
  // New state for token expiration and inactivity tracking
  const [tokenExpiryTime, setTokenExpiryTime] = useState(null);
  const [showExpiryWarning, setShowExpiryWarning] = useState(false);
  const [remainingTime, setRemainingTime] = useState(null);

  // Parse JWT token to get expiration time
  const calculateExpiryTime = useCallback((token) => {
    try {
      // JWT token consists of three parts separated by dots
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp) {
        // JWT expiration is in seconds since epoch
        return payload.exp * 1000; // Convert to milliseconds
      }
    } catch (e) {
      console.error('Error parsing token expiration:', e);
    }
    // Fallback to 1 day from now if can't parse token
    return Date.now() + 24 * 60 * 60 * 1000;
  }, []);

  // Function to logout user - converted to useCallback to avoid dependency issues
  const logout = useCallback(() => {
    console.log('Logging out user');
    setToken(null);
    setCurrentUser(null);
    setTokenExpiryTime(null);
    setShowExpiryWarning(false);
  }, []);

  // Set axios default headers when token changes
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      localStorage.setItem('token', token);
      console.log('Token set in localStorage and axios headers:', token.substring(0, 10) + '...');
      
      // Calculate and set token expiry time
      const expiryTime = calculateExpiryTime(token);
      setTokenExpiryTime(expiryTime);
      console.log(`Token will expire at: ${new Date(expiryTime).toLocaleString()}`);
    } else {
      delete axios.defaults.headers.common['Authorization'];
      localStorage.removeItem('token');
      console.log('Token removed from localStorage and axios headers');
    }
  }, [token, calculateExpiryTime]);

  // Global interceptor for handling 401 errors
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => response,
      error => {
        if (error.response && error.response.status === 401) {
          console.error('Received 401 unauthorized error, token might be expired');
          logout();
        }
        return Promise.reject(error);
      }
    );
    
    return () => {
      // Clean up interceptor on unmount
      axios.interceptors.response.eject(interceptor);
    };
  }, [logout]);

  // Inactivity timer and token expiration timer
  useEffect(() => {
    if (!token) return;
    
    let inactivityTimer;
    let expiryTimer;
    let warningTimer;
    
    const resetInactivityTimer = () => {
      clearTimeout(inactivityTimer);
      
      inactivityTimer = setTimeout(() => {
        console.log('User inactive for too long, logging out');
        logout();
      }, INACTIVITY_TIMEOUT);
    };
    
    // Set expiry timer to automatically logout when token expires
    if (tokenExpiryTime) {
      const timeUntilExpiry = Math.max(0, tokenExpiryTime - Date.now());
      
      // Set timer to show warning before expiry
      warningTimer = setTimeout(() => {
        console.log('Token expiration warning');
        setShowExpiryWarning(true);
      }, Math.max(0, timeUntilExpiry - WARNING_BEFORE_TIMEOUT));
      
      // Set timer for actual expiry
      expiryTimer = setTimeout(() => {
        console.log('Token expired, logging out');
        logout();
      }, timeUntilExpiry);
      
      // Set interval to update remaining time display
      const timeInterval = setInterval(() => {
        const remaining = Math.max(0, tokenExpiryTime - Date.now());
        setRemainingTime(remaining);
        
        if (remaining <= 0) {
          clearInterval(timeInterval);
        }
      }, 1000);
      
      return () => {
        clearTimeout(expiryTimer);
        clearTimeout(warningTimer);
        clearInterval(timeInterval);
      };
    }
    
    // Set initial inactivity timer
    resetInactivityTimer();
    
    // Reset inactivity timer on user actions
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, resetInactivityTimer);
    });
    
    return () => {
      clearTimeout(inactivityTimer);
      events.forEach(event => {
        document.removeEventListener(event, resetInactivityTimer);
      });
    };
  }, [token, tokenExpiryTime, logout]);

  // Initial auth check using token from localStorage
  useEffect(() => {
    const initialToken = localStorage.getItem('token');
    if (initialToken && initialToken !== 'undefined' && initialToken !== 'null') {
      console.log('Found token in localStorage:', initialToken.substring(0, 10) + '...');
      setToken(initialToken);
    } else {
      console.log('No valid token found in localStorage');
      setToken(null);
    }
    setLoading(false);
  }, []);

  // Check if there's a stored token on mount
  useEffect(() => {
    const checkAuth = async () => {
      if (token) {
        try {
          console.log('Checking stored token validity...');
          const response = await axios.get(`${API_BASE_URL}/system`);
          console.log('Token is valid, user authenticated');
          setCurrentUser({
            id: response.data.user_id,
            username: 'User' // You might want to fetch user details in a production app
          });
        } catch (err) {
          console.error('Auth token invalid:', err);
          console.error('Response data:', err.response?.data);
          console.error('Status code:', err.response?.status);
          setToken(null);
          setDetailedError({
            message: 'Token validation failed',
            status: err.response?.status,
            data: err.response?.data,
            error: err.message
          });
        }
      } else {
        console.log('No token found, user not authenticated');
      }
      setLoading(false);
    };

    checkAuth();
  }, [token]);

  const register = async (username, email, password) => {
    setLoading(true);
    setError('');
    setDetailedError(null);
    try {
      console.log('Attempting registration with:', { username, email });
      const response = await axios.post(`${API_BASE_URL}/register`, {
        username,
        email,
        password
      });
      console.log('Registration response:', response.data);
      setToken(response.data.access_token);
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
      console.log(`Attempting login for user: ${username} to ${API_BASE_URL}/login`);
      const response = await axios.post(`${API_BASE_URL}/login`, {
        username,
        password
      });
      console.log('Login successful, response:', response.data);
      
      if (!response.data.access_token) {
        throw new Error('No access token received from server');
      }
      
      // Save token and set current user
      const receivedToken = response.data.access_token;
      setToken(receivedToken);
      setCurrentUser(response.data.user);
      
      // Double-check token was set
      console.log(`Token saved: ${receivedToken.substring(0, 10)}...`);
      
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

  // Function to extend the session
  const extendSession = useCallback(async () => {
    console.log('Extending user session');
    setShowExpiryWarning(false);
    
    try {
      // Option 1: For simple inactivity extension, we just need to hide the warning
      // and the inactivity timer will be reset by user interaction
      
      // Option 2: If you want to actually refresh the token with the server
      // Uncomment the following code once you implement a token refresh endpoint
      
      /*
      // Call token refresh API
      const response = await axios.post(`${API_BASE_URL}/refresh-token`, {}, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.data && response.data.access_token) {
        // Update token with new one
        const newToken = response.data.access_token;
        setToken(newToken);
        console.log('Token refreshed successfully');
      }
      */
      
      // For now, we'll simulate extending the token by adding 30 minutes to expiry time
      // This is just for demonstration - in production, always get a new token from server
      if (tokenExpiryTime) {
        const extendedTime = Math.max(tokenExpiryTime, Date.now() + 30 * 60 * 1000);
        setTokenExpiryTime(extendedTime);
        console.log(`Session extended until: ${new Date(extendedTime).toLocaleString()}`);
      }
    } catch (error) {
      console.error('Failed to extend session:', error);
      // If extension fails, we should at least hide the warning
      // as user has shown activity
    }
  }, [token, tokenExpiryTime]);

  const value = {
    token,
    setToken,
    currentUser,
    loading,
    error,
    detailedError,
    login,
    logout,
    register,
    isAuthenticated: !!token,
    // Expose session timeout functionality
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