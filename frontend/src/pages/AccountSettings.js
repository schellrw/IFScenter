import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom'; // Use Link for internal navigation
// Use axios directly
import axios from 'axios'; 
import { useAuth } from '../context/AuthContext'; // Adjust path
import {
    Container,
    Typography,
    Paper,
    Divider,
    Button,
    Box,
    CircularProgress,
    Alert,
    Chip
} from '@mui/material';

// Get Base URL 
let API_BASE_URL = process.env.REACT_APP_API_URL;
if (!API_BASE_URL) {
    API_BASE_URL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000';
}
API_BASE_URL = API_BASE_URL.replace(/["|']/g, '');
API_BASE_URL = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;

function AccountSettings() {
    // Destructure with the CORRECT property name: currentUser
    // Also rename it locally to 'user' for consistency within this component if preferred
    const { currentUser: user, fetchUserProfile } = useAuth(); 
    
    const [isManagingSubscription, setIsManagingSubscription] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Always fetch the profile when the component mounts to ensure freshness,
        // especially after potential updates like subscription changes.
        if (fetchUserProfile) { 
            console.log("AccountSettings mounted, fetching user profile...");
            fetchUserProfile(); 
        }
    // Depend only on fetchUserProfile to avoid re-fetching if the user object changes
    // due to the fetch itself, preventing potential loops.
    }, [fetchUserProfile]);

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

    // Loading check
    if (!user) {
        return (
            <Container maxWidth="sm" sx={{ mt: 4, textAlign: 'center' }}>
                <CircularProgress />
                <Typography>Loading account details...</Typography>
            </Container>
        );
    }
    
    // Determine Tier and Message
    let tierDisplay = 'Free';
    let tierMessage = null;
    let tierChipColor = "default";

    if (user.subscription_tier === 'pro') {
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
    } else if (user.subscription_tier === 'unlimited') {
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
                <Typography><strong>Username:</strong> {user.username || 'N/A'}</Typography>
                <Typography><strong>Email:</strong> {user.email || 'N/A'}</Typography>
                <Typography><strong>Full Name:</strong> {user.full_name || 'Not set'}</Typography> 
                {/* TODO: Add Button/Form to edit profile details */}
            </Paper>

            <Paper elevation={3} sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>Subscription</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                     <Typography><strong>Current Plan:</strong></Typography>
                     <Chip label={tierDisplay} color={tierChipColor} size="small" />
                </Box>
                
                {tierMessage} 

                {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>} 

                {/* Only show Manage Subscription if NOT Free tier */}
                {user.subscription_tier && user.subscription_tier !== 'free' && (
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