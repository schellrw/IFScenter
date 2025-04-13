import React, { useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useIFS } from '../context/IFSContext';
import {
  Container,
  Typography,
  Box,
  Paper,
  Button,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { InputField, TextArea, RoleSelector, FeelingsInput, ListInput } from '../components';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChatIcon from '@mui/icons-material/Chat';
import HistoryIcon from '@mui/icons-material/History';
import { ROLE_OPTIONS } from '../constants';
import GenerateVectorsButton from '../components/GenerateVectorsButton';

// Helper function to safely parse list-like fields
const parseListField = (fieldValue) => {
  if (Array.isArray(fieldValue)) {
    return fieldValue; // Already an array
  }
  if (typeof fieldValue === 'string') {
    try {
      // Attempt to parse the string
      // Replace single quotes with double quotes for valid JSON before parsing
      const parsed = JSON.parse(fieldValue.replace(/'/g, '"')); 
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('Failed to parse list field:', fieldValue, e);
      return []; // Return empty array on failure
    }
  }
  return []; // Default to empty array
};

const PartDetailsPage = () => {
  const { partId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { system, updatePart, deletePart } = useIFS();
  const [isEditing, setIsEditing] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [error, setError] = useState('');

  const part = system?.parts[partId];

  // Memoize parsed fields to avoid re-parsing on every render
  const parsedFeelings = useMemo(() => parseListField(part?.feelings), [part?.feelings]);
  const parsedBeliefs = useMemo(() => parseListField(part?.beliefs), [part?.beliefs]);
  const parsedTriggers = useMemo(() => parseListField(part?.triggers), [part?.triggers]);
  const parsedNeeds = useMemo(() => parseListField(part?.needs), [part?.needs]);

  const [formData, setFormData] = useState({});

  // Effect to update formData when part data changes (including after initial load)
  // or when editing starts/stops, ensuring parsed values are used.
  React.useEffect(() => {
    if (part) {
        setFormData({
            ...part,
            feelings: parsedFeelings,
            beliefs: parsedBeliefs,
            triggers: parsedTriggers,
            needs: parsedNeeds,
        });
    } else {
        // Handle case where part becomes undefined (e.g., after deletion?)
        setFormData({});
    }
  }, [part, parsedFeelings, parsedBeliefs, parsedTriggers, parsedNeeds]); // Depend on part and parsed values

  // Get the backLink from URL params
  const backLink = searchParams.get('backLink');
  
  // Get the navigation source from location state (if it exists)
  const navigationSource = location.state?.from;

  // Update the back button
  const handleBack = () => {
    if (navigationSource === 'dashboard') {
      navigate('/'); // Root path is the Dashboard
    } else if (navigationSource === 'system-map' || backLink === 'system-map') {
      navigate('/system-map');
    } else {
      navigate('/parts');
    }
  };

  // Determine the button text based on navigation source or backLink parameter
  const getBackButtonText = () => {
    if (navigationSource === 'dashboard') {
      return 'Back to Dashboard';
    } else if (navigationSource === 'system-map' || backLink === 'system-map') {
      return 'Back to System Map';
    } else {
      return 'Back to Parts';
    }
  };

  if (!part) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">Part not found</Alert>
      </Container>
    );
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    try {
      // Debug current part and formData
      console.log('Current part:', part);
      console.log('Original formData:', formData);
      
      // Create a clean version of the form data with only valid fields
      const cleanData = {
        // Include only the fields that are valid for a part update
        name: formData.name || part.name,
        role: formData.role,
        description: formData.description,
        feelings: Array.isArray(formData.feelings) 
          ? formData.feelings.filter(item => item && item.trim() !== '') 
          : [],
        beliefs: Array.isArray(formData.beliefs) 
          ? formData.beliefs.filter(item => item && item.trim() !== '') 
          : [],
        triggers: Array.isArray(formData.triggers) 
          ? formData.triggers.filter(item => item && item.trim() !== '') 
          : [],
        needs: Array.isArray(formData.needs) 
          ? formData.needs.filter(item => item && item.trim() !== '') 
          : []
      };
      
      // Add system_id for validation if available
      if (system?.id) {
        cleanData.system_id = system.id;
        console.log(`Setting system_id from system: ${system.id}`);
      } else if (part.system_id) {
        cleanData.system_id = part.system_id;
        console.log(`Setting system_id from part: ${part.system_id}`);
      }
      
      console.log('Final data to send:', cleanData);
      
      await updatePart(partId, cleanData);
      setIsEditing(false);
      setError('');
    } catch (err) {
      setError('Failed to update part');
      console.error('Error updating part:', err);
    }
  };

  const handleDelete = async () => {
    try {
      await deletePart(partId);
      if (navigationSource === 'dashboard') {
        navigate('/'); // Root path is the Dashboard
      } else if (navigationSource === 'system-map') {
        navigate('/system-map');
      } else {
        navigate('/parts');
      }
    } catch (err) {
      setError('Failed to delete part');
      console.error('Error deleting part:', err);
    }
  };

  return (
    <Container maxWidth="md">
      <Box sx={{ my: 4 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={handleBack}
          sx={{ mb: 2 }}
        >
          {getBackButtonText()}
        </Button>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h4" component="h1">
            {isEditing ? 'Edit Part' : part.name}
          </Typography>
          <Stack direction="row" spacing={2}>
            {!isEditing && (
              <>
                <Button
                  variant="outlined"
                  startIcon={<EditIcon />}
                  onClick={() => setIsEditing(true)}
                >
                  Edit
                </Button>
                {part?.name !== 'Self' && (
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => setDeleteDialog(true)}
                  >
                    Delete
                  </Button>
                )}
              </>
            )}
          </Stack>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Paper sx={{ p: 3 }}>
          {isEditing ? (
            <Stack spacing={2}>
              <InputField
                label="Part Name"
                value={formData.name}
                onChange={(value) => handleChange('name', value)}
                required
              />

              <RoleSelector
                label="Role"
                options={ROLE_OPTIONS}
                value={formData.role}
                onChange={(value) => handleChange('role', value)}
              />

              <TextArea
                label="Description"
                value={formData.description}
                onChange={(value) => handleChange('description', value)}
              />

              <FeelingsInput
                label="Associated Feelings"
                value={formData.feelings || []}
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
                <Button onClick={() => setIsEditing(false)}>Cancel</Button>
                <Button variant="contained" onClick={handleSave}>
                  Save Changes
                </Button>
              </Box>
            </Stack>
          ) : (
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Role</Typography>
                <Typography>{part.role || 'No role specified'}</Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" color="text.secondary">Description</Typography>
                <Typography>{part.description || 'No description'}</Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" color="text.secondary">Feelings</Typography>
                <Typography>{parsedFeelings.join(', ') || 'No feelings specified'}</Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" color="text.secondary">Core Beliefs</Typography>
                <ul>
                  {parsedBeliefs.length > 0 ? (
                     parsedBeliefs.map((belief, index) => <li key={index}>{belief}</li>)
                   ) : (
                     <Typography component="li" sx={{ listStyle: 'none' }}>No beliefs specified</Typography>
                   )}
                </ul>
              </Box>

              <Box>
                <Typography variant="subtitle2" color="text.secondary">Triggers</Typography>
                <ul>
                   {parsedTriggers.length > 0 ? (
                     parsedTriggers.map((trigger, index) => <li key={index}>{trigger}</li>)
                   ) : (
                     <Typography component="li" sx={{ listStyle: 'none' }}>No triggers specified</Typography>
                   )}
                </ul>
              </Box>

              <Box>
                <Typography variant="subtitle2" color="text.secondary">Needs</Typography>
                 <ul>
                   {parsedNeeds.length > 0 ? (
                      parsedNeeds.map((need, index) => <li key={index}>{need}</li>)
                   ) : (
                      <Typography component="li" sx={{ listStyle: 'none' }}>No needs specified</Typography>
                   )}
                </ul>
              </Box>
            </Stack>
          )}
        </Paper>

        <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)}>
          <DialogTitle>Delete Part</DialogTitle>
          <DialogContent>
            Are you sure you want to delete {part.name}? This action cannot be undone.
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDialog(false)}>Cancel</Button>
            <Button onClick={handleDelete} color="error" variant="contained">
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Container>
  );
};

export default PartDetailsPage; 