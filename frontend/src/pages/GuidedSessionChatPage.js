import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useIFS } from '../context/IFSContext';
import { useAuth } from '../context/AuthContext';
import {
  Container,
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Avatar,
  CircularProgress,
  IconButton,
  Divider,
  Alert,
  Snackbar
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import axios from 'axios';
import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns';

// Clean up the API_BASE_URL to handle any potential quotation marks and ensure proper URL formation
let API_BASE_URL;
if (process.env.REACT_APP_API_URL === undefined || process.env.REACT_APP_API_URL === null) {
  // If not defined, use a default based on environment
  API_BASE_URL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000';
} else {
  // Otherwise use the provided value
  API_BASE_URL = process.env.REACT_APP_API_URL;
}
// Remove any quotation marks that might have been included in the environment variable
API_BASE_URL = API_BASE_URL.replace(/[^\w:/.-]/g, '');
// Ensure API_BASE_URL doesn't end with a slash
API_BASE_URL = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;

const GuidedSessionChatPage = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useIFS();
  const { refreshCurrentUser } = useAuth();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  // Snackbar state
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('info');

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load session details and messages on initial render or when sessionId changes
  useEffect(() => {
    if (sessionId) {
      fetchSessionDetails(sessionId);
    } else {
      setError("No session ID provided.");
      // Optionally navigate back or show an error state
      navigate('/sessions');
    }
  }, [sessionId]); // Depend on sessionId

  // Snackbar close handler
  const handleSnackbarClose = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbarOpen(false);
  };

  const fetchSessionDetails = async (id) => {
    setIsLoading(true);
    setError('');

    try {
      // Fetch session details and messages from the new endpoint
      const response = await axios.get(
        `${API_BASE_URL}/api/guided-sessions/${id}`
      );

      if (response.data) {
        setSession(response.data.session || null);
        setMessages(response.data.messages || []);
        // Log the session data after setting state to confirm summary presence
        console.log('Fetched and set session details:', response.data.session);
        // Optionally store system and focusPart info if needed
        // setSystemInfo(response.data.system);
        // setFocusPartInfo(response.data.currentFocusPart);
      } else {
        throw new Error('Session not found or invalid response');
      }
    } catch (err) {
      console.error('Error fetching session details:', err);
      setError('Failed to load session. It might not exist or you may not have access.');
      setSession(null);
      setMessages([]);
      // Consider navigating back after a delay
      // setTimeout(() => navigate('/sessions'), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !session || isSending) return;

    const userMessageContent = message.trim();
    setMessage(''); // Clear input immediately

    // Optimistically add the user message to the UI
    const tempUserMessage = {
      id: 'temp-' + Date.now(), // Temporary ID
      role: 'user',
      content: userMessageContent,
      timestamp: new Date().toISOString(),
      session_id: sessionId // Add session_id for consistency
    };

    setMessages(prev => [...prev, tempUserMessage]);
    setIsSending(true); // Indicate that sending is in progress
    setError(''); // Clear previous errors

    try {
      // Send the message to the new API endpoint
      const response = await axios.post(
        `${API_BASE_URL}/api/guided-sessions/${session.id}/messages`,
        { content: userMessageContent } // Only send content
      );

      // The backend now returns {"userMessage": ..., "guideMessage": ...}
      const savedUserMessage = response.data.userMessage;
      const guideResponse = response.data.guideMessage;

      // Replace the temp message with the actual one from the server
      // Add the guide's response
      setMessages(prev => {
        const newMessages = prev.filter(m => m.id !== tempUserMessage.id);
        if (savedUserMessage) {
          // Ensure timestamp exists (backend should provide it)
          savedUserMessage.timestamp = savedUserMessage.timestamp || new Date().toISOString();
          newMessages.push(savedUserMessage);
        }
        if (guideResponse) {
          // Ensure timestamp exists
          guideResponse.timestamp = guideResponse.timestamp || new Date().toISOString();
          newMessages.push(guideResponse);
        }
        return newMessages;
      });

      // --- Refresh user data after successful send ---
      try {
        await refreshCurrentUser();
      } catch (refreshError) {
        // Log error if refresh fails, but don't necessarily block UI
        console.error("Error refreshing user data after message send:", refreshError);
      }
      // --- End refresh ---

      // Show backend non-critical error as warning snackbar
      if (response.data.error) {
        setSnackbarMessage(`Note: ${response.data.error}`); 
        setSnackbarSeverity('warning');
        setSnackbarOpen(true);
      }

    } catch (err) {
      console.error('Error sending message:', err);
      // --- Use Snackbar for send errors ---
      let displayError = 'Failed to send message. Please check your connection and try again.';
      if (err.response && err.response.data && err.response.data.error) {
          displayError = err.response.data.error;
      } else if (err.message) {
          displayError = `Failed to send message: ${err.message}`;
      }
      setSnackbarMessage(displayError);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      // --- End Snackbar --- 

      // Remove the temp message if sending failed
      setMessages(prev => prev.filter(m => m.id !== tempUserMessage.id));
    } finally {
      setIsSending(false); // Sending finished
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // No longer need getInitials for parts
  // Guide initials are fixed
  const guideInitials = 'G';

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return ''; // Return empty for invalid dates
      }
      // Format time simply
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch (e) {
      console.error("Error formatting timestamp:", e);
      return '';
    }
  };

  // Display loading indicator while fetching initial data
  if (isLoading) {
    return (
      <Container sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  // Display error if session failed to load
  if (!session && error) {
    return (
      <Container sx={{ mt: 4 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/sessions')} // Go back to sessions list
          sx={{ mb: 2 }}
        >
          Back to Sessions
        </Button>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  // Handle case where session is loaded but somehow null (should be rare)
  if (!session) {
    return (
      <Container sx={{ mt: 4 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/sessions')} // Go back to sessions list
          sx={{ mb: 2 }}
        >
          Back to Sessions
        </Button>
        <Alert severity="warning">Session data is unavailable.</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="md">
      <Box sx={{ my: 4 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/sessions')} // Go back to the sessions list page
          sx={{ mb: 2 }}
        >
          Back to Sessions List
        </Button>

        {/* Updated Header for Guided Session */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <Avatar
            sx={{
              bgcolor: 'info.main', // Different color for Guide/Session
              mr: 2,
              width: 56,
              height: 56
            }}
          >
            <SupportAgentIcon />
          </Avatar>
          <Box>
            <Typography variant="h5" component="h1">
              {session.created_at 
                ? format(parseISO(session.created_at), 'PPP')
                : 'Guided IFS Session'}
            </Typography>
            {session.topic && (
              <Typography 
                variant="subtitle1"
                color="text.secondary" 
                sx={{ mt: 0.5, fontStyle: 'italic' }}
              >
                Keywords: {session.topic}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Display general page load errors here */}
        {error && !isSending && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Paper
          elevation={3}
          sx={{
            height: '60vh',
            display: 'flex',
            flexDirection: 'column',
            mb: 2,
            overflow: 'hidden'
          }}
        >
          {/* Message Display Area */}
          <Box
            sx={{
              p: 2,
              flexGrow: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {messages.length === 0 ? (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '100%',
                  color: 'text.secondary'
                }}
              >
                <Typography>
                  Start your guided session by typing a message below.
                </Typography>
              </Box>
            ) : (
              messages.map((msg) => (
                <Box
                  key={msg.id} // Use message ID as key
                  sx={{
                    display: 'flex',
                    mb: 2,
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  {/* Guide Avatar */}
                  {msg.role === 'guide' && (
                    <Avatar
                      sx={{
                        mr: 1,
                        bgcolor: 'info.main',
                        alignSelf: 'flex-start'
                      }}
                    >
                      {guideInitials}
                    </Avatar>
                  )}
                  {/* Message Bubble */}
                  <Paper
                    elevation={1}
                    sx={{
                      p: 1.5, // Slightly adjust padding
                      maxWidth: '75%', // Allow slightly wider messages
                      backgroundColor: msg.role === 'user' ? 'primary.light' : 'background.default', // Use theme colors
                      color: msg.role === 'user' ? 'primary.contrastText' : 'text.primary',
                      borderRadius: msg.role === 'user'
                        ? '20px 20px 5px 20px'
                        : '20px 20px 20px 5px',
                      opacity: msg.id.toString().startsWith('temp-') ? 0.7 : 1, // Dim optimistic messages
                    }}
                  >
                    <Typography
                      variant="body1"
                      sx={{
                        whiteSpace: 'pre-wrap', // Keep for line breaks
                        wordBreak: 'break-word'
                      }}
                    >
                      {msg.content}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        mt: 0.5, // Adjust margin
                        textAlign: msg.role === 'user' ? 'right' : 'left',
                        color: msg.role === 'user' ? 'rgba(255,255,255,0.8)' : 'text.secondary',
                        fontSize: '0.7rem' // Smaller timestamp
                      }}
                    >
                      {formatTimestamp(msg.timestamp)}
                    </Typography>
                  </Paper>
                  {/* User Avatar */}
                  {msg.role === 'user' && (
                    <Avatar
                      sx={{
                        ml: 1,
                        bgcolor: 'secondary.main',
                        alignSelf: 'flex-start'
                      }}
                    >
                      {user?.email ? user.email[0].toUpperCase() : 'U'}
                    </Avatar>
                  )}
                </Box>
              ))
            )}
            {/* Loading indicator specifically for sending message */}
            {isSending && (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'flex-start', // Typically appears after user message
                  p: 1,
                  pl: 6 // Indent to align roughly with guide messages
                }}
              >
                <CircularProgress size={20} sx={{ mr: 1}} />
                <Typography variant="caption" color="text.secondary">Guide is responding...</Typography>
              </Box>
            )}
            <div ref={messagesEndRef} />
          </Box>
          <Divider />
          {/* Message Input Area */}
          <Box sx={{ p: 2, backgroundColor: 'background.paper' }}>
            <Box sx={{ display: 'flex' }}>
              <TextField
                fullWidth
                multiline
                maxRows={4}
                placeholder="Message the IFS Guide..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isSending} // Disable input while sending
                variant="outlined"
                sx={{ mr: 1 }}
              />
              <IconButton
                color="primary"
                onClick={handleSendMessage}
                disabled={!message.trim() || isSending}
                sx={{ alignSelf: 'flex-end', p: '10px' }}
              >
                <SendIcon />
              </IconButton>
            </Box>
          </Box>
        </Paper>
      </Box>
      
      {/* Snackbar for send message feedback */}
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

export default GuidedSessionChatPage; 