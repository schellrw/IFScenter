import React, { useEffect } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext'; // Adjust path
import {
    Container,
    Typography,
    Button,
    Box,
    Alert,
    AlertTitle
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

function PaymentSuccessPage() {
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get('session_id'); // Optional: get session ID if needed
    const { fetchUserProfile } = useAuth(); // Get function to refresh user data

    // Fetch updated user profile when the component mounts
    // to reflect the new subscription status immediately.
    useEffect(() => {
        if (fetchUserProfile) {
            console.log("Payment successful, fetching updated user profile...");
            fetchUserProfile(); 
        }
    }, [fetchUserProfile]);

    return (
        <Container maxWidth="sm" sx={{ mt: 4, textAlign: 'center' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <CheckCircleOutlineIcon sx={{ fontSize: 60, color: 'success.main' }} />
                <Typography variant="h4" component="h1" gutterBottom>
                    Payment Successful!
                </Typography>
                <Alert severity="success" sx={{ width: '100%', justifyContent: 'center' }}>
                    <AlertTitle>Thank You!</AlertTitle>
                    Your subscription has been activated.
                </Alert>
                {sessionId && 
                    <Typography variant="caption" color="text.secondary">
                        Session ID: {sessionId}
                    </Typography>
                }
                <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                    <Button component={RouterLink} to="/" variant="contained">
                        Go to Dashboard
                    </Button>
                    <Button component={RouterLink} to="/account-settings" variant="outlined">
                        View Account Settings
                    </Button>
                 </Box>
            </Box>
        </Container>
    );
}

export default PaymentSuccessPage; 