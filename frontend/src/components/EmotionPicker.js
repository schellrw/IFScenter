import React from 'react';
import { Chip, Box, Typography } from '@mui/material';

export const EmotionPicker = ({ emotions, selectedEmotions, onChange }) => {
  const handleToggle = (emotion) => {
    if (selectedEmotions.includes(emotion.id)) {
      onChange(selectedEmotions.filter(id => id !== emotion.id));
    } else {
      onChange([...selectedEmotions, emotion.id]);
    }
  };

  return (
    <Box>
      <Typography variant="subtitle1" gutterBottom>
        Select Emotions:
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {emotions.map((emotion) => (
          <Chip
            key={emotion.id}
            label={emotion.label}
            onClick={() => handleToggle(emotion)}
            color={selectedEmotions.includes(emotion.id) ? "primary" : "default"}
            sx={{
              backgroundColor: selectedEmotions.includes(emotion.id) 
                ? emotion.color 
                : undefined
            }}
          />
        ))}
      </Box>
    </Box>
  );
}; 