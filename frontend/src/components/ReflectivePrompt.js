import React from 'react';
import { Paper, Typography, Box, Button } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';

export const ReflectivePrompt = ({ text, onRefresh }) => {
  // Prevent event bubbling when refresh button is clicked
  const handleRefreshClick = (e) => {
    if (e) e.stopPropagation();
    if (onRefresh) {
      console.log('ReflectivePrompt: refresh button clicked');
      onRefresh();
    }
  };
  
  return (
    <Paper sx={{ p: 2, mb: 2, bgcolor: 'primary.light' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography 
          variant="body1" 
          color="primary.contrastText"
          sx={{ fontStyle: 'italic', flex: 1 }}
        >
          {text}
        </Typography>
        {onRefresh && (
          <Button 
            variant="text" 
            color="inherit" 
            size="small"
            onClick={handleRefreshClick}
            startIcon={<RefreshIcon />}
            sx={{ ml: 2, color: 'white' }}
          >
            New Prompt
          </Button>
        )}
      </Box>
    </Paper>
  );
}; 