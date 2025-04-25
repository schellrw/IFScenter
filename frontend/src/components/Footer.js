import React from 'react';
import { Box, Typography, Link, Container } from '@mui/material';

function Footer() {
    const currentYear = new Date().getFullYear();

    return (
        <Box 
            component="footer" 
            sx={{
                py: 3, 
                px: 2, 
                mt: 'auto', // Pushes footer to bottom if content is short
                backgroundColor: (theme) => 
                    theme.palette.mode === 'light' 
                    ? theme.palette.grey[200] 
                    : theme.palette.grey[800],
                borderTop: '1px solid',
                borderColor: (theme) => theme.palette.divider,
            }}
        >
            <Container maxWidth="lg">
                <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 1 }}>
                    © {currentYear} Artificial Intelligentsia, LLC. All Rights Reserved.
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
                    <Link component="a" href="/privacy-policy" variant="body2" color="text.secondary">
                        Privacy Policy
                    </Link>
                    <Link component="a" href="/terms-of-service" variant="body2" color="text.secondary">
                        Terms of Service
                    </Link>
                </Box>
            </Container>
        </Box>
    );
}

export default Footer; 