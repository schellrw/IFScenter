import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Container, 
  Paper, 
  TextField, 
  Button, 
  Typography, 
  Box,
  Alert,
  Collapse, 
  Divider
} from '@mui/material';
import { supabase } from '../utils/supabase';
import GoogleIcon from '@mui/icons-material/Google';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const { login, error: authError, detailedError, loading, logout } = useAuth();
  const [localError, setLocalError] = useState('');
  const navigate = useNavigate();

  const displayError = authError || localError;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    try {
      console.log(`Attempting to login user: ${email}`);
      await login(email, password);
      console.log('Login successful, navigating to home');
      navigate('/');
    } catch (error) {
      console.error('Login error caught in component:', error);
    }
  };

  const handleGoogleSignIn = async () => {
    console.log('Google button onClick fired!');
    setLocalError('');
    try {
      const { error: supabaseError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
      });
      if (supabaseError) {
        console.error('Google Sign-In error:', supabaseError);
        setLocalError(`Google Sign-In failed: ${supabaseError.message}`);
      }
    } catch (err) {
      console.error('Unexpected error during Google Sign-In initiation:', err);
      setLocalError('An unexpected error occurred during Google Sign-In. Please try again.');
    }
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8 }}>
        <Paper sx={{ p: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom align="center">
            IFS Center
          </Typography>
          
          {displayError && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {displayError}
              {detailedError && (
                <Button 
                  size="small" 
                  onClick={() => setShowDebugInfo(!showDebugInfo)}
                  sx={{ ml: 2 }}
                >
                  {showDebugInfo ? 'Hide Details' : 'Show Details'}
                </Button>
              )}
              <Collapse in={showDebugInfo && detailedError}>
                <Box sx={{ mt: 2, p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                  <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
                    {detailedError && JSON.stringify(detailedError, null, 2)}
                  </Typography>
                </Box>
              </Collapse>
            </Alert>
          )}
          
          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
              required
            />
            
            <TextField
              fullWidth
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              required
            />
            
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In with Email'}
            </Button>
            
            <Divider sx={{ my: 2 }}>OR</Divider>
            
            <Button
              fullWidth
              variant="outlined"
              startIcon={<GoogleIcon />}
              sx={{ mt: 2, mb: 2 }}
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              Sign in with Google
            </Button>
            
            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <Typography variant="body2">
                Don't have an account?{' '}
                <Link to="/register" style={{ textDecoration: 'none' }}>
                  Register
                </Link>
              </Typography>
            </Box>
          </form>
        </Paper>
      </Box>
    </Container>
  );
};

export default Login; 