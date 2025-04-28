import React, { useState, useContext } from 'react';
import { Form, Button, Container, Alert, Row, Col, Divider } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api'; // Import the api instance
import { supabase } from '../utils/supabase'; // Corrected Import Supabase client

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); // Clear previous errors
    try {
      console.log('Attempting email/password login with:', email); // Log attempt
      const response = await api.post('/auth/login', { email, password });
      console.log('Email/Password Login response:', response); // Log response
      if (response.data.access_token) {
        // If using Supabase Auth entirely, this local API login might change
        // For now, assuming it's separate or will be integrated
        login(response.data.access_token);
        navigate('/dashboard');
      } else {
        setError(response.data.message || 'Login failed. Please check your credentials.');
      }
    } catch (err) {
      console.error('Email/Password Login error:', err); // Log detailed error
      let errorMessage = 'Login failed. Please check your credentials or server status.';
      if (err.response) {
        console.error('Error response data:', err.response.data);
        console.error('Error response status:', err.response.status);
        errorMessage = err.response.data.message || `Login failed (${err.response.status})`;
      } else if (err.request) {
        console.error('Error request:', err.request);
        errorMessage = 'No response from server. Please check your network connection.';
      } else {
        console.error('Error message:', err.message);
        errorMessage = `An error occurred: ${err.message}`;
      }
      setError(errorMessage);
    }
  };

  // --- Google Sign-In Handler ---
  const handleGoogleSignIn = async () => {
    console.log('Google button onClick fired!'); // Add console log for debugging
    setError(''); // Clear previous errors
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        // Optional: Add options like redirectTo if needed for specific post-login URLs
        // options: {
        //   redirectTo: window.location.origin + '/dashboard' // Example redirect
        // }
      });
      if (error) {
        console.error('Google Sign-In error:', error);
        setError(`Google Sign-In failed: ${error.message}`);
      }
      // No navigation here - Supabase handles the redirect to Google and back.
      // Session handling will likely occur via onAuthStateChange listener elsewhere (e.g., in AuthContext or App.js)
    } catch (err) {
      console.error('Unexpected error during Google Sign-In initiation:', err);
      setError('An unexpected error occurred. Please try again.');
    }
  };
  // --- End Google Sign-In Handler ---


  return (
    <Container className="mt-5" style={{ maxWidth: '500px' }}> {/* Constrain width */}
      <h2 className="text-center mb-4">Login</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      <Form onSubmit={handleSubmit}>
        <Form.Group controlId="formBasicEmail">
          <Form.Label>Email</Form.Label>
          <Form.Control
            type="email"
            placeholder="Enter email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Form.Group>

        <Form.Group controlId="formBasicPassword">
          <Form.Label>Password</Form.Label>
          <Form.Control
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Form.Group>
        <Button variant="primary" type="submit" className="w-100 mt-3"> {/* Make button full width */}
          Login with Email
        </Button>
      </Form>

      {/* --- Divider and Google Button --- */}
      <div className="my-4 text-center position-relative">
          <hr />
          <span style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'white', // Or your container background color
              padding: '0 10px'
          }}>
              OR
          </span>
      </div>

      <Button
        variant="outline-secondary" // Or another style
        onClick={handleGoogleSignIn}
        className="w-100 d-flex align-items-center justify-content-center" // Flex for icon alignment
      >
        {/* Basic Google Icon SVG (replace with a better one if available) */}
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" className="bi bi-google me-2" viewBox="0 0 16 16">
          <path d="M15.545 6.558a9.42 9.42 0 0 1 .139 1.626c0 2.434-.87 4.492-2.384 5.885h.002C11.978 15.292 10.158 16 8 16A8 8 0 1 1 8 0a7.689 7.689 0 0 1 5.352 2.082l-2.284 2.284A4.347 4.347 0 0 0 8 3.166c-2.087 0-3.86 1.408-4.492 3.304a4.792 4.792 0 0 0 0 3.063h.003c.635 1.893 2.405 3.301 4.492 3.301 1.078 0 2.004-.276 2.722-.764h-.003a3.702 3.702 0 0 0 1.599-2.431H8v-3.08h7.545z"/>
        </svg>
        Sign in with Google
      </Button>
      {/* --- End Divider and Google Button --- */}

      {/* Optional: Link to Register Page */}
       <div className="text-center mt-3">
         Don't have an account? <a href="/register">Register</a> {/* Adjust link as needed */}
       </div>

    </Container>
  );
};

export default LoginPage; 