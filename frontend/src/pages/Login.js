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
  Collapse 
} from '@mui/material';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const { login, error, detailedError, loading } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      console.log(`Attempting to login user: ${email}`);
      await login(email, password);
      console.log('Login successful, navigating to home');
      navigate('/');
    } catch (error) {
      console.error('Login error caught in component:', error);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8 }}>
        <Paper sx={{ p: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom align="center">
            IFS Center
          </Typography>
          
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
              <Button 
                size="small" 
                onClick={() => setShowDebugInfo(!showDebugInfo)}
                sx={{ ml: 2 }}
              >
                {showDebugInfo ? 'Hide Details' : 'Show Details'}
              </Button>
              
              <Collapse in={showDebugInfo}>
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
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
            
            <Button
              fullWidth
              variant="outlined"
              startIcon={<img src="/google-icon.svg" alt="Google" width="18" />}
              sx={{ mt: 2 }}
              onClick={() => window.location.href = 'http://localhost:5000/login/google'}
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