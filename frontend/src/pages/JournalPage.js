import React, { useState, useEffect, useRef, createRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useIFS } from '../context/IFSContext';
import { 
  Container, Typography, Box, Paper, TextField, Button,
  Stack, Alert, Divider, List, ListItem, ListItemText,
  Accordion, AccordionSummary, AccordionDetails, Chip
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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
  const { system, loading, error, addJournal, getJournals, journals } = useIFS();
  const location = useLocation();
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [selectedEmotions, setSelectedEmotions] = useState([]);
  const [selectedParts, setSelectedParts] = useState([]);
  
  // We still track the initial prompt from location state or localStorage
  const [initialPrompt, setInitialPrompt] = useState('');
  const [saveStatus, setSaveStatus] = useState({ type: '', message: '' });
  
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
    if (system && system.id) {
      console.log('Fetching journals for system:', system.id);
      getJournals().catch(err => {
        console.error('Error fetching journals:', err);
        setSaveStatus({ 
          type: 'error', 
          message: 'Could not load journals. Please ensure you are logged in.' 
        });
      });
    } else {
      console.log('No system available yet, skipping journal fetch');
    }
  }, [system?.id]); // Only depend on system.id, not the entire system object or getJournals

  const handleSave = async () => {
    try {
      setSaveStatus({ type: 'info', message: 'Saving...' });
      
      // Generate a default title if none provided
      const journalTitle = title.trim() || `Journal Entry - ${format(new Date(), 'PPP p')}`;
      
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
      
      setSaveStatus({ type: 'success', message: 'Journal entry saved successfully!' });
      
      // Clear form after successful save
      setContent('');
      setTitle('');
      setSelectedEmotions([]);
      setSelectedParts([]);
      
      // Refresh journals list
      getJournals();
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSaveStatus({ type: '', message: '' });
      }, 3000);
    } catch (err) {
      setSaveStatus({ 
        type: 'error', 
        message: 'Failed to save journal entry. Please try again.' 
      });
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return format(date, 'PPP p'); // e.g., "April 29, 2023, 3:30 PM"
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

  if (error) {
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
            <Typography variant="subtitle1" gutterBottom>
              Parts Present:
            </Typography>
            <PartSelector
              parts={parts}
              selectedParts={selectedParts}
              onChange={setSelectedParts}
            />
          </Paper>

          {/* Journal Content */}
          <Paper sx={{ p: 2 }}>
            <TextField
              fullWidth
              multiline
              rows={6}
              label="What's coming up for you?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              variant="outlined"
            />
          </Paper>

          {/* Save Button and Status */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleSave}
              disabled={!content.trim()}
            >
              Save Entry
            </Button>
            {saveStatus.message && (
              <Alert severity={saveStatus.type} sx={{ flexGrow: 1, ml: 2 }}>
                {saveStatus.message}
              </Alert>
            )}
          </Box>
          
          {/* Journal History Section */}
          <Divider sx={{ my: 3 }} />
          
          <Typography variant="h5" component="h2" gutterBottom>
            Journal History
          </Typography>
          
          {journals && journals.length > 0 ? (
            <List>
              {journals.map((journal) => (
                <Paper 
                  sx={{ mb: 2 }} 
                  key={journal.id} 
                  ref={journalRefs.current[journal.id]}
                  // Highlight the entry if it matches the scrollToEntry parameter
                  style={location.state?.scrollToEntry === journal.id ? { 
                    boxShadow: '0 0 8px 2px rgba(25, 118, 210, 0.5)',
                    border: '1px solid #1976d2'
                  } : {}}
                >
                  <Accordion defaultExpanded={location.state?.scrollToEntry === journal.id}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                        <Typography variant="subtitle1" fontWeight="bold">
                          {journal.title}
                        </Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(journal.date)}
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {getEmotionsFromMetadata(journal).map((emotion) => (
                              <Chip 
                                key={emotion} 
                                label={COMMON_EMOTIONS.find(e => e.id === emotion)?.label || emotion}
                                size="small"
                                sx={{ 
                                  bgcolor: COMMON_EMOTIONS.find(e => e.id === emotion)?.color || 'gray',
                                  color: 'white',
                                  fontSize: '0.7rem'
                                }}
                              />
                            ))}
                          </Box>
                        </Box>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Typography variant="body1" whiteSpace="pre-wrap">
                        {journal.content}
                      </Typography>
                    </AccordionDetails>
                  </Accordion>
                </Paper>
              ))}
            </List>
          ) : (
            <Typography variant="body1" color="text.secondary" textAlign="center">
              No journal entries yet. Start journaling to see your history here.
            </Typography>
          )}
        </Stack>
      </Box>
    </Container>
  );
};

export default JournalPage; 