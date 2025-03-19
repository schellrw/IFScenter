import React from 'react';
import { 
  Container, Typography, Grid, Card, CardContent, 
  CardActions, Button, Box, CircularProgress, Alert 
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useIFS } from '../context/IFSContext';

const PartsView = () => {
  const { system, loading, error } = useIFS();
  const navigate = useNavigate();

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

  const parts = system ? Object.values(system.parts) : [];

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
            onClick={() => navigate('/parts/new')}
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
    </Container>
  );
};

export default PartsView; 