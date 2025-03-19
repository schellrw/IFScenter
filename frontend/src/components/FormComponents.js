import React from 'react';
import { TextField, MenuItem, Chip, Box, IconButton, InputAdornment, Paper, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

export const InputField = ({ label, value, onChange, required = false }) => (
  <TextField
    fullWidth
    label={label}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    required={required}
    margin="normal"
  />
);

export const TextArea = ({ label, value, onChange, rows = 4 }) => (
  <TextField
    fullWidth
    multiline
    rows={rows}
    label={label}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    margin="normal"
  />
);

export const RoleSelector = ({ label, options, value, onChange }) => (
  <TextField
    select
    fullWidth
    label={label}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    margin="normal"
  >
    {options.map((option) => (
      <MenuItem key={option.value} value={option.value}>
        {option.label}
      </MenuItem>
    ))}
  </TextField>
);

export const FeelingsInput = ({ value = [], onChange, label }) => {
  const [inputValue, setInputValue] = React.useState('');

  const handleAdd = () => {
    if (inputValue.trim()) {
      onChange([...value, inputValue.trim()]);
      setInputValue('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleDelete = (feelingToDelete) => {
    onChange(value.filter(feeling => feeling !== feelingToDelete));
  };

  return (
    <Box>
      <TextField
        fullWidth
        label={label}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyPress={handleKeyPress}
        helperText="Press Enter or click + to add a feeling"
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton 
                onClick={handleAdd}
                disabled={!inputValue.trim()}
                size="small"
              >
                <AddIcon />
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
      <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {value.map((feeling, index) => (
          <Chip
            key={index}
            label={feeling}
            onDelete={() => handleDelete(feeling)}
            color="primary"
            variant="outlined"
          />
        ))}
      </Box>
    </Box>
  );
};

export const ListInput = ({ value = [], onChange, label, placeholder }) => {
  // Add a ref to track input elements
  const inputRefs = React.useRef({});
  
  const handleChange = (index, newValue) => {
    const newList = [...value];
    if (newValue.trim()) {
      newList[index] = newValue;
    } else {
      newList.splice(index, 1);
    }
    onChange(newList);
  };

  const handleKeyDown = (e, index) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      // Get the current value at this index
      const currentValue = value[index] || '';
      
      // Only add a new item if the current item has content
      if (currentValue.trim() === '' && index === value.length - 1) {
        // Don't add a new item if the last item is empty
        return;
      }
      
      const newList = [...value];
      const newIndex = index + 1;
      
      if (index === value.length - 1) {
        newList.push('');
      } else {
        newList.splice(newIndex, 0, '');
      }
      
      onChange(newList);
      
      // Focus the new item after the state has been updated
      setTimeout(() => {
        if (inputRefs.current[newIndex]) {
          inputRefs.current[newIndex].focus();
        }
      }, 0);
    }
  };

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        {label}
      </Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        {[...value, ''].map((item, index) => (
          <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Typography sx={{ mr: 1 }}>•</Typography>
            <TextField
              fullWidth
              size="small"
              value={item}
              placeholder={index === value.length ? `Add new ${label.toLowerCase()}...` : ''}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              multiline
              variant="standard"
              InputProps={{
                disableUnderline: true
              }}
              inputRef={el => inputRefs.current[index] = el}
            />
            {item && (
              <IconButton 
                size="small" 
                onClick={() => {
                  const newList = [...value];
                  newList.splice(index, 1);
                  onChange(newList);
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        ))}
      </Paper>
    </Box>
  );
}; 