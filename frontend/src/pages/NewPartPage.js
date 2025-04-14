import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIFS } from '../context/IFSContext';
import { useAuth } from '../context/AuthContext';
import {
  Container,
  Typography,
  Box,
  Paper,
  Button,
  Stack,
  Alert,
  CircularProgress
} from '@mui/material';
import { InputField, TextArea, RoleSelector, FeelingsInput, ListInput } from '../components';
import { ROLE_OPTIONS } from '../constants';

// const ROLE_OPTIONS = [
//   { value: 'protector', label: 'Protector' },
//   { value: 'exile', label: 'Exile' },
//   { value: 'manager', label: 'Manager' },
//   { value: 'firefighter', label: 'Firefighter' },
//   { value: 'self', label: 'Self' },
// ];

const NewPartPage = () => {
  const navigate = useNavigate();
  const { addPart, system, loading: ifsLoading } = useIFS();
  const { isAuthenticated, token, loading: authLoading } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    description: '',
    feelings: [],
    beliefs: [],
    triggers: [],
    needs: [],
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Check authentication on mount
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      console.log('User not authenticated, redirecting to login');
      setError('You must be logged in to create parts');
      // Could redirect to login page here if desired
      // navigate('/login');
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Check if we have a system
  useEffect(() => {
    if (!ifsLoading && !system) {
      console.log('No system available, might need to create one first');
      setError('You need to create a system before adding parts');
    }
  }, [system, ifsLoading]);

  const handleChange = (field, value) => {
    console.log(`NewPartPage - Updating ${field}:`, value);
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('NewPartPage - Submitting form data:', formData);
    
    // Validate form
    if (!formData.name.trim()) {
      setError('Part name is required');
      return;
    }

    // Check authentication
    if (!isAuthenticated || !token) {
      setError('You must be logged in to create parts');
      console.error('Cannot create part: Not authenticated or missing token');
      return;
    }

    // Check system
    if (!system) {
      setError('System not available. Please create a system first.');
      console.error('Cannot create part: No system available');
      return;
    }

    // Debug system object
    console.log('System object before part creation:', system);
    console.log('System ID:', system.id);
    console.log('Authentication token status:', !!token);
    console.log('System object (JSON):', JSON.stringify(system, null, 2));
    console.log('Existing parts:', system.parts ? Object.keys(system.parts).length : 'none');
    
    try {
      setError('');
      setSaving(true);
      console.log('Calling addPart with data:', JSON.stringify(formData, null, 2));
      
      const result = await addPart(formData);
      console.log('Part created successfully, result:', result);
      navigate('/parts');
    } catch (err) {
      console.error('Error creating part:', err);
      
      // Enhanced error handling
      const errorMessage = err.message || 'Unknown error';
      
      // Handle specific error messages
      if (errorMessage.includes('Authentication token not available')) {
        setError('Authentication error. Please log out and log in again.');
      } else if (err.response?.status === 401) {
        setError('Authentication failed. Please log in again.');
      } else if (err.response?.status === 500) {
        // More detailed error for server errors
        const serverError = err.response?.data?.error || 'Internal server error';
        setError(`Server error: ${serverError}. Please try again or contact support.`);
        console.error('Server error details:', err.response?.data);
      } else {
        setError(`Failed to create part: ${errorMessage}`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container maxWidth="md">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Create New Part
        </Typography>
        
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}
        
        {!isAuthenticated && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            You must be logged in to create parts
          </Alert>
        )}
        
        {!system && !ifsLoading && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            No system found. You need a system before you can create parts.
          </Alert>
        )}
        
        <Paper sx={{ p: 3 }}>
          <form onSubmit={handleSubmit}>
            <Stack spacing={3}>
              <InputField
                label="Part Name"
                value={formData.name}
                onChange={(value) => handleChange('name', value)}
                required={true}
              />
              
              <RoleSelector
                label="Role"
                value={formData.role}
                options={ROLE_OPTIONS}
                onChange={(value) => handleChange('role', value)}
              />
              
              <TextArea
                label="Description"
                value={formData.description}
                onChange={(value) => handleChange('description', value)}
                rows={4}
              />

              <FeelingsInput
                label="Associated Feelings"
                value={formData.feelings}
                onChange={(value) => handleChange('feelings', value)}
              />

              <ListInput
                label="Core Beliefs"
                value={formData.beliefs || []}
                onChange={(value) => handleChange('beliefs', value)}
                placeholder="Enter a core belief..."
              />

              <ListInput
                label="Triggers"
                value={formData.triggers || []}
                onChange={(value) => handleChange('triggers', value)}
                placeholder="Enter a trigger..."
              />

              <ListInput
                label="Needs"
                value={formData.needs || []}
                onChange={(value) => handleChange('needs', value)}
                placeholder="Enter a need..."
              />

              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                <Button
                  variant="outlined"
                  onClick={() => navigate('/parts')}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Create Part'}
                </Button>
              </Box>
            </Stack>
          </form>
        </Paper>
      </Box>
    </Container>
  );
};

export default NewPartPage; 