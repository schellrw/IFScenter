import React from 'react';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogContentText, 
  DialogActions, 
  Button,
  LinearProgress,
  Box,
  Typography 
} from '@mui/material';
import { useAuth } from '../context/AuthContext';

const formatTimeRemaining = (ms) => {
  if (!ms) return '0:00';
  
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const SessionExpiryWarning = () => {
  const { showExpiryWarning, remainingTime, extendSession, logout } = useAuth();
  
  // Calculate progress for the LinearProgress component
  // Starting from WARNING_BEFORE_TIMEOUT (60 seconds) down to 0
  const WARNING_PERIOD = 60 * 1000; // 60 seconds in ms
  const progress = remainingTime ? Math.max(0, Math.min(100, (remainingTime / WARNING_PERIOD) * 100)) : 0;
  
  if (!showExpiryWarning) {
    return null;
  }
  
  return (
    <Dialog
      open={showExpiryWarning}
      onClose={extendSession}
      aria-labelledby="session-expiry-title"
      aria-describedby="session-expiry-description"
    >
      <DialogTitle id="session-expiry-title">
        Session Expiring Soon
      </DialogTitle>
      <DialogContent>
        <DialogContentText id="session-expiry-description">
          Your session is about to expire due to inactivity. 
          You will be logged out in:
        </DialogContentText>
        <Box sx={{ mt: 2, mb: 1 }}>
          <Typography variant="h4" align="center">
            {formatTimeRemaining(remainingTime)}
          </Typography>
        </Box>
        <LinearProgress 
          variant="determinate" 
          value={progress} 
          color="error"
          sx={{ height: 10, borderRadius: 5 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={logout} color="error">
          Logout Now
        </Button>
        <Button onClick={extendSession} color="primary" variant="contained" autoFocus>
          Stay Logged In
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SessionExpiryWarning; 