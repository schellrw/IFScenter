import React, { useState } from 'react';
import { 
  Container, Typography, Grid, Card, CardContent, 
  CardActions, Button, Box, CircularProgress, Alert, Snackbar
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useIFS } from '../context/IFSContext';
import { useAuth } from '../context/AuthContext';
import { TIER_LIMITS } from '../constants';

const PartsView = () => {
  const { system, loading, error } = useIFS();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('info');

  if (loading) {
    return (
      <Container sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  const parts = system ? Object.values(system.parts || {}) : [];
  const currentPartCount = parts.length;

  const handleSnackbarClose = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbarOpen(false);
  };

  const handleOpenNewPart = () => {
    console.log('[Limit Check - PartsView] handleOpenNewPart FUNCTION ENTERED');
    const tier = currentUser?.subscription_tier || 'free';
    const limit = TIER_LIMITS[tier]?.parts || TIER_LIMITS.free.parts;
    console.log(`[Limit Check - PartsView] Button Clicked. Tier: ${tier}, Limit: ${limit}, Current Count: ${currentPartCount}`);
    if (currentPartCount >= limit) {
        let message = `You have reached the maximum number of parts (${limit}) allowed for the ${tier.charAt(0).toUpperCase() + tier.slice(1)} plan.`;
        if (tier === 'free') {
            message += ' Please upgrade to add more parts.';
        } else if (tier === 'pro') {
            message += ' Please upgrade to the Unlimited plan to add unlimited parts.';
        }
        setSnackbarMessage(message);
        setSnackbarSeverity('warning');
        setSnackbarOpen(true);
        console.log('[Limit Check - PartsView] Limit IS reached. Showing Snackbar.');
    } else {
        console.log('[Limit Check - PartsView] Limit NOT reached. Navigating to /parts/new.');
        navigate('/parts/new');
    }
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h4" component="h1">
            Parts
          </Typography>
          <Button 
            variant="contained" 
            color="primary"
            onClick={handleOpenNewPart}
          >
            Add New Part
          </Button>
        </Box>

        <Grid container spacing={3}>
          {parts.map((part) => (
            <Grid item xs={12} sm={6} md={4} key={part.id}>
              <Card>
                <CardContent>
                  <Typography variant="h6">{part.name}</Typography>
                  <Typography color="textSecondary" gutterBottom>
                    {part.role || 'Undefined Role'}
                  </Typography>
                  <Typography variant="body2" noWrap>
                    {part.description}
                  </Typography>
                </CardContent>
                <CardActions>
                  <Button 
                    size="small" 
                    onClick={() => navigate(`/parts/${part.id}`, { state: { from: 'parts' } })}
                  >
                    View Details
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbarSeverity} sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default PartsView; 