import axios from 'axios'; // Import axios
import { supabase } from './supabase'; // Assuming supabase client is exported from here

// Base URL for your Flask backend API
// Adjust this if your backend runs on a different port or domain
// Ensure fallback does NOT include /api to match convention in IFSContext.js
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000'; 

/**
 * Fetches all guided sessions for the logged-in user.
 * Relies on the default Axios header set by AuthContext for authentication.
 * 
 * @returns {Promise<{ sessions: Array<object> } | null>} An object containing the sessions array or null on error.
 */
export const getGuidedSessions = async () => {
  try {
    console.log("[api.js] Attempting to fetch guided sessions using default Axios header...");
    // Use axios.get - it will automatically include the default Authorization header
    const response = await axios.get(`${API_BASE_URL}/api/guided-sessions`);

    // Axios automatically checks for response.ok (throws error for 4xx/5xx)
    // We still need to check the data format
    const data = response.data;
    if (data && Array.isArray(data.sessions)) {
      console.log("[api.js] Successfully fetched guided sessions.");
      return data; 
    } else {
      console.error("[api.js] Unexpected response format from /guided-sessions:", data);
      return { sessions: [] }; // Return empty array to prevent crashes downstream
    }

  } catch (error) {
    // Axios errors have a different structure
    console.error('[api.js] Failed to fetch guided sessions:', error);
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error(`[api.js] Error Status: ${error.response.status}`);
      console.error('[api.js] Error Data:', error.response.data);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('[api.js] No response received:', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('[api.js] Error setting up request:', error.message);
    }
    return null; // Indicate failure
  }
};

/**
 * Fetches details for a specific guided session and its messages.
 * Relies on the default Axios header set by AuthContext for authentication.
 * 
 * @param {string} sessionId - The ID of the session to fetch.
 * @returns {Promise<object | null>} An object containing the session and messages or null on error.
 */
export const getSessionDetails = async (sessionId) => {
  if (!sessionId) {
    console.error('[api.js] getSessionDetails called without sessionId');
    return null;
  }
  try {
    console.log(`[api.js] Attempting to fetch session details for ID: ${sessionId}...`);
    const response = await axios.get(`${API_BASE_URL}/api/guided-sessions/${sessionId}`);
    console.log(`[api.js] Successfully fetched session details for ID: ${sessionId}.`);
    return response; // Return the whole response object so caller can access .data
  } catch (error) {
    console.error(`[api.js] Failed to fetch session details for ID: ${sessionId}:`, error);
    if (error.response) {
      console.error(`[api.js] Error Status: ${error.response.status}`);
      console.error('[api.js] Error Data:', error.response.data);
    } else if (error.request) {
      console.error('[api.js] No response received:', error.request);
    } else {
      console.error('[api.js] Error setting up request:', error.message);
    }
    // Propagate the error so the caller can handle it (e.g., show specific message)
    throw error; 
  }
};

/**
 * Sends a user message to a specific guided session.
 * Relies on the default Axios header set by AuthContext for authentication.
 * 
 * @param {string} sessionId - The ID of the session.
 * @param {string} content - The content of the user's message.
 * @returns {Promise<object | null>} The response object from the backend or null on error.
 */
export const addSessionMessage = async (sessionId, content) => {
  if (!sessionId || !content) {
    console.error('[api.js] addSessionMessage called without sessionId or content');
    return null;
  }
  try {
    console.log(`[api.js] Attempting to add message to session ID: ${sessionId}...`);
    const response = await axios.post(
      `${API_BASE_URL}/api/guided-sessions/${sessionId}/messages`,
      { content } // Send content in the request body
    );
    console.log(`[api.js] Successfully added message to session ID: ${sessionId}.`);
    return response; // Return the whole response object
  } catch (error) {
    console.error(`[api.js] Failed to add message to session ID: ${sessionId}:`, error);
     if (error.response) {
      console.error(`[api.js] Error Status: ${error.response.status}`);
      console.error('[api.js] Error Data:', error.response.data);
    } else if (error.request) {
      console.error('[api.js] No response received:', error.request);
    } else {
      console.error('[api.js] Error setting up request:', error.message);
    }
    // Propagate the error
    throw error;
  }
};

// You can add other backend API call functions here in the future
// e.g., getJournals, createPart, etc. 