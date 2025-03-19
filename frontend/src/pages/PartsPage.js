import React, { useState, useEffect, StrictMode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIFS } from '../context/IFSContext';
import {
  Container,
  Typography,
  Button,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  Paper,
  Grid,
} from '@mui/material';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { NewPartForm } from '../components';
import AddIcon from '@mui/icons-material/Add';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';

const PartsPage = () => {
  const [newPartDialog, setNewPartDialog] = useState(false);
  const { addPart, system, updatePartOrder } = useIFS();
  const navigate = useNavigate();
  const parts = Object.values(system?.parts || {});
  const [enabled, setEnabled] = useState(false);

  // Add this to test console logging
  useEffect(() => {
    console.log('PartsPage mounted');
    console.log('Initial parts:', parts);
  }, [parts]);

  // This is needed for react-beautiful-dnd to work in strict mode
  useEffect(() => {
    const animation = requestAnimationFrame(() => setEnabled(true));
    return () => {
      cancelAnimationFrame(animation);
      setEnabled(false);
    };
  }, []);

  const handleDragEnd = (result) => {
    console.log('Drag ended:', result);
    if (!result.destination) {
      console.log('No destination');
      return;
    }

    const items = Array.from(parts);
    console.log('Original items:', items);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    console.log('Reordered items:', items);

    const newOrder = items.map((part, index) => ({
      ...part,
      order: index
    }));
    updatePartOrder(newOrder);
  };

  // Add this console log to verify parts data
  console.log('Rendering parts:', parts);

  // Wrap the entire return in the enabled check
  if (!enabled) {
    console.log('DnD not yet enabled');
    return null;
  }

  const handleCreatePart = async (formData) => {
    try {
      // Make sure arrays are properly initialized
      const newPart = {
        ...formData,
        feelings: formData.feelings || [],
        beliefs: formData.beliefs || [],
        triggers: formData.triggers || [],
        needs: formData.needs || []
      };
      
      const response = await addPart(newPart);
      setNewPartDialog(false);
      navigate(`/parts/${response.id}`);
    } catch (error) {
      console.error('Error creating part:', error);
    }
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 4 }}>
          <Typography variant="h4" component="h1">
            Parts
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setNewPartDialog(true)}
          >
            New Part
          </Button>
        </Box>

        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="parts">
            {(provided, snapshot) => {
              console.log('Droppable state:', snapshot);
              return (
                <Grid 
                  container 
                  spacing={2}
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                >
                  {parts.map((part, index) => (
                    <Draggable 
                      key={part.id} 
                      draggableId={part.id.toString()} 
                      index={index}
                    >
                      {(provided, snapshot) => {
                        console.log('Draggable state:', part.id, snapshot);
                        return (
                          <Grid 
                            item 
                            xs={12} 
                            sm={6} 
                            md={4}
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                          >
                            <Paper
                              sx={{
                                p: 2,
                                display: 'flex',
                                alignItems: 'center',
                                cursor: 'grab',
                                backgroundColor: snapshot.isDragging ? '#f5f5f5' : 'white',
                                '&:hover': {
                                  backgroundColor: '#f5f5f5',
                                }
                              }}
                            >
                              <Box 
                                {...provided.dragHandleProps} 
                                sx={{ 
                                  mr: 2,
                                  cursor: 'grab',
                                  '&:hover': {
                                    color: 'primary.main'
                                  }
                                }}
                              >
                                <DragIndicatorIcon />
                              </Box>
                              <Box 
                                sx={{ flexGrow: 1 }}
                                onClick={() => navigate(`/parts/${part.id}`, { state: { from: 'parts' } })}
                              >
                                <Typography variant="h6">{part.name}</Typography>
                                <Typography color="textSecondary">
                                  {part.role || 'No role specified'}
                                </Typography>
                              </Box>
                            </Paper>
                          </Grid>
                        );
                      }}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </Grid>
              );
            }}
          </Droppable>
        </DragDropContext>

        <Dialog 
          open={newPartDialog} 
          onClose={() => setNewPartDialog(false)}
          maxWidth="md"
          fullWidth
          PaperProps={{
            sx: {
              minHeight: '80vh',
              maxHeight: '90vh'
            }
          }}
        >
          <DialogTitle>Create New Part</DialogTitle>
          <DialogContent sx={{ 
            pb: 3,
            pt: 2,
            px: 3,
            '& .MuiDialogContent-root': {
              padding: 0
            }
          }}>
            <NewPartForm
              onSubmit={handleCreatePart}
              onCancel={() => setNewPartDialog(false)}
            />
          </DialogContent>
        </Dialog>
      </Box>
    </Container>
  );
};

export default PartsPage; 