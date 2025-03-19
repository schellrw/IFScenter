import React from 'react';
import { 
  FormControl, 
  InputLabel, 
  Select, 
  MenuItem, 
  Chip, 
  Box 
} from '@mui/material';

export const PartSelector = ({ parts, selectedParts, onChange }) => {
  return (
    <FormControl fullWidth>
      <InputLabel>Present Parts</InputLabel>
      <Select
        multiple
        value={selectedParts}
        onChange={(e) => onChange(e.target.value)}
        renderValue={(selected) => (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {selected.map((partId) => {
              const part = parts.find(p => p.id === partId);
              return (
                <Chip 
                  key={partId} 
                  label={part ? part.name : 'Unknown Part'} 
                />
              );
            })}
          </Box>
        )}
      >
        {parts.map((part) => (
          <MenuItem key={part.id} value={part.id}>
            {part.name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}; 