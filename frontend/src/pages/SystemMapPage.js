import React from 'react';
import { Container, Typography, Box, Paper, Alert } from '@mui/material';
import { useIFS } from '../context/IFSContext';
import { SystemMapVisualization } from '../components';

const SystemMapPage = () => {
  const { 
    system, 
    loading, 
    error, 
    addRelationship,
    updateRelationship,
    deleteRelationship
  } = useIFS();

  const handleAddRelationship = async (relationshipData) => {
    try {
      console.log('SystemMapPage: Creating relationship:', relationshipData);
      const result = await addRelationship(relationshipData);
      console.log('SystemMapPage: Relationship created:', result);
    } catch (err) {
      console.error('SystemMapPage: Failed to create relationship:', err);
      alert(`Failed to create relationship: ${err.message}`);
    }
  };

  const handleUpdateRelationship = async (relationshipId, updates) => {
    try {
      await updateRelationship(relationshipId, updates);
    } catch (err) {
      console.error('Failed to update relationship:', err);
    }
  };

  const handleDeleteRelationship = async (relationshipId) => {
    try {
      await deleteRelationship(relationshipId);
    } catch (err) {
      console.error('Failed to delete relationship:', err);
    }
  };

  if (loading) {
    return (
      <Container sx={{ mt: 4, textAlign: 'center' }}>
        <Typography>Loading system map...</Typography>
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

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          System Map
        </Typography>
        <Paper sx={{ p: 2, height: '70vh' }}>
          <SystemMapVisualization 
            parts={Object.values(system?.parts || {})}
            relationships={Object.values(system?.relationships || {})}
            onAddRelationship={handleAddRelationship}
            onUpdateRelationship={handleUpdateRelationship}
            onDeleteRelationship={handleDeleteRelationship}
          />
        </Paper>
      </Box>
    </Container>
  );
};

export default SystemMapPage; 