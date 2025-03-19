"""
Service for interacting with LLMs for part conversations.
"""
import os
import logging
import json
from typing import List, Dict, Any, Optional, Tuple

# Load environment variables directly
from dotenv import load_dotenv
load_dotenv()

# Conditionally import requests
try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False
    print("Warning: requests library not available, LLM API calls will be disabled")

# Configure logging
logger = logging.getLogger(__name__)

class LLMService:
    """Service for interacting with LLMs through the Hugging Face API."""
    
    def __init__(self, model_name: str = "mistralai/Mistral-7B-Instruct-v0.2"):
        """Initialize the LLM service.
        
        Args:
            model_name: The name of the model to use on Hugging Face.
                Default is "mistralai/Mistral-7B-Instruct-v0.2".
        """
        self.model_name = model_name
        self.api_url = f"https://api-inference.huggingface.co/models/{model_name}"
        self.api_key = os.getenv("HUGGINGFACE_API_KEY")
        
        if not self.api_key:
            logger.warning("HUGGINGFACE_API_KEY not set. API calls will likely fail.")
    
    def get_headers(self) -> Dict[str, str]:
        """Get the headers for API requests.
        
        Returns:
            Headers dictionary.
        """
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    def generate_response(self, prompt: str, 
                          max_new_tokens: int = 256,
                          temperature: float = 0.7,
                          top_p: float = 0.9) -> str:
        """Generate a response from the LLM.
        
        Args:
            prompt: The prompt to send to the model.
            max_new_tokens: Maximum number of tokens to generate.
            temperature: Sampling temperature (higher = more creative).
            top_p: Nucleus sampling parameter.
            
        Returns:
            The generated response.
        """
        if not REQUESTS_AVAILABLE:
            logger.warning("Cannot generate LLM response: requests library not available")
            return "Error: requests library not available for API calls"
            
        try:
            # The Hugging Face API expects the inputs to be a string, not an object
            payload = {
                "inputs": prompt,
                "parameters": {
                    "max_new_tokens": max_new_tokens,
                    "temperature": temperature,
                    "top_p": top_p,
                    "do_sample": True,
                    "return_full_text": False
                }
            }
            
            logger.debug(f"Sending request to {self.api_url} with payload: {json.dumps(payload)}")
            
            response = requests.post(
                self.api_url,
                headers=self.get_headers(),
                json=payload
            )
            
            if response.status_code != 200:
                logger.error(f"Error from Hugging Face API: {response.text}")
                return f"Error: Failed to generate response (Status code: {response.status_code})"
            
            # Parse the response
            result = response.json()
            
            # Handle different response formats
            if isinstance(result, list) and len(result) > 0:
                if "generated_text" in result[0]:
                    return result[0]["generated_text"]
                else:
                    return str(result[0])
            elif isinstance(result, dict) and "generated_text" in result:
                return result["generated_text"]
            else:
                return str(result)
                
        except Exception as e:
            logger.error(f"Error generating LLM response: {e}")
            return f"Error: {str(e)}"
    
    def create_part_prompt(self, part: Dict[str, Any], 
                          conversation_history: Optional[List[Dict[str, Any]]] = None,
                          user_message: str = "") -> str:
        """Create a prompt for the part based on its attributes and conversation history.
        
        Args:
            part: Dictionary representation of the part.
            conversation_history: Optional list of previous messages.
            user_message: Current message from the user.
            
        Returns:
            Formatted prompt string.
        """
        part_name = part.get('name', 'a part')
        
        # Base system message describing the part
        part_description = [
            f"You are roleplaying as {part_name}, which is an internal part of a person according to Internal Family Systems therapy.",
            f"Role: {part.get('role', 'Unknown')}",
            f"Description: {part.get('description', '')}",
        ]
        
        # Add characteristics if available
        if part.get('feelings'):
            part_description.append(f"Feelings: {', '.join(part.get('feelings', []))}")
        if part.get('beliefs'):
            part_description.append(f"Beliefs: {', '.join(part.get('beliefs', []))}")
        if part.get('triggers'):
            part_description.append(f"Triggers: {', '.join(part.get('triggers', []))}")
        if part.get('needs'):
            part_description.append(f"Needs: {', '.join(part.get('needs', []))}")
        
        # Add guidelines with stronger emphasis
        part_description.extend([
            "",
            "VERY IMPORTANT INSTRUCTIONS:",
            f"1. Respond in first-person as {part_name} WITHOUT using your name as a prefix.",
            "2. DO NOT start your response with your name or 'Part:' - just speak directly.",
            "3. DO NOT include any 'User:' text in your response.",
            "4. DO NOT simulate a conversation or include multiple turns of dialogue.",
            "5. Provide ONLY a SINGLE response from your perspective.",
            "6. Stay true to your defined feelings, beliefs, and characteristics.",
            "7. Express your needs and concerns authentically.",
            "8. Keep responses personal, direct, and focused.",
            "",
            "EXAMPLE FORMAT:",
            "BAD: 'UserName: What you said' (DO NOT include what the user said)",
            f"BAD: '{part_name}: My thoughts on this...' (DO NOT include your name)",
            "BAD: Multiple turns of conversation (DO NOT do this)",
            "GOOD: 'I feel strongly about this because...' (Direct first-person without name prefix)",
            "",
            "Safety guidelines:",
            "1. If the conversation becomes harmful or inappropriate, gently redirect.",
            "2. Do not provide dangerous advice or encourage harmful behavior.",
            "3. Remember this is for self-exploration and understanding, not therapy.",
            ""
        ])
        
        # Format system message
        system_message = "\n".join(part_description)
        
        # Add conversation history
        conversation_text = []
        if conversation_history:
            for msg in conversation_history:
                role = "User" if msg.get("role") == "user" else part_name
                conversation_text.append(f"{role}: {msg.get('content', '')}")
        
        # Add current user message
        if user_message:
            conversation_text.append(f"User: {user_message}")
            conversation_text.append(f"Your response (without '{part_name}:' prefix):")
        
        # Combine everything into the final prompt
        full_prompt = system_message + "\n\n" + "\n".join(conversation_text)
        
        return full_prompt
    
    def chat_with_part(self, part: Dict[str, Any],
                     conversation_history: Optional[List[Dict[str, Any]]] = None,
                     user_message: str = "") -> str:
        """Generate a response from a part based on conversation history and user message.
        
        Args:
            part: Dictionary representation of the part.
            conversation_history: Optional list of previous messages.
            user_message: Current message from the user.
            
        Returns:
            Generated response from the part.
        """
        if not REQUESTS_AVAILABLE:
            logger.warning("Cannot chat with part: requests library not available")
            return "Error: requests library not available for API calls"
            
        # Create the prompt
        prompt = self.create_part_prompt(part, conversation_history, user_message)
        
        # Generate the response
        raw_response = self.generate_response(prompt)
        
        # Clean up the response - this is more robust now
        part_name = part.get('name', 'Part')
        clean_response = self._clean_response(raw_response, part_name)
        
        # If we have a clean response, return it
        if clean_response:
            return clean_response
            
        # Fallback to the raw response if cleaning failed
        return raw_response.strip()
    
    def _clean_response(self, response: str, part_name: str) -> str:
        """Clean up the response to remove any unwanted prefixes or formatting.
        
        Args:
            response: The raw response from the LLM
            part_name: The name of the part
            
        Returns:
            Cleaned response
        """
        if not response:
            return ""
            
        # Remove any error messages
        if response.startswith("Error:"):
            return response
            
        # Split into lines for processing
        lines = response.split('\n')
        cleaned_lines = []
        skip_line = False
        
        for line in lines:
            line = line.strip()
            
            # Skip empty lines
            if not line:
                continue
                
            # Skip lines that appear to be User: prefixes
            if line.lower().startswith("user:"):
                skip_line = True
                continue
            
            # Clean part name prefixes (case insensitive)
            prefix_pattern = f"{part_name}:"
            if line.lower().startswith(prefix_pattern.lower()):
                line = line[len(prefix_pattern):].strip()
            
            # Skip any other role prefixes that might appear
            if ":" in line and len(line.split(":")[0]) < 20:  # Simple heuristic for detecting role prefixes
                potential_prefix = line.split(":")[0].strip()
                if potential_prefix.lower() != "i" and not potential_prefix.isdigit():  # Avoid cleaning "I:" or timestamps
                    # This looks like a role prefix, remove it
                    line = ":".join(line.split(":")[1:]).strip()
            
            # Only add non-empty lines
            if line and not skip_line:
                cleaned_lines.append(line)
            
            # Reset skip_line flag
            skip_line = False
        
        # Join cleaned lines
        cleaned_response = " ".join(cleaned_lines)
        
        # Final quick clean up of common issues
        cleaned_response = cleaned_response.replace("*", "")  # Remove any asterisks
        
        return cleaned_response


# Create a singleton instance
llm_service = LLMService() 