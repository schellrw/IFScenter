import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useIFS } from '../context/IFSContext';
import {
  Container,
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  ListItemAvatar,
  ListItemSecondaryAction,
  Avatar,
  Button,
  TextField,
  InputAdornment,
  IconButton,
  Alert,
  CircularProgress,
  Divider,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import ChatIcon from '@mui/icons-material/Chat';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DescriptionIcon from '@mui/icons-material/Description';
import axios from 'axios';

let API_BASE_URL;
if (process.env.REACT_APP_API_URL === undefined || process.env.REACT_APP_API_URL === null) {
  // If not defined, use a default based on environment
  API_BASE_URL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000';
} else {
  // Otherwise use the provided value
  API_BASE_URL = process.env.REACT_APP_API_URL;
}
// Remove any quotation marks that might have been included in the environment variable
API_BASE_URL = API_BASE_URL.replace(/[^\w:/.-]/g, ''); // More robust cleaning
// Ensure API_BASE_URL doesn't end with a slash
API_BASE_URL = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;

const GuidedSessionsPage = () => {
  const navigate = useNavigate();
  const { system, loading: systemLoading } = useIFS();
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState(null);
  
  useEffect(() => {
    if (!systemLoading) {
      fetchSessions();
    }
  }, [systemLoading]);

  const fetchSessions = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const response = await axios.get(`${API_BASE_URL}/api/guided-sessions`);
      setSessions(response.data.sessions || []);
    } catch (err) {
      console.error('Error fetching guided sessions:', err);
      setError('Failed to load guided sessions. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const createNewSession = async () => {
    if (isCreating || !system?.id) {
      if (!system?.id) {
        setError('Cannot create session: No active system found.');
      }
      return;
    }

    setIsCreating(true);
    setIsLoading(true);
    setError('');
    
    try {
      const response = await axios.post(`${API_BASE_URL}/api/guided-sessions`, {
        system_id: system.id,
      });

      const newSession = response.data.session;
      if (newSession && newSession.id) {
        navigate(`/session/${newSession.id}`);
      } else {
        throw new Error('Failed to get new session details from response.');
      }
    } catch (err) {
      console.error('Error creating new guided session:', err);
      setError('Failed to create a new session. Please try again.');
      setIsLoading(false);
      setIsCreating(false);
    }
  };

  const handleDeleteClick = (session) => {
    setSessionToDelete(session);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!sessionToDelete) return;
    
    setIsLoading(true);
    setDeleteDialogOpen(false);
    
    try {
      await axios.delete(`${API_BASE_URL}/api/guided-sessions/${sessionToDelete.id}`);
      
      fetchSessions();
      
    } catch (err) {
      console.error('Error deleting session:', err);
      setError('Failed to delete session. Please try again.');
      setIsLoading(false);
    } finally {
      setSessionToDelete(null);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      fetchSessions();
      return;
    }
    console.log("Search functionality not yet implemented for sessions.");
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      // handleSearch(); // Re-enable when search is implemented
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';

      const today = new Date();
      if (date.toDateString() === today.toDateString()) {
        return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }

      return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      console.error("Error formatting date:", e);
      return 'Invalid Date';
    }
  };

  if (systemLoading) {
    return (
      <Container sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (!system) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="warning">
          No IFS system selected or found. Please create or select a system first.
          <Button onClick={() => navigate('/systems')} sx={{ ml: 2 }}>Go to Systems</Button>
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="md">
      <Box sx={{ my: 4 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/')}
          sx={{ mb: 2 }}
        >
          Back to Dashboard
        </Button>

        <Typography variant="h4" component="h1" sx={{ mb: 3 }}>
          Guided IFS Sessions
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Paper sx={{ p: 2, mb: 3 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={createNewSession}
            disabled={isCreating || isLoading}
            fullWidth
          >
            {isCreating ? 'Starting Session...' : 'Start New Guided Session'}
          </Button>
        </Paper>

        <Paper elevation={1}>
          {isLoading && !isCreating ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : sessions.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body1" color="text.secondary">
                No guided sessions found.
              </Typography>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={createNewSession}
                disabled={isCreating}
                sx={{ mt: 2 }}
              >
                Start your first session
              </Button>
            </Box>
          ) : (
            <List>
              {sessions.map((session, index) => (
                <React.Fragment key={session.id}>
                  {index > 0 && <Divider component="li" />}
                  <ListItem
                    disablePadding
                    secondaryAction={
                      <IconButton
                        edge="end"
                        aria-label="delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(session);
                        }}
                        disabled={isLoading}
                      >
                        <DeleteIcon />
                      </IconButton>
                    }
                  >
                    <ListItemButton
                      onClick={() => navigate(`/session/${session.id}`)}
                      disabled={isLoading || isCreating}
                    >
                      <ListItemAvatar>
                        <Avatar sx={{ bgcolor: 'primary.light' }}>
                          <DescriptionIcon />
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={session.title || `Session started ${formatDate(session.created_at)}`}
                        secondary={
                          <>
                            <Typography
                              component="span"
                              variant="body2"
                              color="text.primary"
                              sx={{ display: 'block' }}
                            >
                              Last updated: {formatDate(session.updated_at)}
                            </Typography>
                            {session.summary && (
                              <Typography component="span" variant="body2" color="text.secondary">
                                Summary: {session.summary}
                              </Typography>
                            )}
                          </>
                        }
                        primaryTypographyProps={{
                          fontWeight: 'medium',
                          noWrap: true
                        }}
                        secondaryTypographyProps={{
                          noWrap: true
                        }}
                      />
                    </ListItemButton>
                  </ListItem>
                </React.Fragment>
              ))}
            </List>
          )}
        </Paper>
      </Box>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">Delete Guided Session</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Are you sure you want to delete this session and all its messages? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmDelete} color="error" autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default GuidedSessionsPage; 