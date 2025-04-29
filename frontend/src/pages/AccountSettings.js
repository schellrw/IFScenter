import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom'; // Use Link for internal navigation
// Use axios directly
import axios from 'axios'; 
import { useAuth } from '../context/AuthContext'; // Adjust path
import {
    Container,
    Typography,
    Paper,
    Button,
    Box,
    CircularProgress,
    Alert,
    Chip,
    TextField,
    IconButton
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';

// Get Base URL 
let API_BASE_URL = process.env.REACT_APP_API_URL;
if (!API_BASE_URL) {
    API_BASE_URL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000';
}
API_BASE_URL = API_BASE_URL.replace(/["|']/g, '');
API_BASE_URL = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;

function AccountSettings() {
    // Destructure relevant states and objects from AuthContext
    const { 
        supabaseUser, 
        currentUser, 
        loading, 
        isAuthenticated, 
        // fetchUserProfile // No longer needed
    } = useAuth();
    
    // State for Editing Name
    const [editMode, setEditMode] = useState(false);
    const [editableName, setEditableName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    // Initialize editableName when currentUser loads or changes
    useEffect(() => {
        if (currentUser) {
            setEditableName(currentUser.first_name || '');
        }
    }, [currentUser]);
    
    const [isManagingSubscription, setIsManagingSubscription] = useState(false);
    const [error, setError] = useState(null);

    // Function to handle saving the name
    const handleSaveName = async () => {
        setIsSaving(true);
        setSaveError('');
        try {
            // Update endpoint URL to include /auth
            const response = await axios.put(`${API_BASE_URL}/api/auth/profile`, 
                { firstName: editableName }, 
                // Ensure token is sent if using custom JWT or relying on default header
            );
            
            if (response.status === 200) {
                // Successfully updated
                // await fetchUserProfile(); // Removed call - AuthContext now handles updates
                // The profile *should* update automatically in AuthContext
                // if the PUT request somehow triggers a token refresh or session update.
                // If not, a manual page refresh might be needed until that logic is refined.
                setEditMode(false);
            } else {
                throw new Error(response.data?.message || 'Failed to update profile');
            }
        } catch (err) {
            console.error("Error updating profile:", err);
            setSaveError(err.response?.data?.message || err.message || 'An error occurred while saving.');
        } finally {
            setIsSaving(false);
        }
    };

    // Function to cancel editing
    const handleCancelEdit = () => {
        setEditableName(currentUser?.first_name || ''); // Reset to original name
        setEditMode(false);
        setSaveError('');
    };

    const handleManageSubscription = async () => {
        setIsManagingSubscription(true);
        setError(null);
        console.log("Attempting to create portal session...");
        try {
            const response = await axios.post(`${API_BASE_URL}/api/create-portal-session`);
            if (response && response.data && response.data.url) {
                window.location.href = response.data.url;
            } else {
                console.error('Failed to get portal URL:', response);
                setError("Could not access subscription management. Please try again later.");
                setIsManagingSubscription(false);
            }
        } catch (err) {
            console.error("Error creating portal session:", err);
             const errorMsg = err.response?.data?.error || "An error occurred.";
             if (err.response?.status === 400 && errorMsg.includes("No active subscription")) {
                 setError("You don't have an active subscription to manage.");
             } else {
                 setError(`Error: ${errorMsg}`);
             }
            setIsManagingSubscription(false);
        }
    };

    // Updated Loading check: Use the 'loading' state from AuthContext
    // This covers initial check, auth setup, AND profile fetch
    if (loading) {
        return (
            <Container maxWidth="sm" sx={{ mt: 4, textAlign: 'center' }}>
                <CircularProgress />
                <Typography>Loading account details...</Typography>
            </Container>
        );
    }

    // Additional check: Use isAuthenticated which is based on supabaseUser OR token
    if (!isAuthenticated) {
         return (
             <Container maxWidth="sm" sx={{ mt: 4 }}>
                 <Alert severity="warning">Please log in to view your account settings.</Alert>
                 {/* Optional: Add a link to the login page */}
                 <Box sx={{ mt: 2, textAlign: 'center' }}>
                     <Button component={Link} to="/login" variant="contained">Login</Button>
                 </Box>
             </Container>
         );
    }
    
    // Determine Tier and Message using currentUser (fetched from /api/auth/me)
    let tierDisplay = 'Free';
    let tierMessage = null;
    let tierChipColor = "default";

    // Use optional chaining on currentUser for subscription info
    if (currentUser?.subscription_tier === 'pro') {
        tierDisplay = 'Pro';
        tierChipColor = "info";
        tierMessage = (
            <>
                <Typography variant="body2" sx={{ mb: 1 }}>
                    You have access to increased limits. Consider upgrading for unlimited features!
                </Typography>
                <Link to="/pricing" style={{ textDecoration: 'none' }}>
                    <Button variant="outlined" size="small">View Unlimited Plan</Button>
                </Link>
            </>
        );
    } else if (currentUser?.subscription_tier === 'unlimited') {
        tierDisplay = 'Unlimited';
        tierChipColor = "success";
        tierMessage = (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                You have unlimited access to all features. Thank you for your support!
            </Typography>
        );
    } else { // Free Tier
        tierMessage = (
             <Box>
                 <Typography variant="body2" sx={{ mb: 1 }}>
                     Unlock higher limits for Parts, Journal Entries, Guided Messages, and access enhanced AI models by upgrading your plan!
                 </Typography>
                 <Link to="/pricing" style={{ textDecoration: 'none' }}>
                     <Button variant="outlined" size="small">View Upgrade Options</Button>
                 </Link>
             </Box> 
        );
    }

    return (
        <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
            <Typography variant="h4" component="h1" gutterBottom>
                Account Settings
            </Typography>

            <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom>User Information</Typography>
                {/* Hide Username */}
                {/* <Typography><strong>Username:</strong> {currentUser?.username || 'N/A'}</Typography> */}
                {/* Display email from currentUser */}
                <Typography sx={{ mb: 1 }}>
                    <strong>Email:</strong> {currentUser?.email || 'N/A'}
                </Typography>
                
                {/* Name Display/Edit Section */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {!editMode ? (
                        <>
                            <Typography>
                                <strong>Name:</strong> {currentUser?.first_name || 'Not set'}
                            </Typography>
                            <IconButton size="small" onClick={() => setEditMode(true)} aria-label="Edit name">
                                <EditIcon fontSize="inherit" />
                            </IconButton>
                        </>
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                            <TextField 
                                label="Name"
                                variant="outlined"
                                size="small"
                                fullWidth
                                value={editableName}
                                onChange={(e) => setEditableName(e.target.value)}
                                error={!!saveError}
                                helperText={saveError}
                                sx={{ mb: 1 }}
                            />
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <Button 
                                    variant="contained"
                                    size="small"
                                    onClick={handleSaveName}
                                    disabled={isSaving}
                                >
                                    {isSaving ? <CircularProgress size={20} color="inherit"/> : 'Save'}
                                </Button>
                                <Button variant="outlined" size="small" onClick={handleCancelEdit} disabled={isSaving}>
                                    Cancel
                                </Button>
                            </Box>
                        </Box>
                    )}
                </Box>
                
            </Paper>

            <Paper elevation={3} sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>Subscription</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                     <Typography><strong>Current Plan:</strong></Typography>
                     <Chip label={tierDisplay} color={tierChipColor} size="small" />
                </Box>
                
                {tierMessage} 

                {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>} 

                {/* Only show Manage Subscription if NOT Free tier - use currentUser */}
                {currentUser?.subscription_tier && currentUser?.subscription_tier !== 'free' && (
                     <Button 
                        variant="contained"
                        onClick={handleManageSubscription} 
                        disabled={isManagingSubscription}
                        startIcon={isManagingSubscription ? <CircularProgress size={20} color="inherit" /> : null}
                        sx={{ mt: tierMessage ? 1 : 0 }} // Add margin if there was a message above
                     >
                        {isManagingSubscription ? 'Loading Portal...' : 'Manage Subscription'}
                     </Button>
                )}
             </Paper>

            {/* TODO: Add sections for Password Change, Delete Account etc. */}
        </Container>
    );
}

export default AccountSettings; 