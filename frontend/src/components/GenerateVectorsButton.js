import React, { useState } from 'react';
import {
  Button,
  CircularProgress,
  Snackbar,
  Alert
} from '@mui/material';
import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest';
import axios from 'axios';
import { useIFS } from '../context/IFSContext';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

/**
 * Button component for generating personality vectors for a part.
 * This component sends a request to generate vector embeddings for the part,
 * which enables semantic search functionality.
 */
const GenerateVectorsButton = ({ partId, variant = 'outlined', size = 'medium' }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'info'
  });
  const { system } = useIFS();
  const part = system?.parts[partId];

  const handleGenerateVectors = async () => {
    if (!partId || !part) return;
    
    setIsLoading(true);
    
    try {
      // Create attributes object with descriptions for the part
      const attributes = {
        role: part.role || '',
        description: part.description || '',
        personality: `${part.name} is a part with the following characteristics: ${part.description}. 
          ${part.feelings?.length ? `Feelings: ${part.feelings.join(', ')}. ` : ''}
          ${part.beliefs?.length ? `Beliefs: ${part.beliefs.join(', ')}. ` : ''}
          ${part.needs?.length ? `Needs: ${part.needs.join(', ')}. ` : ''}
          ${part.triggers?.length ? `Triggers: ${part.triggers.join(', ')}. ` : ''}`
      };
      
      // Add individual feeling, belief, need vectors if they exist
      if (part.feelings?.length) {
        part.feelings.forEach((feeling, index) => {
          attributes[`feeling_${index}`] = feeling;
        });
      }
      
      if (part.beliefs?.length) {
        part.beliefs.forEach((belief, index) => {
          attributes[`belief_${index}`] = belief;
        });
      }
      
      if (part.needs?.length) {
        part.needs.forEach((need, index) => {
          attributes[`need_${index}`] = need;
        });
      }
      
      if (part.triggers?.length) {
        part.triggers.forEach((trigger, index) => {
          attributes[`trigger_${index}`] = trigger;
        });
      }
      
      const response = await axios.post(
        `${API_BASE_URL}/api/parts/${partId}/personality-vectors`,
        { attributes }
      );
      
      setSnackbar({
        open: true,
        message: 'Personality profile generated successfully!',
        severity: 'success'
      });
      
    } catch (err) {
      console.error('Error generating vectors:', err);
      
      setSnackbar({
        open: true,
        message: 'Failed to generate personality profile. Please try again.',
        severity: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        color="primary"
        onClick={handleGenerateVectors}
        disabled={isLoading}
        startIcon={isLoading ? <CircularProgress size={20} /> : <SettingsSuggestIcon />}
      >
        {isLoading ? 'Processing...' : 'Generate Personality Profile'}
      </Button>
      
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleCloseSnackbar} 
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default GenerateVectorsButton; 