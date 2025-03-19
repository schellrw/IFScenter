import React, { useState, useEffect } from 'react';
import { Paper, Typography, Box, Button } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { REFLECTIVE_PROMPTS } from '../constants';

// Completely standalone component that manages its own prompt state
export const JournalPrompt = ({ initialPrompt }) => {
  // Internal state for the prompt text
  const [promptText, setPromptText] = useState(initialPrompt || '');
  
  // Initialize from props or get a random prompt
  useEffect(() => {
    if (initialPrompt) {
      setPromptText(initialPrompt);
    } else {
      // If no initial prompt, select a random one
      const randomIndex = Math.floor(Math.random() * REFLECTIVE_PROMPTS.length);
      setPromptText(REFLECTIVE_PROMPTS[randomIndex]);
    }
  }, [initialPrompt]);
  
  // Get a different prompt that's not the current one
  const getNewPrompt = () => {
    const currentPrompts = [...REFLECTIVE_PROMPTS];
    const currentIndex = currentPrompts.indexOf(promptText);
    
    // Remove current prompt from options
    if (currentIndex > -1) {
      currentPrompts.splice(currentIndex, 1);
    }
    
    // Get random prompt from remaining options
    const randomIndex = Math.floor(Math.random() * currentPrompts.length);
    return currentPrompts[randomIndex];
  };
  
  // Handle button click
  const handleNewPrompt = () => {
    console.log('JournalPrompt: New prompt button clicked');
    const newPrompt = getNewPrompt();
    console.log('JournalPrompt: Setting new prompt:', newPrompt);
    
    // Update our internal state
    setPromptText(newPrompt);
    
    // Also update localStorage to stay in sync with the rest of the app
    localStorage.setItem('currentJournalPrompt', newPrompt);
  };
  
  return (
    <Paper sx={{ p: 2, mb: 2, bgcolor: 'primary.light' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography 
          variant="body1" 
          color="primary.contrastText"
          sx={{ fontStyle: 'italic', flex: 1 }}
        >
          {promptText}
        </Typography>
        <Button 
          variant="text" 
          color="inherit" 
          size="small"
          onClick={handleNewPrompt}
          startIcon={<RefreshIcon />}
          sx={{ ml: 2, color: 'white' }}
        >
          New Prompt
        </Button>
      </Box>
    </Paper>
  );
}; 