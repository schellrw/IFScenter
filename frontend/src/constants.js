/**
 * Shared constants for the IFS Center application
 */

// Reflective prompts for journaling and reflection
export const REFLECTIVE_PROMPTS = [
  "What am I feeling in my body right now?",
  "Which parts of me are present in this moment?",
  "What does this part want me to know?",
  "How does Self feel toward this part?",
  "What does this part need?",
  "How might these parts be connected?",
  "What protective role does this part serve?",
  "What is this part afraid might happen?",
  "What would help this part feel safer?"
];

// Common emotions for journal entries
export const COMMON_EMOTIONS = [
  { id: 'anger', label: 'Anger', color: '#ff4d4d' },
  { id: 'fear', label: 'Fear', color: '#9370db' },
  { id: 'sadness', label: 'Sadness', color: '#4169e1' },
  { id: 'shame', label: 'Shame', color: '#8b4513' },
  { id: 'joy', label: 'Joy', color: '#ffd700' },
  { id: 'peace', label: 'Peace', color: '#98fb98' },
  { id: 'curiosity', label: 'Curiosity', color: '#ff69b4' },
  { id: 'compassion', label: 'Compassion', color: '#dda0dd' }
];

// Reordered and renamed based on discussion
export const ROLE_OPTIONS = [
  { value: 'manager', label: 'Manager' },
  { value: 'firefighter', label: 'Firefighter' },
  { value: 'exile', label: 'Exile' },
  { value: 'protector', label: 'Protector-Other' }, // Renamed, kept value 'protector'
  // { value: 'self', label: 'Self' }, // Removed Self
];

export const TIER_LIMITS = {
    free: {
        parts: 10,       // Total parts
        journals: 1,      // Per day
        messages: 10      // Per day
    },
    pro: {
        parts: 20,       // Total parts (Changed from 30)
        journals: 10,     // Per day
        messages: 30      // Per day (Changed from 50)
    },
    unlimited: {
        parts: Infinity,
        journals: Infinity,
        // sessions: Infinity,
        messages: Infinity
    }
};

// You might need to refine these limits based on how your backend actually enforces them (e.g., daily vs total) 