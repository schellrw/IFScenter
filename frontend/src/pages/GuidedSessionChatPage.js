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
import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns';
import { getSessionDetails, addSessionMessage } from '../utils/api';

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
  const { loading: authLoading, isAuthenticated } = useAuth();
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
  // State for usage limits
  const [dailyCount, setDailyCount] = useState(null);
  const [dailyLimit, setDailyLimit] = useState(null);

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
      const response = await getSessionDetails(id);

      if (response.data) {
        const sessionData = response.data.session || null;
        const fetchedMessages = response.data.messages || [];

        setSession(sessionData);

        // *** Merge fetched messages instead of replacing ***
        setMessages(prevMessages => {
          const existingMessageIds = new Set(prevMessages.map(msg => msg.id));
          const newMessagesToAdd = fetchedMessages.filter(msg => !existingMessageIds.has(msg.id));

          if (newMessagesToAdd.length > 0) {
             console.log('Merging new messages into existing list:', newMessagesToAdd);
             // Append only the truly new messages
             return [...prevMessages, ...newMessagesToAdd];
          } else {
             console.log('No new messages found in fetch, retaining existing list.');
             // If no new messages, return the previous state to avoid unnecessary re-render
             return prevMessages;
          }
        });
        // **************************************************

        console.log('Fetched and set session details:', sessionData);
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

    // Use a functional update to ensure we have the latest state
    setMessages(prev => [...prev, tempUserMessage]);
    setIsSending(true); // Indicate that sending is in progress
    setError(''); // Clear previous errors

    let messageSentSuccessfully = false; // Flag to track if POST was ok

    try {
      // Send the message using the imported API function
      const response = await addSessionMessage(session.id, userMessageContent);

      // We primarily care that the POST itself didn't throw a network/server error (5xx)
      // Backend might return specific errors in the response body (e.g., usage limits)
      messageSentSuccessfully = true; // Assume success if no exception

      // Show backend non-critical error as warning snackbar right away
      if (response.data && response.data.error) {
          setSnackbarMessage(`Note: ${response.data.error}`);
          setSnackbarSeverity('warning');
          setSnackbarOpen(true);
      }

      // Process usage info if available in the POST response
      const usageInfo = response.data ? response.data.usageInfo : null;
      if (usageInfo) {
        console.log('Received usage info from POST:', usageInfo);
        setDailyCount(usageInfo.dailyMessageCount);
        setDailyLimit(usageInfo.dailyMessageLimit === null || usageInfo.dailyMessageLimit === Infinity ? Infinity : usageInfo.dailyMessageLimit);
      } else {
        // Still useful to know if it wasn't in the POST response
        console.warn('No usageInfo received from backend in POST response.');
      }

      // *** We will no longer update messages directly from the POST response ***
      // The refetch in 'finally' will handle updating the message list.

    } catch (err) {
      console.error('Error sending message:', err);
      messageSentSuccessfully = false; // Explicitly mark as failed on catch

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
      // Use functional update here too for safety
      setMessages(prev => prev.filter(m => m.id !== tempUserMessage.id));

    } finally {
      // --- Refetch session details AFTER the attempt (success or fail) ---
      if (messageSentSuccessfully) {
          // If the POST seemed successful, refetch everything to get the true state
          // This will include the user message (confirming it) and any guide response
          console.log("Message POST successful, preparing to refetch session details...");

          // *** Remove the temporary message BEFORE fetching ***
          // This prevents potential duplicate keys or merging issues if the fetch is fast
          setMessages(prev => prev.filter(m => m.id !== tempUserMessage.id));

          console.log("Temporary message removed, now refetching session details...");
          try {
            await fetchSessionDetails(sessionId); // Refetch data which will now merge
            console.log("Session details refetched and merged successfully.");
          } catch (fetchErr) {
            console.error("Error refetching session details after send:", fetchErr);
            setSnackbarMessage('Message sent, but failed to refresh chat. Please refresh manually.');
            setSnackbarSeverity('warning');
            setSnackbarOpen(true);
            // If refetch fails, the temp message was already removed above.
          }
      } else {
         // If POST failed, we already removed the temp message in catch block.
         console.log("Message POST failed, not refetching.");
      }
      // --- End Refetch ---

      setIsSending(false); // Sending finished (potentially after refetch)
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

  // Determine if user is over limit (handle null/Infinity)
  const isOverLimit = dailyLimit !== null && dailyLimit !== Infinity && dailyCount !== null && dailyCount >= dailyLimit;

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
                disabled={isSending} // Only disable if sending
                variant="outlined"
                sx={{ mr: 1 }}
              />
              <IconButton
                color="primary"
                onClick={handleSendMessage}
                disabled={!message.trim() || isSending} // Only disable if no message OR sending
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