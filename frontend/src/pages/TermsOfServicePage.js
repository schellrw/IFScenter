import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, CircularProgress, Alert } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import { API_BASE_URL } from '../utils/api'; // Corrected import

function TermsOfServicePage() {
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchTerms = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await fetch(`${API_BASE_URL}/api/legal/terms-of-service`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                if (data.content) {
                    setContent(data.content);
                } else {
                    throw new Error("Content not found in response");
                }
            } catch (err) {
                console.error("Failed to fetch terms of service:", err);
                setError(err.message || "Failed to load content.");
            } finally {
                setLoading(false);
            }
        };

        fetchTerms();
    }, []); // Empty dependency array means this runs once on mount

    return (
        <Container maxWidth="md">
            <Box sx={{ my: 4 }}>
                <Typography variant="h4" component="h1" gutterBottom>
                    Terms of Service
                </Typography>
                {loading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
                        <CircularProgress />
                    </Box>
                )}
                {error && (
                    <Alert severity="error" sx={{ my: 2 }}>
                        Error loading terms: {error}
                    </Alert>
                )}
                {!loading && !error && (
                     <Box sx={{ mt: 2, '& p': { mb: 2 }, '& h2': { mt: 3, mb: 1 }, '& ul': { pl: 4, mb: 2 } }}> 
                        {/* Log content type and value before rendering */}
                        {console.log("Rendering Markdown Content (ToS):", typeof content, content)}
                        {/* Apply basic margin styling to common markdown elements */}
                        {/* Explicitly pass content via children prop */}
                        <ReactMarkdown children={content} />
                    </Box>
                )}
            </Box>
        </Container>
    );
}

export default TermsOfServicePage; 