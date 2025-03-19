import React, { useState, useEffect, useRef } from 'react';
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
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

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
          
          Object.values(system.parts).forEach(part => {
            // Track all part updates for this run to ensure we show the most recent one
            const partUpdates = [];
            
            // Add part creation to activity if it has a created_at timestamp
            if (part.created_at) {
              const createdTimestamp = getStableTimestamp(`${part.id}-created`, part.created_at);
              
              partUpdates.push({
                type: 'part_created',
                id: `${part.id}-created`,
                title: `Part created: "${part.name}"`,
                timestamp: createdTimestamp,
                associatedId: part.id,
                sortKey: createdTimestamp.getTime()
              });
            }
            
            // Only detect genuine updates by comparing with previous state
            const previousPart = previousPartsState[part.id];
            
            // Detect actual content changes between previous and current state
            if (previousPart) {
              // Check for content changes by comparing stringified arrays
              const feelingsChanged = JSON.stringify(previousPart.feelings) !== JSON.stringify(part.feelings || []);
              const beliefsChanged = JSON.stringify(previousPart.beliefs) !== JSON.stringify(part.beliefs || []);
              const triggersChanged = JSON.stringify(previousPart.triggers) !== JSON.stringify(part.triggers || []);
              const needsChanged = JSON.stringify(previousPart.needs) !== JSON.stringify(part.needs || []);
              
              // Check for description or role changes - handle undefined/null values properly
              // Normalize values to make comparison more reliable against empty strings, null, undefined
              const normalizeValue = (val) => {
                return val === null || val === undefined || val === '' ? null : val;
              };
              
              const descriptionChanged = 
                normalizeValue(previousPart.description) !== normalizeValue(part.description);
              const roleChanged = 
                normalizeValue(previousPart.role) !== normalizeValue(part.role);
              
              const hasContentChanged = feelingsChanged || beliefsChanged || triggersChanged || 
                                        needsChanged || descriptionChanged || roleChanged;
              
              // Use updated_at if available, or create a synthetic one
              let updatedTimestamp;
              
              if (part.updated_at && part.updated_at !== part.created_at) {
                // Use the provided timestamp
                updatedTimestamp = getStableTimestamp(`${part.id}-updated`, part.updated_at);
              } else if (hasContentChanged) {
                // Create a synthetic timestamp for sorting purposes
                updatedTimestamp = new Date(); 
                
                if (DEBUG) {
                  console.log(`No updated_at timestamp for part "${part.name}" despite content changes, using current time`);
                }
              }
              
              if (DEBUG) {
                console.log(`Checking part "${part.name}" for changes:`, {
                  id: part.id,
                  hasTimestamp: !!part.updated_at,
                  hasContentChanged,
                  feelingsChanged,
                  beliefsChanged,
                  triggersChanged,
                  needsChanged,
                  descriptionChanged,
                  roleChanged,
                  // Add complete field values to see the actual data
                  previousDescription: previousPart.description,
                  currentDescription: part.description,
                  previousRole: previousPart.role,
                  currentRole: part.role
                });
              }
              
              // If we have content changes and a timestamp, add specific updates
              if (hasContentChanged && updatedTimestamp) {
                if (DEBUG) {
                  console.log(`Part "${part.name}" has updates - processing changes`);
                }
                
                // Capture the specific changes for feelings, beliefs, triggers, and needs
                if (feelingsChanged || beliefsChanged || triggersChanged || needsChanged) {
                  if (DEBUG) {
                    console.log(`Part "${part.name}" has attribute changes:`, {
                      feelingsChanged,
                      beliefsChanged,
                      triggersChanged,
                      needsChanged,
                      previousFeelings: previousPart.feelings || [],
                      currentFeelings: part.feelings || [],
                      previousBeliefs: previousPart.beliefs || [],
                      currentBeliefs: part.beliefs || [],
                      previousTriggers: previousPart.triggers || [],
                      currentTriggers: part.triggers || [],
                      previousNeeds: previousPart.needs || [],
                      currentNeeds: part.needs || [],
                    });
                  }
                  
                  // Compare feelings
                  if (feelingsChanged) {
                    // Find what feelings were added (those in current but not in previous)
                    const newFeelings = (part.feelings || []).filter(
                      feeling => !(previousPart.feelings || []).includes(feeling)
                    );
                    
                    if (newFeelings.length > 0) {
                      console.log(`Adding ${newFeelings.length} new feelings to activity feed for "${part.name}"`);
                      partUpdates.push({
                        type: 'part_updated',
                        id: `${part.id}-updated-feelings-${Date.now()}`,
                        title: `Added feelings to "${part.name}": ${newFeelings.join(', ')}`,
                        timestamp: updatedTimestamp,
                        associatedId: part.id,
                        updateType: 'feelings',
                        sortKey: updatedTimestamp.getTime()
                      });
                    }
                    
                    // Find what feelings were removed
                    const removedFeelings = (previousPart.feelings || []).filter(
                      feeling => !(part.feelings || []).includes(feeling)
                    );
                    
                    if (removedFeelings.length > 0) {
                      console.log(`Adding ${removedFeelings.length} removed feelings to activity feed for "${part.name}"`);
                      partUpdates.push({
                        type: 'part_updated',
                        id: `${part.id}-removed-feelings-${Date.now()}`,
                        title: `Removed feelings from "${part.name}": ${removedFeelings.join(', ')}`,
                        timestamp: updatedTimestamp,
                        associatedId: part.id,
                        updateType: 'feelings',
                        sortKey: updatedTimestamp.getTime()
                      });
                    }
                  }
                  
                  // Compare beliefs
                  if (beliefsChanged) {
                    // Find what beliefs were added
                    const newBeliefs = (part.beliefs || []).filter(
                      belief => !(previousPart.beliefs || []).includes(belief)
                    );
                    
                    if (newBeliefs.length > 0) {
                      console.log(`Adding ${newBeliefs.length} new beliefs to activity feed for "${part.name}"`);
                      partUpdates.push({
                        type: 'part_updated',
                        id: `${part.id}-updated-beliefs-${Date.now()}`,
                        title: `Added beliefs to "${part.name}": ${newBeliefs.join(', ')}`,
                        timestamp: updatedTimestamp,
                        associatedId: part.id,
                        updateType: 'beliefs',
                        sortKey: updatedTimestamp.getTime()
                      });
                    }
                    
                    // Find what beliefs were removed
                    const removedBeliefs = (previousPart.beliefs || []).filter(
                      belief => !(part.beliefs || []).includes(belief)
                    );
                    
                    if (removedBeliefs.length > 0) {
                      console.log(`Adding ${removedBeliefs.length} removed beliefs to activity feed for "${part.name}"`);
                      partUpdates.push({
                        type: 'part_updated',
                        id: `${part.id}-removed-beliefs-${Date.now()}`,
                        title: `Removed beliefs from "${part.name}": ${removedBeliefs.join(', ')}`,
                        timestamp: updatedTimestamp,
                        associatedId: part.id,
                        updateType: 'beliefs',
                        sortKey: updatedTimestamp.getTime()
                      });
                    }
                  }
                  
                  // Compare triggers
                  if (triggersChanged) {
                    // Find what triggers were added
                    const newTriggers = (part.triggers || []).filter(
                      trigger => !(previousPart.triggers || []).includes(trigger)
                    );
                    
                    if (newTriggers.length > 0) {
                      console.log(`Adding ${newTriggers.length} new triggers to activity feed for "${part.name}"`);
                      partUpdates.push({
                        type: 'part_updated',
                        id: `${part.id}-updated-triggers-${Date.now()}`,
                        title: `Added triggers to "${part.name}": ${newTriggers.join(', ')}`,
                        timestamp: updatedTimestamp,
                        associatedId: part.id,
                        updateType: 'triggers',
                        sortKey: updatedTimestamp.getTime()
                      });
                    }
                    
                    // Find what triggers were removed
                    const removedTriggers = (previousPart.triggers || []).filter(
                      trigger => !(part.triggers || []).includes(trigger)
                    );
                    
                    if (removedTriggers.length > 0) {
                      console.log(`Adding ${removedTriggers.length} removed triggers to activity feed for "${part.name}"`);
                      partUpdates.push({
                        type: 'part_updated',
                        id: `${part.id}-removed-triggers-${Date.now()}`,
                        title: `Removed triggers from "${part.name}": ${removedTriggers.join(', ')}`,
                        timestamp: updatedTimestamp,
                        associatedId: part.id,
                        updateType: 'triggers',
                        sortKey: updatedTimestamp.getTime()
                      });
                    }
                  }
                  
                  // Compare needs
                  if (needsChanged) {
                    // Find what needs were added
                    const newNeeds = (part.needs || []).filter(
                      need => !(previousPart.needs || []).includes(need)
                    );
                    
                    if (newNeeds.length > 0) {
                      console.log(`Adding ${newNeeds.length} new needs to activity feed for "${part.name}"`);
                      partUpdates.push({
                        type: 'part_updated',
                        id: `${part.id}-updated-needs-${Date.now()}`,
                        title: `Added needs to "${part.name}": ${newNeeds.join(', ')}`,
                        timestamp: updatedTimestamp,
                        associatedId: part.id,
                        updateType: 'needs',
                        sortKey: updatedTimestamp.getTime()
                      });
                    }
                    
                    // Find what needs were removed
                    const removedNeeds = (previousPart.needs || []).filter(
                      need => !(part.needs || []).includes(need)
                    );
                    
                    if (removedNeeds.length > 0) {
                      console.log(`Adding ${removedNeeds.length} removed needs to activity feed for "${part.name}"`);
                      partUpdates.push({
                        type: 'part_updated',
                        id: `${part.id}-removed-needs-${Date.now()}`,
                        title: `Removed needs from "${part.name}": ${removedNeeds.join(', ')}`,
                        timestamp: updatedTimestamp,
                        associatedId: part.id,
                        updateType: 'needs',
                        sortKey: updatedTimestamp.getTime()
                      });
                    }
                  }
                  
                  // Log total number of part updates for debugging
                  if (DEBUG && partUpdates.length > 0) {
                    console.log(`Generated ${partUpdates.length} part updates in total for "${part.name}"`);
                  }
                }
                
                // Look for role or description changes
                if (descriptionChanged || roleChanged) {
                  // Check if the changes are meaningful (not just null/undefined/empty string changes)
                  const hasDescriptionChange = normalizeValue(part.description) !== null &&
                                              normalizeValue(previousPart.description) !== normalizeValue(part.description);
                  
                  const hasRoleChange = normalizeValue(part.role) !== null &&
                                       normalizeValue(previousPart.role) !== normalizeValue(part.role);
                  
                  // Only add to activity if there are meaningful changes
                  if (hasDescriptionChange || hasRoleChange) {
                    let changes = [];
                    if (hasDescriptionChange) changes.push('description');
                    if (hasRoleChange) changes.push('role');
                    
                    partUpdates.push({
                      type: 'part_updated',
                      id: `${part.id}-updated-details-${Date.now()}`,
                      title: `Updated ${changes.join(' and ')} for "${part.name}"`,
                      timestamp: updatedTimestamp,
                      associatedId: part.id,
                      updateType: 'details',
                      sortKey: updatedTimestamp.getTime()
                    });
                  }
                }
                
                // If we detected content changes but couldn't identify specific attribute changes,
                // add a generic update
                if (hasContentChanged && !feelingsChanged && !beliefsChanged && 
                    !triggersChanged && !needsChanged && !descriptionChanged && !roleChanged) {
                  partUpdates.push({
                    type: 'part_updated',
                    id: `${part.id}-updated-general-${Date.now()}`,
                    title: `Part "${part.name}" was updated`,
                    timestamp: updatedTimestamp,
                    associatedId: part.id,
                    updateType: 'general',
                    sortKey: updatedTimestamp.getTime()
                  });
                }
              }
            }
            
            // Add all part-related updates to the activity list
            allActivity.push(...partUpdates);
          });
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
              ) : system && Object.keys(system.parts).length > 0 ? (
                <Grid container spacing={3}>
                  {/* Parts Distribution Chart */}
                  <Grid item xs={12} md={4}>
                    <Paper elevation={2} sx={{ p: 2, height: '100%' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <DonutLargeIcon color="primary" sx={{ mr: 1 }} />
                        <Typography variant="subtitle1">Parts by Role</Typography>
                      </Box>
                      <PartsDistributionChart 
                        parts={system ? Object.values(system.parts) : []} 
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
                        parts={system ? Object.values(system.parts) : []} 
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
                        parts={system ? Object.values(system.parts) : []}
                        relationships={system ? Object.values(system.relationships) : []}
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