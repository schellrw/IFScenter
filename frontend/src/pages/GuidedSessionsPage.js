import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useIFS } from '../context/IFSContext';
import { useAuth } from '../context/AuthContext';
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
  Snackbar
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import ChatIcon from '@mui/icons-material/Chat';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DescriptionIcon from '@mui/icons-material/Description';
import axios from 'axios';
import { TIER_LIMITS } from '../constants';

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
  const { currentUser } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('info');
  
  useEffect(() => {
    if (!systemLoading) {
      fetchSessions();
    }
  }, [systemLoading]);

  const handleSnackbarClose = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbarOpen(false);
  };

  const fetchSessions = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const response = await axios.get(`${API_BASE_URL}/api/guided-sessions`);
      const fetchedSessions = response.data.sessions || [];
      
      // Sort sessions by updated_at descending
      fetchedSessions.sort((a, b) => {
        const dateA = a.updated_at ? new Date(a.updated_at) : new Date(0);
        const dateB = b.updated_at ? new Date(b.updated_at) : new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      
      setSessions(fetchedSessions);
    } catch (err) {
      console.error('Error fetching guided sessions:', err);
      setError('Failed to load guided sessions. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Function to check daily message limit (uses currentUser from useAuth and TIER_LIMITS)
  const checkMessageLimit = () => {
    console.log("[Limit Check] checkMessageLimit called."); // Log entry
    if (!currentUser) { // Check currentUser from useAuth
      console.error("[Limit Check] User auth context not available for limit check.");
      return false; // Cannot check limit
    }
    const tier = currentUser.subscription_tier || 'free'; // Default to free if tier is missing
    console.log(`[Limit Check] User Tier: ${tier}`); // Log tier
    
    if (tier === 'unlimited') {
      console.log("[Limit Check] User is unlimited. Limit check bypassed.");
      return false; // Unlimited users never reach the limit
    }
    
    // Get limit from constants
    const limit = TIER_LIMITS[tier]?.messages || TIER_LIMITS.free.messages;
    
    const today = new Date().toISOString().split('T')[0];
    const lastMessageDate = currentUser.last_message_date ? currentUser.last_message_date.split('T')[0] : null;
    // Ensure daily_messages_used is treated as a number, default to 0 if null/undefined
    const messagesUsed = Number(currentUser.daily_messages_used || 0);
    const messagesUsedToday = (lastMessageDate === today) ? messagesUsed : 0;
    
    // Log values used in calculation
    console.log(`[Limit Check] Limit: ${limit}, Today: ${today}, Last Msg Date: ${lastMessageDate}, Messages Used: ${messagesUsed}, Messages Used Today: ${messagesUsedToday}`);

    if (messagesUsedToday >= limit) {
      console.log(`[Limit Check] RESULT: Limit Reached (Used Today >= Limit).`);
      const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);
      setSnackbarMessage(`${tierName} plan daily message limit (${limit}) reached. Please upgrade or wait until tomorrow.`);
      setSnackbarSeverity('warning'); // Use warning severity for limit
      setSnackbarOpen(true);
      return true; // Limit reached
    }
    console.log("[Limit Check] RESULT: Limit Not Reached.");
    return false; // Limit not reached
  };

  const createNewSession = async () => {
    console.log("[createNewSession] Function called."); // Log entry
    // --- Updated check for context availability AND loading state ---
    // Check systemLoading from useIFS AND currentUser from useAuth
    if (systemLoading || !currentUser) { 
      console.error("Attempted to create session, but system or user context is not loaded or still loading.");
      setSnackbarMessage("System/User data is still loading, please wait a moment and try again.");
      setSnackbarSeverity('info');
      setSnackbarOpen(true);
      return; // Stop if system/user context isn't ready or context is loading
    }
    // --- End check ---
    
    console.log("[createNewSession] Checking message limit..."); // Log before check
    // --- Add limit check here ---
    if (checkMessageLimit()) {
      console.log("[createNewSession] Limit reached. Aborting session creation."); // Log if limit reached
      return; // Stop if limit is reached
    }
    // --- End limit check ---
    console.log("[createNewSession] Limit NOT reached. Proceeding with session creation."); // Log if limit not reached

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
      let displayError = 'Failed to create a new session. Please try again.';
      if (err.response && err.response.data && err.response.data.error) {
        displayError = err.response.data.error;
      } else if (err.message) {
        displayError = `Failed to create session: ${err.message}`;
      }
      setSnackbarMessage(displayError);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
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
                        primary={
                          session.topic 
                          ? session.topic 
                          : (session.title || `Session started ${formatDate(session.created_at)}`)
                        }
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

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbarSeverity} sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default GuidedSessionsPage; 