import React, { useState } from 'react';
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
    // Destructure relevant states and objects from AuthContext
    const { 
        supabaseUser, 
        currentUser, 
        loading, 
        isAuthenticated 
    } = useAuth();
    
    const [isManagingSubscription, setIsManagingSubscription] = useState(false);
    const [error, setError] = useState(null);

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

    // Additional check: Use isAuthenticated which is based on supabaseUser
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
                {/* Display username from currentUser if available, otherwise N/A */}
                <Typography><strong>Username:</strong> {currentUser?.username || 'N/A'}</Typography>
                {/* Display email from supabaseUser (primary source) */}
                <Typography><strong>Email:</strong> {supabaseUser?.email || 'N/A'}</Typography>
                {/* Display full name from supabaseUser metadata */}
                <Typography><strong>Full Name:</strong> {supabaseUser?.user_metadata?.full_name || 'Not set'}</Typography> 
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