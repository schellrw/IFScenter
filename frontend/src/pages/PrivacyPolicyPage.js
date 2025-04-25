import React, { useState, useEffect } from 'react';
import { CircularProgress, Alert } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import { API_BASE_URL } from '../utils/api';

function PrivacyPolicyPage() {
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchPolicy = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await fetch(`${API_BASE_URL}/api/legal/privacy-policy`);
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
                console.error("Failed to fetch privacy policy:", err);
                setError(err.message || "Failed to load content.");
            } finally {
                setLoading(false);
            }
        };

        fetchPolicy();
    }, []);

    if (loading) {
        return <CircularProgress />;
    }

    if (error) {
        return <Alert severity="error">Error loading policy: {error}</Alert>;
    }

    console.log("Rendering Markdown Content (Privacy - Simplified):", typeof content);
    return <ReactMarkdown children={content} />;
}

export default PrivacyPolicyPage; 