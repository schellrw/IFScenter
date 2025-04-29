import React, { useState, useEffect, useRef, createRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useIFS } from '../context/IFSContext';
import { useAuth } from '../context/AuthContext';
import { 
  Container, Typography, Box, Paper, TextField, Button,
  Stack, Alert, Divider, List,
  Accordion, AccordionSummary, AccordionDetails, Chip,
  Snackbar, IconButton,
  Dialog, DialogActions, DialogContent, DialogTitle 
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import { EmotionPicker, PartSelector, JournalPrompt } from '../components';
import { format } from 'date-fns';
import { REFLECTIVE_PROMPTS, COMMON_EMOTIONS } from '../constants';

// Simple function to get a random prompt that is not the current one
const getNewUniquePrompt = (currentPrompt) => {
  // Filter out the current prompt
  const otherPrompts = REFLECTIVE_PROMPTS.filter(p => p !== currentPrompt);
  
  // Get a random prompt from the filtered list
  const randomIndex = Math.floor(Math.random() * otherPrompts.length);
  return otherPrompts[randomIndex];
};

const JournalPage = () => {
  const { system, loading, error, addJournal, getJournals, journals, deleteJournal } = useIFS();
  const { token } = useAuth();
  const location = useLocation();
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [selectedEmotions, setSelectedEmotions] = useState([]);
  const [selectedParts, setSelectedParts] = useState([]);
  
  // We still track the initial prompt from location state or localStorage
  const [initialPrompt, setInitialPrompt] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('info'); // 'success', 'error', 'warning', 'info'
  
  // State for custom delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [journalToDelete, setJournalToDelete] = useState(null); // Store { id, title }
  
  // Create refs for journal entries for scrolling functionality
  const journalRefs = useRef({});

  // Create a ref for each journal entry when journals change
  useEffect(() => {
    if (journals && journals.length > 0) {
      // Create a ref for each journal entry
      journalRefs.current = journals.reduce((acc, journal) => {
        acc[journal.id] = createRef();
        return acc;
      }, {});
    }
  }, [journals]);
  
  // Scroll to specific journal entry if directed from recent activity
  useEffect(() => {
    if (location.state?.scrollToEntry && journalRefs.current[location.state.scrollToEntry]) {
      // Slightly delay scrolling to ensure the DOM is ready
      setTimeout(() => {
        if (journalRefs.current[location.state.scrollToEntry]?.current) {
          journalRefs.current[location.state.scrollToEntry].current.scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
          });
          
          // Expand the accordion for this journal entry
          if (journalRefs.current[location.state.scrollToEntry].current) {
            const accordionButton = journalRefs.current[location.state.scrollToEntry].current.querySelector('.MuiAccordionSummary-root');
            if (accordionButton && !accordionButton.classList.contains('Mui-expanded')) {
              accordionButton.click();
            }
          }
        }
      }, 500);
    }
  }, [location.state, journals]);

  // Initialize the initial prompt only once on component mount
  useEffect(() => {
    let prompt;
    
    // Handle prompt from navigation state or localStorage
    if (location.state && location.state.prompt) {
      console.log('Journal Page: Using prompt from navigation:', location.state.prompt);
      prompt = location.state.prompt;
      localStorage.setItem('currentJournalPrompt', prompt);
    } else {
      // Check if we have a saved prompt
      const savedPrompt = localStorage.getItem('currentJournalPrompt');
      if (savedPrompt) {
        console.log('Journal Page: Using saved prompt from localStorage');
        prompt = savedPrompt;
      } else {
        // Fallback to random prompt
        const randomPrompt = REFLECTIVE_PROMPTS[Math.floor(Math.random() * REFLECTIVE_PROMPTS.length)];
        console.log('Journal Page: Using random prompt:', randomPrompt);
        prompt = randomPrompt;
        localStorage.setItem('currentJournalPrompt', randomPrompt);
      }
    }
    
    setInitialPrompt(prompt);
    
  }, [location.state]); // Only depend on location.state for prompt setting
  
  // Separate useEffect for journals loading to prevent repeated calls
  useEffect(() => {
    // Load journals only if authenticated and system ID is available
    if (system?.id) {
      console.log('Fetching journals for system:', system.id);
      getJournals().catch(err => {
        console.error('Error fetching journals:', err);
        // Trigger Snackbar for journal load errors
        setSnackbarMessage('Could not load journals. Please ensure you are logged in.');
        setSnackbarSeverity('error');
        setSnackbarOpen(true);
      });
    } else {
      console.log('No system available yet, skipping journal fetch');
    }
  }, [system?.id]); // Reverted dependency to system?.id to prevent infinite loop

  // Snackbar close handler
  const handleSnackbarClose = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbarOpen(false);
  };

  // Opens the confirmation dialog
  const handleDelete = (journal) => {
    setJournalToDelete(journal); // Store the whole journal object or just {id, title}
    setDeleteDialogOpen(true);
  };

  // Called when user confirms deletion in the dialog
  const confirmDelete = async () => {
    if (!journalToDelete) return;
    
    try {
      await deleteJournal(journalToDelete.id); // Call context function
      setSnackbarMessage('Journal entry deleted successfully!');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      // No need to call getJournals() here, deleteJournal in context already does
    } catch (err) {
      console.error("Error deleting journal:", err);
      setSnackbarMessage(err.response?.data?.error || 'Failed to delete journal entry.');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setJournalToDelete(null);
      setDeleteDialogOpen(false); // Close the dialog
    }
  };

  const handleSave = async () => {
    try {
      // Show saving message (optional, could skip)
      // setSnackbarMessage('Saving...');
      // setSnackbarSeverity('info');
      // setSnackbarOpen(true);
      
      const journalTitle = title.trim() || `Journal - ${new Date().toLocaleDateString()}`;
      
      // Format part_id from selectedParts (take first one if multiple selected)
      const partId = selectedParts.length > 0 ? selectedParts[0] : null;
      
      const journalEntry = {
        title: journalTitle,
        content: content,
        part_id: partId,
        // Store emotions and parts as metadata in content for now
        metadata: JSON.stringify({
          emotions: selectedEmotions,
          parts_present: selectedParts
        })
      };

      await addJournal(journalEntry);
      
      // Show success snackbar
      setSnackbarMessage('Journal entry saved successfully!');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      
      // Clear form after successful save
      setContent('');
      setTitle('');
      setSelectedEmotions([]);
      setSelectedParts([]);
      
      // Refresh journals list
      getJournals();
      
    } catch (err) {
      // --- Updated Error Handling using Snackbar ---
      let errorMessage = 'Failed to save journal entry. Please try again.'; // Default
      // Check if the error object has specific details from the backend
      if (err.response && err.response.data && err.response.data.error) {
         // Use the specific error message from the backend if it exists
         errorMessage = err.response.data.error;
      } else if (err.message) {
         // Fallback to error message property if no specific backend error
         errorMessage = err.message;
      }
      console.error('Error saving journal:', err.response || err);
      // Show error snackbar
      setSnackbarMessage(errorMessage);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      // --- End Updated Error Handling ---
    }
  };

  // Format date for display using user's locale
  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        // Check if the date is valid before formatting
        if (isNaN(date.getTime())) {
             console.warn("Invalid date string received:", dateString);
             return "Invalid Date"; // Or return the original string, or empty
        }
        // Use locale-specific date and time formatting
        const optionsDate = { year: 'numeric', month: 'long', day: 'numeric' };
        const optionsTime = { hour: 'numeric', minute: 'numeric', hour12: true };
        return `${date.toLocaleDateString(undefined, optionsDate)}, ${date.toLocaleTimeString(undefined, optionsTime)}`;
    } catch (e) {
        console.error("Error formatting date:", e);
        return dateString; // Fallback to original string on error
    }
  };

  // Extract emotions from metadata JSON
  const getEmotionsFromMetadata = (journal) => {
    try {
      if (!journal.metadata) return [];
      const metadata = JSON.parse(journal.metadata);
      return metadata.emotions || [];
    } catch (e) {
      return [];
    }
  };

  if (loading) {
    return (
      <Container sx={{ mt: 4, textAlign: 'center' }}>
        <Typography>Loading...</Typography>
      </Container>
    );
  }

  if (error && !journals) { // Only show page-level error if journals failed to load initially
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  const parts = system ? Object.values(system.parts) : [];

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Journal
        </Typography>

        <Stack spacing={3}>
          {/* Use our new self-contained JournalPrompt component */}
          {initialPrompt && <JournalPrompt initialPrompt={initialPrompt} />}

          {/* Title Field */}
          <Paper sx={{ p: 2 }}>
            <TextField
              fullWidth
              label="Title (Optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              variant="outlined"
              placeholder="Leave blank for auto-generated title"
            />
          </Paper>

          {/* Emotion Picker */}
          <Paper sx={{ p: 2 }}>
            <EmotionPicker
              emotions={COMMON_EMOTIONS}
              selectedEmotions={selectedEmotions}
              onChange={setSelectedEmotions}
            />
          </Paper>
          
          {/* Part Selector */}
          <Paper sx={{ p: 2 }}>
             <PartSelector 
                parts={parts} 
                selectedParts={selectedParts} 
                onChange={setSelectedParts}
                label="Which Parts were present during this reflection?" 
             />
          </Paper>
          
          {/* Content Field */}
          <Paper sx={{ p: 2 }}>
            <TextField
              fullWidth
              label="Journal Entry"
              multiline
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              variant="outlined"
            />
          </Paper>
          
          {/* Save Button */}
          <Box sx={{ textAlign: 'right' }}>
            <Button variant="contained" color="primary" onClick={handleSave}>
              Save Entry
            </Button>
          </Box>
          
          {/* Divider */}
          <Divider sx={{ my: 3 }} />
          
          {/* Past Entries Section */}
          <Typography variant="h5" component="h2" gutterBottom>
            Past Entries
          </Typography>
          
          {journals && journals.length > 0 ? (
            <List>
              {journals.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((journal) => (
                <Box key={journal.id} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}> 
                  <Accordion ref={journalRefs.current[journal.id]} sx={{ flexGrow: 1 }}>
                     <AccordionSummary
                        expandIcon={<ExpandMoreIcon />}
                        aria-controls={`panel-${journal.id}-content`}
                        id={`panel-${journal.id}-header`}
                        sx={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          width: '100%',
                          flexWrap: 'wrap'
                        }}
                      >
                       <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1, flexWrap: 'wrap', mr: 1 }}> 
                          <Typography sx={{ fontWeight: 'bold', mr: 2, flexShrink: 0 }}>{journal.title || 'Untitled Entry'}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ mr: 2, flexShrink: 0 }}>
                             {formatDate(journal.created_at)} 
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: { xs: 1, sm: 0 } }}> 
                             {getEmotionsFromMetadata(journal).map((emotionId, index) => {
                                // Find emotion data by ID now
                                const emotionData = COMMON_EMOTIONS.find(e => e.id === emotionId);
                                return (
                                  <Chip 
                                     key={index} 
                                     label={emotionData ? emotionData.label : emotionId} // Display label from found data, or the ID as fallback
                                     size="small" 
                                     sx={{ 
                                       bgcolor: emotionData ? emotionData.color : 'grey', // Use color from constant based on ID match
                                       color: 'white', // Assuming white text works for all colors
                                       mr: 0.5, 
                                       mb: 0.5 
                                     }}
                                  />
                                );
                             })}
                          </Box>
                       </Box>
                      </AccordionSummary>
                    <AccordionDetails>
                      <Typography paragraph>
                        {journal.content}
                      </Typography>
                      {getEmotionsFromMetadata(journal).length > 0 && (
                          <Box sx={{ mt: 1 }}>
                             <Typography variant="caption" display="block" gutterBottom>Emotions present:</Typography>
                             {getEmotionsFromMetadata(journal).map((emotion, index) => (
                                <Chip key={index} label={emotion} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                             ))}
                          </Box>
                       )}
                    </AccordionDetails>
                  </Accordion>
                  {/* Delete Button (now triggers dialog) */}
                  <IconButton 
                     aria-label="delete entry" 
                     onClick={() => handleDelete(journal)} // Pass the journal object
                     size="small"
                     sx={{ ml: 1, flexShrink: 0 }} 
                   >
                     <DeleteIcon fontSize="inherit" />
                   </IconButton>
                </Box>
              ))}
            </List>
          ) : (
            <Typography>No journal entries yet.</Typography>
          )}
        </Stack>
        
        {/* Snackbar for notifications */}
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

        {/* Custom Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
          <DialogTitle>Delete Journal Entry</DialogTitle>
          <DialogContent>
            Are you sure you want to delete 
            {journalToDelete?.title ? `"${journalToDelete.title}"` : 'this journal entry'}? 
            This action cannot be undone.
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDialogOpen(false)} sx={{ color: 'primary.main' }}>
              Cancel
            </Button>
            <Button 
              onClick={confirmDelete} 
              color="error" 
              variant="contained"
              sx={{ 
                backgroundColor: 'error.main', 
                color: 'white', 
                '&:hover': { backgroundColor: 'error.dark' } 
              }}
            >
              Delete
            </Button>
          </DialogActions>
        </Dialog>
        
      </Box>
    </Container>
  );
};

export default JournalPage; 