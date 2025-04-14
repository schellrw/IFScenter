import React, { useState, useEffect, useMemo } from 'react';
import { 
  Container, Typography, Box, Grid, Paper, List, ListItem,
  ListItemText, ListItemIcon, Divider, Button, CircularProgress,
  Card, CardContent, CardActions, IconButton, Tooltip
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
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
import { getGuidedSessions } from '../utils/api';

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

const Dashboard = () => {
  const ifsContextValue = useIFS(); // Get the whole context object
  const { system, loading: ifsLoading, journals, isAuthenticated, localToken } = ifsContextValue; // Destructure

  // Remove console logs added for debugging
  // console.log("Dashboard Render - Raw useIFS() value:", ifsContextValue);
  // console.log("Dashboard Render - Destructured isAuthenticated:", isAuthenticated);

  const [recentActivity, setRecentActivity] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [currentPrompt, setCurrentPrompt] = useState('');
  // Add state for sessions count
  const [sessionsCount, setSessionsCount] = useState(0);
  const navigate = useNavigate();

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

  // Effect to fetch recent activity and generate recommendations
  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      // Guard: Ensure we have the necessary context data before proceeding
      // (This check is good, ensures fetchData doesn't run with incomplete data)
      if (!isAuthenticated || !system || !journals) {
         if (DEBUG) console.log("FetchData skipped: Missing auth, system, or journals.", { isAuthenticated, hasSystem: !!system, hasJournals: !!journals });
         setLoadingActivity(false); 
         return;
      }
      // Log *after* guard passes
      if (DEBUG) console.log("FetchData Guard PASSED. Proceeding...");
      
      if (DEBUG) console.log("FetchData proceeding: User authenticated and context data available.");
      setLoadingActivity(true);
      
      try {
        if (DEBUG) {
          console.log("Beginning fetchData execution with data:", {
            hasSystem: !!system,
            systemId: system?.id,
            journalsAvailable: !!journals,
            journalCount: journals?.length || 0,
            isAuthenticated,
            lastUpdateCheck,
            fetchGuidedSessions: true 
          });
        }
        
        // Use journals from context directly
        let journalData = journals || []; // Already guarded above, but keep for safety
        
        // Fetch Guided Sessions 
        let guidedSessionData = [];
        try {
          // Log *before* calling getGuidedSessions
          if (DEBUG) console.log("Attempting to call getGuidedSessions...");
          const response = await getGuidedSessions(localToken); 
          // Log raw session response
          console.log("Raw response from getGuidedSessions:", response);
          if (response && response.sessions) {
            guidedSessionData = response.sessions;
            if (DEBUG) {
              console.log(`Fetched ${guidedSessionData.length} guided sessions. First session:`, guidedSessionData[0]);
            }
            // Set the sessions count state
            if (isMounted) {
                setSessionsCount(guidedSessionData.length);
            }
          } else {
            console.warn("Failed to fetch guided sessions or response format unexpected:", response);
          }
        } catch (err) {
          console.error("Error fetching guided sessions:", err);
        }
        
        if (!isMounted) return; 
        
        const allActivity = [];
        
        // Process Journal entries
        if (journalData && journalData.length > 0) {
           // ... (existing journal processing logic) ...
           journalData.forEach(journal => {
              if (journal && journal.id) {
                const rawTimestamp = journal.created_at || journal.date;
                const timestamp = getStableTimestamp(journal.id, rawTimestamp);
                allActivity.push({
                  type: 'journal',
                  id: journal.id,
                  title: journal.title || 'Untitled Journal',
                  timestamp,
                  associatedId: journal.id,
                  sortKey: timestamp.getTime()
                });
              }
            });
        }
        
        // Process Guided sessions
        if (guidedSessionData && guidedSessionData.length > 0) {
           // ... (existing session processing logic) ...
            guidedSessionData.forEach(session => {
              if (session && session.id) {
                const rawTimestamp = session.updated_at;
                const timestamp = getStableTimestamp(`session-${session.id}`, rawTimestamp);
                allActivity.push({
                  type: 'guided_session',
                  id: session.id,
                  title: session.title || `Session started ${format(timestamp, 'P')}`,
                  topic: session.topic,
                  timestamp,
                  associatedId: session.id,
                  sortKey: timestamp.getTime()
                });
              }
            });
        }
        
        // Log after processing sessions
        if (DEBUG) console.log("allActivity after processing sessions:", [...allActivity]);
        
        // Process Parts 
        // Ensure system and system.parts exist (already checked by initial guard, but good practice)
        if (system && system.parts) {
          const parts = Object.values(system.parts);
          // ... (existing part creation/update processing logic into allActivity) ...
          // NOTE: The original code added part activities to a *separate* `partActivities` array
          // It should add them to `allActivity` directly.
          parts.forEach(part => {
            const prevPartState = previousPartsState[part.id];
            const partCreatedAt = getStableTimestamp(`part-created-${part.id}`, part.created_at);
            const partUpdatedAt = getStableTimestamp(`part-updated-${part.id}`, part.updated_at);
            
            // Creation Activity
            allActivity.push({
              type: 'part_created',
              id: part.id,
              // Use description for title for consistency?
              title: `Part created: ${part.name}`, 
              timestamp: partCreatedAt,
              associatedId: part.id,
              sortKey: partCreatedAt.getTime()
            });
            
            // Update Activity
            if (prevPartState && partUpdatedAt > lastUpdateCheck) {
                let changes = [];
                // ... (check for changes) ...
                 if (changes.length > 0) {
                     allActivity.push({
                        type: 'part_updated',
                        id: part.id,
                        title: `Part updated: ${part.name} (${changes.join(', ')})`, 
                        timestamp: partUpdatedAt,
                        associatedId: part.id,
                        sortKey: partUpdatedAt.getTime()
                     });
                 }
            }
          });
        }
        
        // Log after processing parts
        if (DEBUG) console.log("allActivity after processing parts:", [...allActivity]);
        
        // Process Relationships
        // Ensure system and system.relationships exist (already checked by initial guard)
        if (system && system.relationships) {
           // ... (existing relationship processing logic into allActivity) ...
           Object.values(system.relationships).forEach(rel => {
              const sourcePart = system.parts[rel.source_id]?.name || 'Unknown';
              const targetPart = system.parts[rel.target_id]?.name || 'Unknown';
              const rawTimestamp = rel.created_at;
              const timestamp = getStableTimestamp(rel.id, rawTimestamp);
              allActivity.push({
                type: 'relationship', // Need an icon/handler for this type too
                id: rel.id,
                title: `Relationship created: "${sourcePart}" → "${targetPart}"`, 
                timestamp,
                associatedId: rel.id, // Or maybe navigate to system map?
                sortKey: timestamp.getTime()
              });
            });
        }
        
        // Log after processing relationships
        if (DEBUG) console.log("allActivity after processing relationships:", [...allActivity]);
        
        // Helper for comparing arrays (needed for part update check)
        const arraysEqual = (a, b) => {
          if (a === b) return true;
          if (a == null || b == null) return false;
          if (a.length !== b.length) return false;
          for (let i = 0; i < a.length; ++i) {
            if (a[i] !== b[i]) return false;
          }
          return true;
        };
        
        // Filter, Sort and set state
        const validActivity = allActivity.filter(item => item.timestamp instanceof Date && !isNaN(item.timestamp.getTime()));
        const sortedActivity = validActivity
          .sort((a, b) => b.sortKey - a.sortKey)
          .slice(0, 10);
          
        // Log final sorted activity
        if (DEBUG) console.log("Final sortedActivity before setting state:", [...sortedActivity]);
            
        if (isMounted) {
          setRecentActivity(sortedActivity);
          if (DEBUG) {
              console.log("Set recentActivity state with", sortedActivity.length, "items");
          }
          
          // --- Generate Recommendations --- 
          // Use parts and journalData which are guaranteed available here
          const parts = system?.parts ? Object.values(system.parts) : [];
          const newRecommendations = [];
          
          // Add recommendations based on system state
          const partsCount = parts.length;
          const journalsCount = journalData.length;
          
          // Check if parts exist
          if (partsCount === 0) {
            newRecommendations.push({
              type: 'part', // Corresponds to getRecommendationIcon
              title: 'Identify Your First Part',
              description: 'Start by identifying your first internal part to begin mapping your system.',
              action: 'Create Part',
              path: '/parts/new'
            });
          } else if (partsCount < 3) {
            newRecommendations.push({
              type: 'part',
              title: 'Add More Parts',
              description: 'Continue identifying internal parts to better understand your system.',
              action: 'Create Part',
              path: '/parts/new'
            });
          }
          
          // Journal recommendations
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
          
          // Relationship recommendations
          if (partsCount >= 2 && (!system.relationships || Object.keys(system.relationships).length === 0)) {
            newRecommendations.push({
              type: 'relationship',
              title: 'Map Relationships',
              description: 'Start connecting parts to understand how they interact.',
              action: 'Add Relationship',
              path: '/relationships' // Assuming this is the correct path
            });
          }
          
          // Recommendation: Review parts not updated recently
          const now = new Date();
          const oneWeekAgo = new Date(now.setDate(now.getDate() - 7));
          const oldParts = parts.filter(p => {
            const updatedDate = parseTimestamp(p.updated_at);
            return updatedDate < oneWeekAgo;
          });
          if (oldParts.length > 0 && newRecommendations.length < 3) {
            const targetPart = oldParts[0];
            newRecommendations.push({
              type: 'part_checkin', // Use a specific type for this
              title: `Check in with '${targetPart.name}'`,
              description: `It's been a while since you updated '${targetPart.name}'. Check in and see if anything has changed.`,
              action: 'View Part',
              path: `/parts/${targetPart.id}`
            });
          }
          
          // Recommendation: Use a journal prompt
          if (currentPrompt && newRecommendations.length < 3) { 
            newRecommendations.push({
              type: 'journal', // Reuse journal type/icon
              title: 'Reflect on a Prompt',
              description: `Try journaling about: "${currentPrompt}"`, 
              action: 'Journal About This',
              path: '/journal',
              // Pass prompt in state if JournalPage uses it
              state: { selectedPrompt: currentPrompt } 
            });
          }
          
          // Visualization/Fallback recommendation
          newRecommendations.push({
            type: 'visualization', // Need icon for this?
            title: 'Visualize Your System',
            description: 'See a visual representation of your internal family system.',
            action: 'View Map',
            path: '/system-map'
          });
          
          // Assign unique IDs
          newRecommendations.forEach((rec, index) => { rec.id = `rec-${index}-${rec.type}`; });
          
          // Log generated recommendations before shuffle/set
          if (DEBUG) console.log("Generated newRecommendations:", [...newRecommendations]);
            
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

    // --- Decision Logic based on Context State --- 
    if (ifsLoading) {
      // Context is still loading, ensure dashboard shows loading
      setLoadingActivity(true);
      if (DEBUG) console.log("Dashboard effect waiting: ifsLoading is true.");
    } else {
      // Context is done loading (ifsLoading is false)
      if (isAuthenticated && system && journals) {
        // Ready to fetch activity data
        if (DEBUG) console.log("Dashboard effect triggering fetchData: Auth=true, System & Journals ready.");
        fetchData(); 
      } else if (!isAuthenticated) {
        // Definitively not authenticated after loading
        if (DEBUG) console.log("Dashboard effect clearing data: Auth=false after load.");
        setLoadingActivity(false); // Stop loading
        setRecentActivity([]);
        setRecommendations([]);
      } else {
        // Authenticated, but system/journals missing (should not happen ideally)
        if (DEBUG) console.log("Dashboard effect waiting: Auth=true but System/Journals missing after load.");
        setLoadingActivity(false); // Stop loading, show empty state? Or context handles this?
        setRecentActivity([]);   // Clear just in case
        setRecommendations([]);
      }
    }

    return () => {
      isMounted = false; 
    };
    // Bring back ifsLoading dependency to handle the initial loading state correctly
  }, [isAuthenticated, ifsLoading, system, journals, lastUpdateCheck, currentPrompt, previousPartsState, localToken]); 

  // Memoize the parts and relationships arrays for the MiniSystemMap
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const partsForMap = useMemo(() => {
    return system && system.parts ? Object.values(system.parts) : [];
  }, [system?.parts]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const relationshipsForMap = useMemo(() => {
    return system && system.relationships ? Object.values(system.relationships) : [];
  }, [system?.relationships]);

  const handleActivityClick = (type, id) => {
    if (!id) {
      console.warn('Activity click handler received null or undefined id for type:', type);
      return;
    }
    switch (type) {
      case 'journal':
        navigate(`/journal/${id}`);
        break;
      case 'part_created':
      case 'part_updated':
        navigate(`/parts/${id}`);
        break;
      case 'guided_session': // Add case for guided sessions
        navigate(`/guided-session/${id}`); // Navigate to session detail page
        break;
      case 'relationship':
        navigate('/system-map'); // Example: Navigate to map for relationships
        break;
      default:
        console.log(`Unhandled activity type click: ${type}`);
    }
  };

  const getActivityIcon = (type) => {
    switch (type) {
      case 'journal':
        return <EditNoteIcon />;
      case 'part_created':
        return <PersonAddIcon color="success" />;
      case 'part_updated':
        return <UpdateIcon color="action" />;
      case 'guided_session': // Add icon for guided sessions
        return <EmojiPeopleIcon color="primary" />; // Example icon
      case 'relationship':
        return <CompareArrowsIcon color="info" />; // Add icon for relationships
      default:
        return <LightbulbIcon />;
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

        <Grid container spacing={3} alignItems="stretch">
          {/* System Overview */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
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
                    {/* Display Guided Sessions Count from state */}
                    <Typography>
                      Guided Sessions: {sessionsCount}
                    </Typography>
                    <Typography>
                      Journal Entries: {journals?.length || 0}
                    </Typography>
                  </Box>
                  
                  <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
                    Quick Links
                  </Typography>
                  {/* Stack buttons vertically */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {/* Reorder and restyle buttons */}
                    <Button 
                      variant="contained" /* Make primary */
                      size="small" 
                      onClick={() => navigate('/sessions')} // Navigate to the sessions list page
                    >
                      Start Guided Session
                    </Button>
                    <Button 
                      variant="outlined" /* Change back to outlined */
                      size="small" 
                      onClick={() => navigate('/parts/new')}
                    >
                      Add New Part
                    </Button>
                    {/* Add View/Edit Parts button */}
                     <Button 
                      variant="outlined" 
                      size="small" 
                      onClick={() => navigate('/parts')} // Link to parts list page
                    >
                      View / Edit Parts
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
                  
                  {/* Update Quote variant */}
                  <Typography 
                    variant="body2" /* Make quote slightly larger */
                    sx={{ 
                      mt: 3, 
                      display: 'block', 
                      fontStyle: 'italic', 
                      color: 'text.secondary' 
                    }}
                  >
                    "No Bad Parts" - Richard C. Schwartz, Ph.D.
                  </Typography>
                </>
              )}
            </Paper>
          </Grid>
          
          {/* Recent Activity */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
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
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2, flexGrow: 1, alignItems: 'center' }}>
                  <CircularProgress size={24} />
                </Box>
              ) : recentActivity && recentActivity.length > 0 ? (
                <List dense sx={{ height: '400px', overflow: 'auto' }}>
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
                          primary={
                            activity.type === 'guided_session' && activity.topic 
                            ? activity.topic // Show topic if it's a session and topic exists
                            : activity.title // Otherwise, show the title
                          }
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
            <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Typography variant="h6" gutterBottom>
                Personalized Recommendations
              </Typography>
              
              {loadingActivity ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2, flexGrow: 1, alignItems: 'center' }}>
                  <CircularProgress size={24} />
                </Box>
              ) : recommendations && recommendations.length > 0 ? (
                <Box sx={{ height: '400px', overflow: 'auto' }}>
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