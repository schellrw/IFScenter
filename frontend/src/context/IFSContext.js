import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

const IFSContext = createContext();

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

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
  const [localToken, setLocalToken] = useState(null);

  // Keep local token in sync with auth token
  useEffect(() => {
    if (authToken) {
      console.log(`IFSContext received new token: ${authToken.substring(0, 10)}...`);
      setLocalToken(authToken);
    } else {
      setLocalToken(null);
    }
  }, [authToken]);

  useEffect(() => {
    if (isAuthenticated && localToken) {
      console.log(`IFSContext using token for fetchSystem: ${localToken.substring(0, 10)}...`);
      fetchSystem();
    } else {
      console.log('IFSContext: Not authenticated or no token available');
      setSystem(null);
      setLoading(false);
    }
  }, [isAuthenticated, localToken]);

  const fetchSystem = async () => {
    try {
      setLoading(true);
      
      // Check if token is available before making API call
      if (!localToken) {
        console.error('No authentication token available for fetchSystem');
        setError('Authentication required. Please log in.');
        return;
      }
      
      console.log(`Using token for fetchSystem: ${localToken.substring(0, 10)}...`);
      
      const response = await axios.get(`${API_BASE_URL}/api/system`, {
        headers: {
          'Authorization': `Bearer ${localToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('System fetched successfully:', response.data);
      console.log('System ID:', response.data.id);
      console.log('Parts count:', response.data.parts_count);
      console.log('Parts:', Object.keys(response.data.parts || {}).length);
      
      setSystem(response.data);
      setError(null);
      
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
      // Check if token is available before making API call
      if (!localToken) {
        console.error('No authentication token available for API call');
        throw new Error('Authentication token not available. Please log in again.');
      }
      
      console.log(`Using token for API call: ${localToken.substring(0, 10)}...`);
      
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

      const response = await axios.post(`${API_BASE_URL}/api/parts`, formattedPart, {
        headers: {
          'Authorization': `Bearer ${localToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Part created successfully:', response.data);
      await fetchSystem(); // Refresh system data
      return response.data;
    } catch (err) {
      console.error('Error adding part:', err);
      
      // Check for specific error types
      if (err.response) {
        if (err.response.status === 401) {
          console.error('Authentication error: Token may be invalid or expired');
        } else if (err.response.status === 400) {
          console.error('Bad request - server response:', err.response.data);
          if (err.response.data.details) {
            console.error('Validation errors:', err.response.data.details);
          }
          throw new Error(`Bad request: ${JSON.stringify(err.response.data)}`);
        }
      }
      
      throw err;
    }
  };

  const updatePart = async (partId, updates) => {
    try {
      console.log('Sending update with data:', JSON.stringify(updates, null, 2));
      const response = await axios.put(`${API_BASE_URL}/api/parts/${partId}`, updates, {
        headers: {
          'Authorization': `Bearer ${localToken}`
        }
      });
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
      // Make sure we have a token
      if (!localToken) {
        console.error('Cannot fetch journals: No authentication token available');
        return [];
      }
      
      console.log('Fetching journals with token:', localToken ? `${localToken.substring(0, 10)}...` : 'none');
      console.log('Using system ID for journals:', systemId);
      
      const response = await axios.get(`${API_BASE_URL}/api/journals`, {
        headers: {
          'Authorization': `Bearer ${localToken}`,
          'Content-Type': 'application/json'
        },
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
      // Make sure we have a token
      if (!localToken) {
        console.error('Cannot fetch journals: No authentication token available');
        return []; // Return empty array instead of throwing error
      }
      
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
      // Ensure required fields are present
      const validatedData = {
        title: journalData.title || `Journal Entry ${new Date().toLocaleString()}`,
        content: journalData.content || '',
        part_id: journalData.part_id || null,
        metadata: journalData.metadata || ''
      };

      const response = await axios.post(`${API_BASE_URL}/api/journals`, validatedData, {
        headers: {
          'Authorization': `Bearer ${localToken}`
        }
      });
      await getJournals(); // Refresh journals data
      return response.data;
    } catch (err) {
      console.error('Error adding journal entry:', err);
      throw err;
    }
  };

  const addRelationship = async (relationshipData) => {
    try {
      console.log('IFSContext: Sending relationship data:', relationshipData);
      const response = await axios.post(`${API_BASE_URL}/api/relationships`, relationshipData, {
        headers: {
          'Authorization': `Bearer ${localToken}`
        }
      });
      console.log('IFSContext: Server response:', response.data);
      await fetchSystem(); // Refresh system data
      return response.data;
    } catch (err) {
      console.error('IFSContext: Error adding relationship:', err.response?.data || err);
      throw new Error(err.response?.data?.error || err.message);
    }
  };

  const updateRelationship = async (relationshipId, updates) => {
    try {
      const response = await axios.put(
        `${API_BASE_URL}/api/relationships/${relationshipId}`, 
        updates,
        {
          headers: {
            'Authorization': `Bearer ${localToken}`
          }
        }
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
      await axios.delete(`${API_BASE_URL}/api/relationships/${relationshipId}`, {
        headers: {
          'Authorization': `Bearer ${localToken}`
        }
      });
      await fetchSystem();
    } catch (err) {
      console.error('Error deleting relationship:', err);
      throw err;
    }
  };

  const deletePart = async (partId) => {
    try {
      await axios.delete(`${API_BASE_URL}/api/parts/${partId}`, {
        headers: {
          'Authorization': `Bearer ${localToken}`
        }
      });
      await fetchSystem(); // Refresh system data
    } catch (err) {
      console.error('Error deleting part:', err);
      throw err;
    }
  };

  const updatePartOrder = async (newOrder) => {
    try {
      await axios.put(`${API_BASE_URL}/api/parts/order`, { order: newOrder }, {
        headers: {
          'Authorization': `Bearer ${localToken}`
        }
      });
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
    updatePartOrder,
    addJournal,
    getJournals,
    fetchJournals,
    addRelationship,
    updateRelationship,
    deleteRelationship,
    deletePart
  };

  return (
    <IFSContext.Provider value={value}>
      {children}
    </IFSContext.Provider>
  );
}; 