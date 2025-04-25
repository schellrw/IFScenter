import { supabase } from './supabase'; // Assuming supabase client is exported from here

// Base URL for your Flask backend API
// Adjust this if your backend runs on a different port or domain
// Ensure fallback does NOT include /api to match convention in IFSContext.js
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000'; 

/**
 * Fetches all guided sessions for the logged-in user.
 * 
 * @returns {Promise<{ sessions: Array<object> } | null>} An object containing the sessions array or null on error.
 */
export const getGuidedSessions = async (token) => {
  if (!token) {
    console.error("getGuidedSessions called without a token.");
    return null; // No token provided
  }

  try {
    // Explicitly add /api prefix to conform to convention
    const response = await fetch(`${API_BASE_URL}/api/guided-sessions`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      // Try to parse error response from backend
      let errorBody = 'Unknown error';
      try {
        errorBody = await response.json();
      } catch (e) { /* Ignore parsing error */ }
      console.error(`Error fetching guided sessions (${response.status}):`, errorBody);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    // Ensure the response structure matches what Dashboard.js expects
    if (data && Array.isArray(data.sessions)) {
      return data; 
    } else {
      console.error("Unexpected response format from /guided-sessions:", data);
      return { sessions: [] }; // Return empty array to prevent crashes downstream
    }

  } catch (error) {
    console.error('Failed to fetch guided sessions:', error);
    return null; // Indicate failure
  }
};

// You can add other backend API call functions here in the future
// e.g., getJournals, createPart, etc. 