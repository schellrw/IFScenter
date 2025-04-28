import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

const IFSContext = createContext();

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

export const useIFS = () => {
  const context = useContext(IFSContext);
  if (!context) {
    throw new Error('useIFS must be used within an IFSProvider');
  }
  return context;
};

export const IFSProvider = ({ children }) => {
  const { isAuthenticated, currentUser, token: authToken } = useAuth();
  const [system, setSystem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [journals, setJournals] = useState([]);

  // Simplified effect to fetch system when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      console.log(`IFSContext: isAuthenticated is true, calling fetchSystem.`);
      fetchSystem(); 
    } else {
      console.log('IFSContext: isAuthenticated is false, clearing system data.');
      setSystem(null);
      setJournals([]); // Also clear journals on logout
      setLoading(false);
    }
    // Dependency solely on isAuthenticated now
  }, [isAuthenticated]);

  const fetchSystem = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('IFSContext: Executing fetchSystem...');
      
      const response = await axios.get(`${API_BASE_URL}/api/system`);
      
      console.log('System fetched successfully:', response.data);
      console.log('System ID:', response.data.id);
      console.log('Parts count:', response.data.parts_count);
      console.log('Parts:', Object.keys(response.data.parts || {}).length);
      
      setSystem(response.data);
      
      // After successfully fetching the system, also fetch journals
      if (response.data && response.data.id) {
        console.log('Automatically fetching journals after system load');
        try {
          await fetchJournals(response.data.id);
        } catch (journalErr) {
          console.error('Error auto-fetching journals:', journalErr);
          // Don't set an error for journal fetch failures
        }
      }
    } catch (err) {
      console.error('Error fetching system:', err);
      
      // Check for specific error types
      if (err.response) {
        if (err.response.status === 401) {
          console.error('Authentication error in fetchSystem: Token may be invalid or expired');
          setError('Authentication error. Please log in again.');
        } else if (err.response.status === 404) {
          console.error('System not found. User may not have created one yet.');
          setError('No system found. Please create one first.');
        } else {
          setError(`Failed to fetch system data: ${err.response.data?.error || 'Unknown error'}`);
        }
        console.error('Response details:', err.response?.data);
      } else {
        setError('Network error while fetching system. Please check your connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  const addPart = async (partData) => {
    try {
      const formattedPart = {
        ...partData,
        feelings: Array.isArray(partData.feelings) ? partData.feelings : [],
        beliefs: Array.isArray(partData.beliefs) ? partData.beliefs : [],
        triggers: Array.isArray(partData.triggers) ? partData.triggers : [],
        needs: Array.isArray(partData.needs) ? partData.needs : []
      };

      // Add the system_id to the part data
      if (system && system.id) {
        formattedPart.system_id = system.id;
        console.log(`Using system_id: ${system.id} for new part`);
      } else if (system) {
        // Fallback in case id is nested differently
        console.log('System object structure:', JSON.stringify(system, null, 2).substring(0, 200) + '...');
        throw new Error('System ID is missing or has unexpected format');
      } else {
        console.error('No system available for creating part');
        throw new Error('System not available. Please ensure you are logged in and your system is set up.');
      }

      // Debug what we're sending
      console.log('Sending part data to server:', JSON.stringify(formattedPart, null, 2));

      // Make sure we have required fields
      if (!formattedPart.name) {
        throw new Error('Part name is required');
      }

      // Make sure role is a string or null
      if (formattedPart.role === undefined) {
        formattedPart.role = null;
      }

      const response = await axios.post(`${API_BASE_URL}/api/parts`, formattedPart);
      
      console.log('Part created successfully:', response.data);
      await fetchSystem(); // Refresh system data
      return response.data;
    } catch (err) {
      console.error('Error adding part:', err);
      
      // Enhanced error logging for 500 errors
      if (err.response) {
        console.error('Response status:', err.response.status);
        console.error('Response headers:', err.response.headers);
        
        if (err.response.data) {
          console.error('Error response data:', JSON.stringify(err.response.data, null, 2));
        }
        
        if (err.response.status === 401) {
          console.error('Authentication error: Token may be invalid or expired');
        } else if (err.response.status === 400) {
          console.error('Bad request - server response:', err.response.data);
          if (err.response.data.details) {
            console.error('Validation errors:', err.response.data.details);
          }
          throw new Error(`Bad request: ${JSON.stringify(err.response.data)}`);
        } else if (err.response.status === 500) {
          console.error('Server error (500) - This could be related to database issues or schema mismatches');
          // Try to extract more detailed error if available
          const errorMsg = err.response.data?.error || 'Unknown server error';
          throw new Error(`Server error: ${errorMsg}`);
        }
      }
      
      throw err;
    }
  };

  const updatePart = async (partId, updates) => {
    try {
      console.log('Sending update with data:', JSON.stringify(updates, null, 2));
      const response = await axios.put(`${API_BASE_URL}/api/parts/${partId}`, updates);
      await fetchSystem(); // Refresh system data
      return response.data;
    } catch (err) {
      console.error('Error updating part:', err);
      if (err.response && err.response.data) {
        console.error('Error details:', JSON.stringify(err.response.data, null, 2));
        if (err.response.data.details) {
          console.error('Validation errors:', JSON.stringify(err.response.data.details, null, 2));
        }
      }
      throw err;
    }
  };

  const fetchJournals = async (systemId) => {
    try {
      console.log('Fetching journals...');
      console.log('Using system ID for journals:', systemId);
      
      const response = await axios.get(`${API_BASE_URL}/api/journals`, {
        params: {
          system_id: systemId
        }
      });
      
      // Sort journals by date (newest first)
      const sortedJournals = response.data.sort((a, b) => 
        new Date(b.date) - new Date(a.date)
      );
      
      // Update state
      setJournals(sortedJournals);
      
      return sortedJournals;
    } catch (err) {
      console.error('Error fetching journals:', err);
      
      // Handle specific errors
      if (err.response) {
        if (err.response.status === 401 || err.response.status === 422) {
          console.error('Authentication error - token may be invalid');
          setJournals([]);
          return [];
        } else if (err.response.status === 404) {
          console.error('Journals not found - may not exist for this system');
          setJournals([]);
          return [];
        }
      }
      
      // For other errors, still return empty array to prevent cascading errors
      setJournals([]);
      return [];
    }
  };

  const getJournals = async () => {
    try {
      // Check if system exists
      if (!system || !system.id) {
        console.error('Cannot fetch journals: No system available');
        return []; // Return empty array if no system
      }
      
      // Use the fetchJournals function
      return await fetchJournals(system.id);
    } catch (err) {
      console.error('Unexpected error in getJournals:', err);
      setJournals([]);
      return [];
    }
  };

  const addJournal = async (journalData) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/journals`, journalData);
      
      // Refresh journals list after adding
      if (response.data.success) {
        await getJournals();
      }
      
      return response.data;
    } catch (err) {
      console.error('Error adding journal:', err);
      if (err.response) {
         console.error("API Error Response:", err.response.data); 
         throw err; // Rethrow the original error object
      }
      throw err; // Rethrow if it's not an axios error
    }
  };

  // --- NEW: Function to delete a journal entry ---
  const deleteJournal = async (journalId) => {
    try {
      const response = await axios.delete(`${API_BASE_URL}/api/journals/${journalId}`);
      
      // Refresh journals list after deleting
      if (response.data.success) {
        await getJournals(); 
      }
      
      return response.data;
    } catch (err) {
      console.error(`Error deleting journal ${journalId}:`, err);
      if (err.response) {
         console.error("API Error Response:", err.response.data);
         // Rethrow to allow JournalPage to catch and display the specific error
         throw err; 
      }
      // Rethrow for non-API errors
      throw err;
    }
  };
  // --- END NEW ---

  const addRelationship = async (relationshipData) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/relationships`, relationshipData);
      await fetchSystem(); // Refresh entire system to get new relationship
      return response.data;
    } catch (err) {
      console.error('Error adding relationship:', err);
      setError('Failed to add relationship');
      throw err;
    }
  };

  const updateRelationship = async (relationshipId, updates) => {
    try {
      const response = await axios.put(
        `${API_BASE_URL}/api/relationships/${relationshipId}`, 
        updates
      );
      await fetchSystem();
      return response.data;
    } catch (err) {
      console.error('Error updating relationship:', err);
      throw err;
    }
  };

  const deleteRelationship = async (relationshipId) => {
    try {
      await axios.delete(`${API_BASE_URL}/api/relationships/${relationshipId}`);
      await fetchSystem();
    } catch (err) {
      console.error('Error deleting relationship:', err);
      throw err;
    }
  };

  const deletePart = async (partId) => {
    try {
      await axios.delete(`${API_BASE_URL}/api/parts/${partId}`);
      await fetchSystem(); // Refresh system data
    } catch (err) {
      console.error('Error deleting part:', err);
      throw err;
    }
  };

  const updatePartOrder = async (newOrder) => {
    try {
      await axios.put(`${API_BASE_URL}/api/parts/order`, { order: newOrder });
      await fetchSystem(); // Refresh system data
    } catch (err) {
      console.error('Error updating part order:', err);
      throw err;
    }
  };

  const value = {
    system,
    loading,
    error,
    journals,
    fetchSystem,
    addPart,
    updatePart,
    deletePart,
    fetchJournals,
    getJournals,
    addJournal,
    deleteJournal,
    addRelationship,
    updateRelationship,
    deleteRelationship,
    updatePartOrder,
    isAuthenticated,
  };

  return (
    <IFSContext.Provider value={value}>
      {children}
    </IFSContext.Provider>
  );
}; 