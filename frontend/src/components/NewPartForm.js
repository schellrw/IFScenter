import React, { useState } from 'react';
import { Box, Button, Stack } from '@mui/material';
import { InputField, TextArea, RoleSelector, FeelingsInput, ListInput } from './FormComponents';
import { ROLE_OPTIONS } from '../constants';

const NewPartForm = ({ onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    description: '',
    feelings: [],
    beliefs: [],
    triggers: [],
    needs: []
  });

  const handleChange = (field, value) => {
    console.log(`Updating ${field}:`, value);
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Submitting form data:', formData);
    onSubmit(formData);
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Stack spacing={2}>
        <InputField
          label="Part Name"
          value={formData.name}
          onChange={(value) => handleChange('name', value)}
          required
        />

        <RoleSelector
          label="Role"
          options={ROLE_OPTIONS}
          value={formData.role}
          onChange={(value) => handleChange('role', value)}
        />

        <TextArea
          label="Description"
          value={formData.description}
          onChange={(value) => handleChange('description', value)}
        />

        <FeelingsInput
          label="Associated Feelings"
          value={formData.feelings}
          onChange={(value) => handleChange('feelings', value)}
        />

        <ListInput
          label="Core Beliefs"
          value={formData.beliefs || []}
          onChange={(value) => {
            console.log('Beliefs updated:', value);
            handleChange('beliefs', value);
          }}
          placeholder="Enter a core belief..."
        />

        <ListInput
          label="Triggers"
          value={formData.triggers || []}
          onChange={(value) => {
            console.log('Triggers updated:', value);
            handleChange('triggers', value);
          }}
          placeholder="Enter a trigger..."
        />

        <ListInput
          label="Needs"
          value={formData.needs || []}
          onChange={(value) => {
            console.log('Needs updated:', value);
            handleChange('needs', value);
          }}
          placeholder="Enter a need..."
        />

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
          <Button onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="contained">
            Create Part
          </Button>
        </Box>
      </Stack>
    </Box>
  );
};

export default NewPartForm; 