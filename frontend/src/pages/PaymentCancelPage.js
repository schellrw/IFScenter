import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    Container,
    Typography,
    Button,
    Box,
    Alert,
    AlertTitle
} from '@mui/material';
import CancelIcon from '@mui/icons-material/Cancel';

function PaymentCancelPage() {
    return (
        <Container maxWidth="sm" sx={{ mt: 4, textAlign: 'center' }}>
             <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <CancelIcon sx={{ fontSize: 60, color: 'error.main' }} />
                <Typography variant="h4" component="h1" gutterBottom>
                    Payment Canceled
                </Typography>
                <Alert severity="warning" sx={{ width: '100%', justifyContent: 'center' }}>
                    <AlertTitle>Checkout Canceled</AlertTitle>
                    Your subscription checkout process was canceled. You have not been charged.
                 </Alert>
                 <Typography variant="body1" sx={{ mt: 1 }}>
                     If this was a mistake, you can return to the plans page.
                 </Typography>
                 <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                    <Button component={RouterLink} to="/pricing" variant="contained">
                        View Plans
                    </Button>
                     <Button component={RouterLink} to="/" variant="outlined">
                        Go to Dashboard
                    </Button>
                 </Box>
            </Box>
        </Container>
    );
}

export default PaymentCancelPage; 