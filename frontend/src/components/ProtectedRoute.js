import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CircularProgress, Box } from '@mui/material';

export const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }
  
  if (!isAuthenticated) {
    console.log('[ProtectedRoute] Not authenticated after loading, redirecting to login.');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  console.log('[ProtectedRoute] Authenticated, rendering children.');
  return children;
};

export default ProtectedRoute; 