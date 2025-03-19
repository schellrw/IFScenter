/**
 * Debug helper to diagnose React rendering issues
 */
import React, { useEffect } from 'react';
import { Box, Typography, Paper } from '@mui/material';

/**
 * A simple component to show debug information about component rendering
 */
export const DebugInfo = ({ location, data }) => {
  // Log to console for debugging
  useEffect(() => {
    console.log(`Debug [${location}]:`, data);
  }, [location, data]);

  return (
    <Paper sx={{ p: 2, mb: 2, backgroundColor: '#f5f5f5' }}>
      <Typography variant="h6" sx={{ mb: 1 }}>Debug Info: {location}</Typography>
      <Box sx={{ 
        maxHeight: '200px', 
        overflow: 'auto',
        p: 1,
        backgroundColor: '#eeeeee',
        fontFamily: 'monospace',
        fontSize: '0.8rem',
        whiteSpace: 'pre-wrap'
      }}>
        {JSON.stringify(data, null, 2)}
      </Box>
    </Paper>
  );
};

/**
 * Injects this debug script into any existing page
 */
export const injectDebugger = () => {
  // Add to global window object for console debugging
  window.debugApp = {
    logState: (stateName, stateValue) => {
      console.log(`%c React State [${stateName}]: `, 'background: #222; color: #bada55', stateValue);
    },
    checkContext: () => {
      try {
        const contextElements = document.querySelectorAll('[data-context]');
        console.log('Found context providers:', contextElements.length);
        contextElements.forEach(el => {
          console.log(`Context: ${el.getAttribute('data-context')}`);
        });
      } catch (e) {
        console.error('Error checking context:', e);
      }
    }
  };

  console.log('%c IFS-Assistant Debugger Loaded', 'background: #222; color: #bada55; font-size: 16px;');
  console.log('Use window.debugApp to access debugging utilities');
  
  // Check if important context providers exist
  setTimeout(() => {
    window.debugApp.checkContext();
  }, 1000);
  
  return true;
};

export default { DebugInfo, injectDebugger }; 