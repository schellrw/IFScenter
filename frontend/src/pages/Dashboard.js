import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Container, Typography, Box, Grid, Paper, Alert, List, ListItem,
  ListItemText, ListItemIcon, Divider, Button, Chip, CircularProgress,
  Card, CardContent, CardActions, IconButton, Tooltip
} from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import EditNoteIcon from '@mui/icons-material/EditNote';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import UpdateIcon from '@mui/icons-material/Update';
import EmojiPeopleIcon from '@mui/icons-material/EmojiPeople';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import RefreshIcon from '@mui/icons-material/Refresh';
import DonutLargeIcon from '@mui/icons-material/DonutLarge';
import BarChartIcon from '@mui/icons-material/BarChart';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns';
import { useIFS } from '../context/IFSContext';
import { REFLECTIVE_PROMPTS } from '../constants';
import { PartsDistributionChart, EmotionsChart, MiniSystemMap } from '../components';
import axios from 'axios';

// Configure API base URL - can be changed via environment variable later
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
API_BASE_URL = API_BASE_URL.replace(/["']/g, '');
// Ensure API_BASE_URL doesn't end with a slash
API_BASE_URL = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;

// Add a debug flag at the top of the file, after imports
const DEBUG = process.env.NODE_ENV === 'development';

/**
 * Parse a timestamp string into a Date object
 * Handles different timestamp formats and validates the result
 * 
 * @param {string} timestamp - The timestamp string to parse
 * @returns {Date} A valid Date object
 */
const parseTimestamp = (timestamp) => {
  if (!timestamp) {
    if (DEBUG) console.warn('Empty timestamp provided, using current time');
    return new Date();
  }
  
  try {
    // Try parsing as ISO string first
    const date = parseISO(timestamp);
    
    // Check if the result is valid
    if (isValid(date)) {
      return date;
    }
    
    // If not a valid ISO format, try as a regular date string
    const regularDate = new Date(timestamp);
    
    // Final validity check
    if (isValid(regularDate) && !isNaN(regularDate.getTime())) {
      return regularDate;
    }
    
    throw new Error('Invalid timestamp format');
  } catch (error) {
    console.error(`Failed to parse timestamp "${timestamp}":`, error);
    return new Date();
  }
};

/**
 * Check if a date is unreasonably in the future
 * Allows for small clock differences (up to 5 minutes)
 * 
 * @param {Date} date - Date to check
 * @returns {boolean} Whether the date is in the future
 */
const isUnreasonablyInFuture = (date) => {
  const now = new Date();
  const fiveMinutesInFuture = new Date(now.getTime() + 5 * 60 * 1000);
  return date > fiveMinutesInFuture;
};

// Add a cache for timestamp adjustments to prevent repeated adjustments
const timestampAdjustments = {};

/**
 * Get a stable timestamp for an item
 * Ensures future dates are adjusted consistently
 * 
 * @param {string} id - Unique ID for the item
 * @param {string} rawTimestamp - Raw timestamp string
 * @returns {Date} A stable Date object
 */
const getStableTimestamp = (id, rawTimestamp) => {
  // If we've already adjusted this timestamp before, use the cached value
  if (timestampAdjustments[id]) {
    return new Date(timestampAdjustments[id]);
  }
  
  // Parse the timestamp
  const timestamp = parseTimestamp(rawTimestamp);
  
  // Check if it's unreasonably in the future
  if (isUnreasonablyInFuture(timestamp)) {
    if (DEBUG) {
      console.warn(`Item ${id} has timestamp too far in the future, adjusting:`, {
        originalTimestamp: timestamp.toISOString(),
        difference: `${Math.round((timestamp - new Date()) / 1000 / 60)} minutes`
      });
    }
    
    // Use a stable timestamp slightly in the past
    const adjustedTime = new Date(Date.now() - 10 * 60 * 1000);
    
    // Cache the adjustment
    timestampAdjustments[id] = adjustedTime.toISOString();
    
    return adjustedTime;
  }
  
  // For valid timestamps, still cache them to ensure stability
  timestampAdjustments[id] = timestamp.toISOString();
  
  return timestamp;
};

// Preload date-fns format to prevent format changes between renders
const TIME_FORMAT = 'PPP p';
const formatDateTime = (date) => format(date, TIME_FORMAT);

const Dashboard = () => {
  const { system, loading: ifsLoading, error: ifsError, journals, getJournals, isAuthenticated } = useIFS();
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [error, setError] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [chartData, setChartData] = useState({ partCounts: {}, emotionCounts: {} });
  const navigate = useNavigate();
  const location = useLocation();

  // Add state for tracking previous part data to detect real changes
  const [previousPartsState, setPreviousPartsState] = useState({});
  // Track when we last processed part updates
  const [lastUpdateCheck, setLastUpdateCheck] = useState(Date.now());
  
  // Effect to update the previous parts state when system changes
  useEffect(() => {
    if (system && system.parts) {
      console.log("Updating previous parts state with new system data");
      setPreviousPartsState(prev => {
        // Only update parts that are different to avoid infinite loops
        const newState = { ...prev };
        
        Object.values(system.parts).forEach(part => {
          // If part exists in prev state and hasn't been modified, keep it
          // Otherwise, update with current state
          if (!prev[part.id] || prev[part.id].updated_at !== part.updated_at) {
            newState[part.id] = {
              id: part.id,
              name: part.name,
              updated_at: part.updated_at,
              created_at: part.created_at,
              description: part.description,
              role: part.role,
              feelings: [...(part.feelings || [])],
              beliefs: [...(part.beliefs || [])],
              triggers: [...(part.triggers || [])],
              needs: [...(part.needs || [])]
            };
          }
        });
        
        return newState;
      });
      
      // Force activity refresh when system changes
      setLastUpdateCheck(Date.now());
    }
  }, [system]);

  // For debugging
  useEffect(() => {
    if (system && journals) {
      console.log('Dashboard detected changes in system or journals:', {
        systemId: system?.id,
        partsCount: system?.parts ? Object.keys(system.parts).length : 0,
        journalCount: journals?.length || 0,
        isAuthenticated: isAuthenticated
      });
    }
  }, [system, journals, isAuthenticated]);

  // Get a random reflective prompt
  const getRandomPrompt = () => {
    const randomIndex = Math.floor(Math.random() * REFLECTIVE_PROMPTS.length);
    return REFLECTIVE_PROMPTS[randomIndex];
  };

  // Refresh the reflective prompt
  const refreshPrompt = () => {
    const newPrompt = getRandomPrompt();
    setCurrentPrompt(newPrompt);
    localStorage.setItem('currentJournalPrompt', newPrompt);
  };

  // Initialize prompt on component mount - either from localStorage or a new random one
  useEffect(() => {
    const savedPrompt = localStorage.getItem('currentJournalPrompt');
    if (savedPrompt && REFLECTIVE_PROMPTS.includes(savedPrompt)) {
      setCurrentPrompt(savedPrompt);
    } else {
      const newPrompt = getRandomPrompt();
      setCurrentPrompt(newPrompt);
      localStorage.setItem('currentJournalPrompt', newPrompt);
    }
  }, []);

  useEffect(() => {
    const testConnection = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/test`);
        setConnectionStatus(response.data.message);
        setError(null);
      } catch (err) {
        setError('Failed to connect to backend server');
        console.error('Connection error:', err);
      }
    };

    testConnection();
  }, []);

  // Effect to fetch recent activity and generate recommendations
  useEffect(() => {
    let isMounted = true;
    
    const fetchData = async () => {
      if (!isMounted) return;
      
      setLoadingActivity(true);
      
      try {
        if (DEBUG) {
          console.log("Beginning fetchData execution with data:", {
            hasSystem: !!system,
            systemId: system?.id,
            journalsAvailable: !!journals,
            journalCount: journals?.length || 0,
            isAuthenticated,
            lastUpdateCheck
          });
        }
        
        // Use journals from context directly instead of fetching again
        let journalData = journals || [];
        
        if (DEBUG) {
          console.log("Dashboard data processing:", {
            journalCount: journalData.length,
            systemParts: system?.parts ? Object.keys(system.parts).length : 0,
            systemRelationships: system?.relationships ? Object.keys(system.relationships).length : 0
          });
        }
        
        if (!isMounted) return;
        
        // Create combined activity list
        const allActivity = [];
        
        // Add journal entries to activity
        if (journalData && journalData.length > 0) {
          if (DEBUG) {
            console.log("Processing journals for activity:", 
              journalData.map(j => ({
                id: j.id,
                title: j.title,
                date: j.date,
                created_at: j.created_at
              })).slice(0, 2)
            );
          }
          
          journalData.forEach(journal => {
            if (journal && journal.id) {
              // Use created_at first, then date, then fallback to now
              const rawTimestamp = journal.created_at || journal.date;
              const timestamp = getStableTimestamp(journal.id, rawTimestamp);
              
              allActivity.push({
                type: 'journal',
                id: journal.id,
                title: journal.title || 'Untitled Journal',
                timestamp,
                associatedId: journal.id,
                sortKey: timestamp.getTime()  // Use for stable sorting
              });
            }
          });
        }
        
        // Add parts to activity (if available)
        if (system && system.parts) {
          if (DEBUG) {
            console.log("Processing parts for activity");
          }
          
          const parts = system?.parts ? Object.values(system.parts) : [];

          // Process Journals
          const journalActivities = (journals || []).map(j => ({
            type: 'journal',
            id: j.id,
            timestamp: getStableTimestamp(`journal-${j.id}`, j.created_at || j.updated_at),
            description: `Journal entry created: ${j.title}`,
            data: j
          }));

          // Process Parts (Creations/Updates)
          let partActivities = [];
          parts.forEach(part => {
            const prevPartState = previousPartsState[part.id];
            const partCreatedAt = getStableTimestamp(`part-created-${part.id}`, part.created_at);
            const partUpdatedAt = getStableTimestamp(`part-updated-${part.id}`, part.updated_at);

            // Add creation activity
            partActivities.push({
              type: 'part_created',
              id: part.id,
              timestamp: partCreatedAt,
              description: `Part created: ${part.name}`,
              data: part
            });

            // Check for significant updates since the last check
            if (prevPartState && partUpdatedAt > lastUpdateCheck) {
              let changes = [];
              if (part.name !== prevPartState.name) changes.push('name');
              if (part.role !== prevPartState.role) changes.push('role');
              if (part.description !== prevPartState.description) changes.push('description');
              
              // Safely compare arrays
              const feelingsChanged = !arraysEqual(part.feelings || [], prevPartState.feelings || []);
              if (feelingsChanged) changes.push('feelings');
              
              const beliefsChanged = !arraysEqual(part.beliefs || [], prevPartState.beliefs || []);
              if (beliefsChanged) changes.push('beliefs');
              
              const triggersChanged = !arraysEqual(part.triggers || [], prevPartState.triggers || []);
              if (triggersChanged) changes.push('triggers');
              
              const needsChanged = !arraysEqual(part.needs || [], prevPartState.needs || []);
              if (needsChanged) changes.push('needs');

              if (changes.length > 0) {
                partActivities.push({
                  type: 'part_updated',
                  id: part.id,
                  timestamp: partUpdatedAt,
                  description: `Part updated: ${part.name} (${changes.join(', ')})`,
                  data: part
                });
              }
            }
          });
          
          // Helper to compare arrays
          const arraysEqual = (a, b) => {
            if (a === b) return true;
            if (a == null || b == null) return false;
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; ++i) {
              if (a[i] !== b[i]) return false;
            }
            return true;
          };

          // Combine activities and sort
          const combinedActivities = [...journalActivities, ...partActivities];
          combinedActivities.sort((a, b) => b.timestamp - a.timestamp);
          
          if (isMounted) {
            setRecentActivity(combinedActivities.slice(0, 10));
          }
          
          // --- Generate Recommendations ---
          let generatedRecommendations = [];
          
          // Check if parts exist
          if (parts.length === 0) {
            generatedRecommendations.push({
              type: 'create_part',
              text: 'Start by creating your first internal part. Give it a name and maybe a role.'
            });
          } else {
            // Recommendation: Fill out description for parts missing it
            const partsWithoutDescription = parts.filter(p => !p.description);
            if (partsWithoutDescription.length > 0) {
              generatedRecommendations.push({
                type: 'update_part',
                partId: partsWithoutDescription[0].id,
                text: `Consider adding a description for the part '${partsWithoutDescription[0].name}'. What is its role?`
              });
            }

            // Recommendation: Explore parts with few details (e.g., missing feelings/beliefs)
            const partsWithFewDetails = parts.filter(p => 
              (!p.feelings || p.feelings.length === 0) || 
              (!p.beliefs || p.beliefs.length === 0)
            );
            if (partsWithFewDetails.length > 0 && generatedRecommendations.length < 3) {
              const targetPart = partsWithFewDetails[0];
              generatedRecommendations.push({
                type: 'explore_part', // Could link to part details or prompt journal
                partId: targetPart.id,
                text: `Explore the part '${targetPart.name}'. What feelings or core beliefs might it hold?`
              });
            }
            
            // Recommendation: Journal about a recent interaction between parts
            // (Needs relationship data - placeholder for now)
            if (generatedRecommendations.length < 3) {
              // Placeholder - needs logic based on relationships or recent activity
            }

            // Recommendation: Review parts not updated recently
            const now = new Date();
            const oneWeekAgo = new Date(now.setDate(now.getDate() - 7));
            const oldParts = parts.filter(p => {
              const updatedDate = parseTimestamp(p.updated_at);
              return updatedDate < oneWeekAgo;
            });
            if (oldParts.length > 0 && generatedRecommendations.length < 3) {
              const targetPart = oldParts[0];
              generatedRecommendations.push({
                type: 'review_part',
                partId: targetPart.id,
                text: `It's been a while since you updated '${targetPart.name}'. Check in and see if anything has changed.`
              });
            }
          }
          
          // Recommendation: Use a journal prompt
          if (generatedRecommendations.length < 3) {
            generatedRecommendations.push({
              type: 'journal_prompt',
              text: `Try journaling about: "${currentPrompt}"`
            });
          }
          
          // Fallback recommendation
          if (generatedRecommendations.length === 0) {
            generatedRecommendations.push({
              type: 'explore_system',
              text: 'Explore your system map to visualize your parts and their relationships.'
            });
          }
          
          if (isMounted) {
            setRecommendations(generatedRecommendations);
          }

          // Extract data for charts
          const partCounts = {};
          const emotionCounts = {};
          parts.forEach(part => {
            // Count parts by role
            const role = part.role || 'Unspecified';
            partCounts[role] = (partCounts[role] || 0) + 1;

            // Count emotions - Ensure feelings is an array before processing
            const feelings = Array.isArray(part.feelings) ? part.feelings : [];
            feelings.forEach(feeling => {
              const normalizedFeeling = feeling.trim().toLowerCase();
              if (normalizedFeeling) { // Avoid counting empty strings
                emotionCounts[normalizedFeeling] = (emotionCounts[normalizedFeeling] || 0) + 1;
              }
            });
          });

          // Update state for charts (moved after parts loop)
          setChartData({ partCounts, emotionCounts });
          
          if (isMounted) {
            setLoadingActivity(false);
          }
        }
        
        // Add relationships to activity
        if (system && system.relationships) {
          if (DEBUG) {
            console.log("Processing relationships for activity");
          }
          
          Object.values(system.relationships).forEach(rel => {
            const sourcePart = system.parts[rel.source_id]?.name || 'Unknown';
            const targetPart = system.parts[rel.target_id]?.name || 'Unknown';
            
            // Use created_at or a fallback
            const rawTimestamp = rel.created_at;
            const timestamp = getStableTimestamp(rel.id, rawTimestamp);
            
            allActivity.push({
              type: 'relationship',
              id: rel.id,
              title: `Relationship created: "${sourcePart}" → "${targetPart}"`,
              timestamp,
              associatedId: rel.id,
              sortKey: timestamp.getTime()
            });
          });
        }
        
        if (DEBUG) {
          console.log("All activity before sorting:", allActivity.length);
        }
        
        // Ensure all items have valid dates and handle invalid dates
        const validActivity = allActivity.filter(item => {
          const isValid = item.timestamp instanceof Date && !isNaN(item.timestamp.getTime());
          if (!isValid) {
            console.warn("Invalid timestamp for activity item:", item);
          }
          return isValid;
        });
        
        if (DEBUG) {
          console.log("Valid activity items:", validActivity.length);
        }
        
        // Sort by timestamp (newest first) and take top 10
        // Use sortKey for stable sorting between renders
        const sortedActivity = validActivity
          .sort((a, b) => b.sortKey - a.sortKey)
          .slice(0, 10);
          
        if (DEBUG) {
          console.log("Sorted activity (top 10):", sortedActivity.map(act => ({
            title: act.title,
            type: act.type,
            time: act.timestamp.toISOString()
          })));
          
          // Final debugging - log the exact activities that will be shown
          console.log("Activity items to be displayed:", sortedActivity.map(act => ({
            id: act.id,
            type: act.type,
            title: act.title,
            associatedId: act.associatedId,
            time: act.timestamp.toISOString()
          })));
        }
        
        if (isMounted) {
          setRecentActivity(sortedActivity);
          if (DEBUG) {
            console.log("Set recentActivity state with", sortedActivity.length, "items");
          }
          
          // Generate personalized recommendations
          const newRecommendations = [];
          
          // Add recommendations based on system state
          const partsCount = system && system.parts ? Object.keys(system.parts).length : 0;
          
          if (partsCount === 0) {
            newRecommendations.push({
              type: 'parts',
              title: 'Identify Your First Part',
              description: 'Start by identifying your first internal part to begin mapping your system.',
              action: 'Create Part',
              path: '/parts/new'
            });
          } else if (partsCount < 3) {
            newRecommendations.push({
              type: 'parts',
              title: 'Add More Parts',
              description: 'Continue identifying internal parts to better understand your system.',
              action: 'Create Part',
              path: '/parts/new'
            });
          }
          
          // Journal recommendations
          const journalsCount = journalData.length;
          
          if (journalsCount === 0) {
            newRecommendations.push({
              type: 'journal',
              title: 'Start Your Journal',
              description: 'Record your first journal entry to track your IFS journey.',
              action: 'New Journal',
              path: '/journal'
            });
          } else if (journalsCount < 5) {
            newRecommendations.push({
              type: 'journal',
              title: 'Continue Journaling',
              description: 'Regular journaling helps track progress and gain insights.',
              action: 'New Journal',
              path: '/journal'
            });
          }
          
          // Relationship recommendations if we have multiple parts
          if (partsCount >= 2 && (!system.relationships || Object.keys(system.relationships).length === 0)) {
            newRecommendations.push({
              type: 'relationship',
              title: 'Map Relationships',
              description: 'Start connecting parts to understand how they interact with each other.',
              action: 'Add Relationship',
              path: '/relationships'
            });
          }
          
          // Additional recommendations
          newRecommendations.push({
            type: 'visualization',
            title: 'Visualize Your System',
            description: 'See a visual representation of your internal family system.',
            action: 'View Map',
            path: '/system-map'
          });
          
          // Make sure we give each recommendation a unique ID
          newRecommendations.forEach((rec, index) => {
            rec.id = `rec-${index}-${rec.type}`;
          });
          
          console.log("Generated recommendations:", newRecommendations.length);
          
          // Shuffle and select 3 recommendations
          const shuffled = newRecommendations.sort(() => 0.5 - Math.random());
          setRecommendations(shuffled.slice(0, 3));
        }
      } catch (err) {
        console.error('Error in dashboard data loading:', err);
        if (isMounted) {
          setRecentActivity([]);
          setRecommendations([]);
        }
      } finally {
        if (isMounted) {
          setLoadingActivity(false);
        }
      }
    };
    
    // Fix: Only check for system existence since it only exists for authenticated users
    if (system) {
      console.log("Starting to fetch dashboard data - system detected");
      fetchData();
    } else {
      console.log("Not fetching dashboard data - system not available", { system });
    }
    
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [system, journals, lastUpdateCheck]);

  // Memoize the parts and relationships arrays for the MiniSystemMap
  const partsForMap = useMemo(() => {
    // Ensure system and system.parts exist before calling Object.values
    return system && system.parts ? Object.values(system.parts) : [];
  }, [system?.parts]); // Dependency is system.parts itself

  const relationshipsForMap = useMemo(() => {
    // Ensure system and system.relationships exist
    return system && system.relationships ? Object.values(system.relationships) : [];
  }, [system?.relationships]); // Dependency is system.relationships itself

  const handleActivityClick = (type, id) => {
    if (type === 'journal') {
      // Enhanced navigation for journal entries - takes user directly to the specific journal
      navigate('/journal', { 
        state: { 
          highlightId: id,
          selectedPrompt: currentPrompt,
          scrollToEntry: id // Add this to tell the journal page to scroll to this entry
        } 
      });
    } else if (type === 'part' || type === 'part_created' || type === 'part_updated') {
      navigate(`/parts/${id}`, { state: { from: 'dashboard' } });
    } else if (type === 'relationship') {
      navigate('/system-map');
    }
  };

  const getActivityIcon = (type) => {
    switch (type) {
      case 'journal':
        return <EditNoteIcon color="primary" />;
      case 'part':
      case 'part_created':
        return <PersonAddIcon color="secondary" />;
      case 'part_updated':
        return <UpdateIcon color="secondary" />;
      case 'relationship':
        return <CompareArrowsIcon color="info" />;
      default:
        return <EditNoteIcon />;
    }
  };

  const getRecommendationIcon = (type) => {
    switch (type) {
      case 'journal':
        return <EditNoteIcon color="primary" />;
      case 'part':
        return <PersonAddIcon color="secondary" />;
      case 'relationship':
        return <CompareArrowsIcon color="info" />;
      case 'part_checkin':
        return <EmojiPeopleIcon color="secondary" />;
      default:
        return <LightbulbIcon color="primary" />;
    }
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          IFS System Dashboard
        </Typography>

        {/* Connection Status */}
        {connectionStatus && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {connectionStatus}
          </Alert>
        )}
        
        {/* Error Message */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        {ifsError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {ifsError}
          </Alert>
        )}
        
        <Grid container spacing={3}>
          {/* System Overview */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Typography variant="h6" gutterBottom>System Overview</Typography>
              
              {ifsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : (
                <>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                    <Typography>
                      Total Parts: {system ? Object.keys(system.parts).length : 0}
                    </Typography>
                    <Typography>
                      Relationships: {system?.relationships ? Object.keys(system.relationships).length : 0}
                    </Typography>
                    <Typography>
                      Journal Entries: {journals?.length || 0}
                    </Typography>
                  </Box>
                  
                  <Box sx={{ display: 'flex', gap: 1, mt: 3, flexWrap: 'wrap' }}>
                    <Button 
                      variant="contained" 
                      size="small" 
                      onClick={() => navigate('/parts/new')}
                    >
                      Add New Part
                    </Button>
                    <Button 
                      variant="outlined" 
                      size="small" 
                      onClick={() => navigate('/journal', { 
                        state: { selectedPrompt: currentPrompt } 
                      })}
                    >
                      Write Journal Entry
                    </Button>
                    <Button 
                      variant="outlined" 
                      size="small" 
                      onClick={() => navigate('/system-map')}
                    >
                      Explore System Map
                    </Button>
                  </Box>
                </>
              )}
            </Paper>
          </Grid>
          
          {/* Recent Activity */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" gutterBottom sx={{ mb: 0 }}>Recent Activity</Typography>
                <Tooltip title="Refresh activity feed">
                  <IconButton 
                    size="small" 
                    onClick={() => setLastUpdateCheck(Date.now())}
                    disabled={loadingActivity}
                  >
                    <RefreshIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              
              {loadingActivity ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : recentActivity && recentActivity.length > 0 ? (
                <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
                  {/* Debug - Log recentActivity state before rendering */}
                  {console.log("Rendering recentActivity list with", recentActivity.length, "items:", 
                    recentActivity.map(a => `${a.title} (${a.type})`))}
                  
                  {recentActivity.map((activity, index) => (
                    <React.Fragment key={activity.id || `activity-${index}`}>
                      {index > 0 && <Divider variant="inset" component="li" />}
                      <ListItem 
                        alignItems="flex-start"
                        onClick={() => handleActivityClick(activity.type, activity.associatedId)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <ListItemIcon>
                          {getActivityIcon(activity.type)}
                        </ListItemIcon>
                        <ListItemText
                          primary={activity.title}
                          secondary={
                            <>
                              <Typography
                                sx={{ display: 'block' }}
                                component="span"
                                variant="body2"
                                color="text.primary"
                              >
                                {formatDistanceToNow(activity.timestamp, { 
                                  addSuffix: true,
                                  includeSeconds: true 
                                })}
                              </Typography>
                              <Typography
                                component="span"
                                variant="caption"
                                color="text.secondary"
                              >
                                {/* Use date-fns format for consistent date display */}
                                {format(activity.timestamp, 'PPP p')}
                              </Typography>
                            </>
                          }
                        />
                      </ListItem>
                    </React.Fragment>
                  ))}
                </List>
              ) : (
                <Box sx={{ p: 2, textAlign: 'center' }}>
                  <Typography color="text.secondary">
                    No recent activity found. Start by adding parts or writing journal entries.
                  </Typography>
                  <Button 
                    variant="outlined" 
                    size="small" 
                    sx={{ mt: 2 }}
                    onClick={() => navigate('/parts/new')}
                  >
                    Add Your First Part
                  </Button>
                </Box>
              )}
            </Paper>
          </Grid>
          
          {/* Recommendations */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Typography variant="h6" gutterBottom>
                Personalized Recommendations
              </Typography>
              
              {ifsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : recommendations && recommendations.length > 0 ? (
                <Box>
                  {recommendations.map(recommendation => (
                    <Card key={recommendation.id || `rec-${recommendation.type}`} sx={{ mb: 2 }}>
                      <CardContent sx={{ pb: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 1 }}>
                          <Box sx={{ mr: 1, pt: 0.5 }}>
                            {getRecommendationIcon(recommendation.type)}
                          </Box>
                          <Box>
                            <Typography variant="h6" component="div">
                              {recommendation.title}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {recommendation.description}
                            </Typography>
                          </Box>
                        </Box>
                      </CardContent>
                      <CardActions>
                        <Button 
                          size="small" 
                          endIcon={<NavigateNextIcon />}
                          onClick={() => navigate(recommendation.path)}
                        >
                          {recommendation.action}
                        </Button>
                      </CardActions>
                    </Card>
                  ))}
                </Box>
              ) : (
                <Box sx={{ p: 2, textAlign: 'center' }}>
                  <Typography color="text.secondary">
                    No recommendations at this time. Try adding more parts to your system.
                  </Typography>
                  <Button 
                    variant="outlined" 
                    size="small" 
                    sx={{ mt: 2 }}
                    onClick={() => navigate('/parts/new')}
                  >
                    Add a Part
                  </Button>
                </Box>
              )}
            </Paper>
          </Grid>
          
          {/* Second row: Visualizations */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2, mb: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" gutterBottom sx={{ mb: 0 }}>
                  System Visualizations
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => navigate('/system-map')}
                  startIcon={<AccountTreeIcon />}
                >
                  Full System Map
                </Button>
              </Box>
              
              {ifsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                  <CircularProgress />
                </Box>
              ) : system && partsForMap.length > 0 ? (
                <Grid container spacing={3}>
                  {/* Parts Distribution Chart */}
                  <Grid item xs={12} md={4}>
                    <Paper elevation={2} sx={{ p: 2, height: '100%' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <DonutLargeIcon color="primary" sx={{ mr: 1 }} />
                        <Typography variant="subtitle1">Parts by Role</Typography>
                      </Box>
                      <PartsDistributionChart 
                        parts={partsForMap}
                        height={220} 
                      />
                    </Paper>
                  </Grid>
                  
                  {/* Emotions Chart */}
                  <Grid item xs={12} md={4}>
                    <Paper elevation={2} sx={{ p: 2, height: '100%' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <BarChartIcon color="primary" sx={{ mr: 1 }} />
                        <Typography variant="subtitle1">Emotions Across Parts</Typography>
                      </Box>
                      <EmotionsChart 
                        parts={partsForMap}
                        height={220} 
                      />
                    </Paper>
                  </Grid>
                  
                  {/* Mini System Map */}
                  <Grid item xs={12} md={4}>
                    <Paper elevation={2} sx={{ p: 2, height: '100%' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <AccountTreeIcon color="primary" sx={{ mr: 1 }} />
                        <Typography variant="subtitle1">Mini System Map</Typography>
                      </Box>
                      <MiniSystemMap 
                        parts={partsForMap}
                        relationships={relationshipsForMap}
                        height={220}
                        maxNodes={8}
                      />
                    </Paper>
                  </Grid>
                </Grid>
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography color="text.secondary" paragraph>
                    Add parts to your system to see visualizations
                  </Typography>
                  <Button
                    variant="contained"
                    onClick={() => navigate('/parts/new')}
                  >
                    Add Your First Part
                  </Button>
                </Box>
              )}
            </Paper>
          </Grid>

          {/* Reflection for Today */}
          <Grid item xs={12}>
            <Paper sx={{ p: 3, borderRadius: 2, bgcolor: 'primary.main', color: 'white' }}>
              <Typography variant="h6" gutterBottom>
                Reflection for Today
              </Typography>
              <Typography variant="body1" sx={{ fontStyle: 'italic', maxWidth: '80%' }}>
                {currentPrompt}
              </Typography>
              <Box sx={{ display: 'flex', mt: 2 }}>
                <Button 
                  variant="text" 
                  color="inherit" 
                  size="small"
                  onClick={refreshPrompt}
                  sx={{ mr: 2 }}
                  startIcon={<RefreshIcon />}
                >
                  New Prompt
                </Button>
                <Button 
                  variant="contained" 
                  sx={{ 
                    mt: 2, 
                    backgroundColor: 'white', 
                    color: 'primary.main',
                    '&:hover': {
                      backgroundColor: 'rgba(255,255,255,0.9)',
                    }
                  }}
                  onClick={() => navigate('/journal', { 
                    state: { selectedPrompt: currentPrompt } 
                  })}
                >
                  Journal About This
                </Button>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </Container>
  );
};

export default Dashboard; 