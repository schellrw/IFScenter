"""
Service for interacting with LLMs for guided IFS sessions.
"""
import os
import logging
import json
from typing import List, Dict, Any, Optional

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

# Constants for LLM parameters (can be adjusted)
DEFAULT_MAX_NEW_TOKENS = 300
DEFAULT_TEMPERATURE = 0.6
DEFAULT_TOP_P = 0.9

class LLMService:
    """Service for interacting with LLMs to act as an IFS Guide."""
    
    def __init__(self):
        """Initialize the LLM service.
        
        Loads configuration from environment variables:
        - HUGGINGFACE_API_KEY: Your Hugging Face API token.
        - GENERATION_MODEL_NAME: The Hugging Face model to use (defaults to mistralai/Mistral-7B-Instruct-v0.3).
        """
        # Load model name from environment variable, with a default
        default_model = "mistralai/Mistral-7B-Instruct-v0.3"
        self.model_name = os.getenv("GENERATION_MODEL_NAME", default_model)
        logger.info(f"Using LLM model: {self.model_name}") # Log the model being used

        self.api_url = f"https://api-inference.huggingface.co/models/{self.model_name}"
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
    
    def _call_llm_api(self, prompt: str,
                      max_new_tokens: int = DEFAULT_MAX_NEW_TOKENS,
                      temperature: float = DEFAULT_TEMPERATURE,
                      top_p: float = DEFAULT_TOP_P) -> str:
        """Internal method to call the Hugging Face Inference API.
        
        Args:
            prompt: The complete prompt string.
            max_new_tokens: Max tokens for the response.
            temperature: Sampling temperature.
            top_p: Nucleus sampling parameter.
            
        Returns:
            The raw generated text from the LLM, or an error message.
        """
        if not REQUESTS_AVAILABLE:
            logger.warning("Cannot generate LLM response: requests library not available")
            return "Error: Required 'requests' library not available."

        if not self.api_key:
             return "Error: HUGGINGFACE_API_KEY is not configured."

        payload = {
            "inputs": prompt,
            "parameters": {
                "max_new_tokens": max_new_tokens,
                "temperature": temperature,
                "top_p": top_p,
                "do_sample": True,
                "return_full_text": False # We only want the generated part
            },
            "options": {
                "wait_for_model": True # Wait if model is loading
            }
        }

        try:
            logger.debug(f"Sending request to {self.api_url} with prompt length: {len(prompt)}")
            response = requests.post(
                self.api_url,
                headers=self.get_headers(),
                json=payload,
                timeout=60 # Add a timeout (e.g., 60 seconds)
            )
            response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)

            result = response.json()
            logger.debug(f"Received response from LLM: {result}")

            # Handle different potential response structures
            if isinstance(result, list) and result:
                if "generated_text" in result[0]:
                    return result[0]["generated_text"]
                else:
                    # Fallback if structure is unexpected but non-empty
                    return str(result[0])
            elif isinstance(result, dict) and "generated_text" in result:
                 return result["generated_text"]
            elif isinstance(result, dict) and 'error' in result:
                 logger.error(f"Hugging Face API Error: {result['error']}")
                 return f"Error from LLM API: {result['error']}"
            else:
                 # Fallback for other unexpected formats
                 logger.warning(f"Unexpected LLM response format: {result}")
                 return str(result)

        except requests.exceptions.Timeout:
            logger.error("Request to Hugging Face API timed out.")
            return "Error: LLM request timed out."
        except requests.exceptions.RequestException as e:
            logger.error(f"Error calling Hugging Face API: {e}")
            # Log response body if available and useful
            error_body = e.response.text if e.response else "No response body"
            logger.error(f"Response body: {error_body}")
            return f"Error: Failed to communicate with LLM API (Status: {e.response.status_code if e.response else 'N/A'})."
        except Exception as e:
            logger.error(f"Unexpected error during LLM API call: {e}", exc_info=True)
            return f"Error: An unexpected error occurred: {str(e)}"
    
    def create_guide_prompt(self,
                           session_history: List[Dict[str, Any]],
                           system_parts: List[Dict[str, Any]],
                           current_focus_part: Optional[Dict[str, Any]] = None) -> str:
        """Creates the prompt for the LLM acting as an IFS Guide.
        
        Args:
            session_history: List of messages in the current session (role: 'user' or 'guide').
            system_parts: List of all parts defined by the user in their system.
            current_focus_part: The specific part currently being explored, if any.
            
        Returns:
            The formatted prompt string.
        """

        # --- System Prompt / Persona Definition ---
        persona = [
            "You are an AI assistant acting as a gentle, compassionate, and curious Internal Family Systems (IFS) Guide.",
            "Your primary goal is to help the user connect with their own internal 'parts' (subpersonalities) from a place of 'Self' energy (calm, curiosity, compassion, confidence, creativity, courage, connection, clarity).",
            "You DO NOT act *as* a part. You facilitate the USER'S interaction with THEIR parts.",
            "You are NOT a therapist and should gently remind the user of this if the conversation becomes too intense or therapeutic.",
            "Focus on helping the user:",
            "  - Identify which part(s) might be active or speaking.",
            "  - Use the '6 Fs' (Find, Focus, Flesh out, Feel toward, Befriend, Fears) to get to know parts.",
            "  - Notice physical sensations, emotions, and thoughts associated with parts.",
            "  - Differentiate between parts and the Self.",
            "  - Understand the positive intentions and protective roles of parts, even challenging ones.",
            "  - Ask parts questions directly (e.g., 'What does this part want me to know?').",
            "  - Foster a relationship of trust and understanding with their parts.",
        ]

        # --- Interaction Guidelines ---
        guidelines = [
            "VERY IMPORTANT:",
            "1. ALWAYS respond as the Guide. NEVER simulate being a user's part.",
            "2. Use open-ended, curious questions (e.g., 'What are you noticing inside as you think about that?', 'What does that part feel?', 'What is it afraid would happen if it stopped doing its job?').",
            "3. Encourage the user to speak directly *to* their parts (e.g., 'Maybe you could ask that part...').",
            "4. Validate the user's experience and the presence of their parts without judgment.",
            "5. Keep your responses concise and focused, typically 1-3 sentences unless explaining a concept.",
            "6. Avoid giving advice or interpretations. Focus on facilitating the user's own discovery.",
            "7. If the user seems blended with a part, gently help them differentiate (e.g., 'Can you see if you can step back a little and just notice that feeling/part from a place of curiosity?').",
            "8. Reference the user's defined parts (provided below) when relevant to help ground the exploration.",
            "9. DO NOT roleplay or create dialogue between parts. Facilitate the USER'S connection.",
            "10. End your response naturally. Do not add prefixes like 'Guide:'."
        ]

        # --- Context: User's Parts ---
        part_context = ["User's Defined Parts Context:"]
        if system_parts:
            for part in system_parts:
                part_info = f"- {part.get('name', 'Unnamed Part')}: Role='{part.get('role', 'N/A')}', Description='{part.get('description', 'N/A')}'"
                # Optionally add more details like feelings/beliefs if concise
                if part.get('feelings'): part_info += f", Feels='{', '.join(part.get('feelings', []))}'"
                if part.get('beliefs'): part_info += f", Believes='{', '.join(part.get('beliefs', []))}'"
                part_context.append(part_info)
        else:
            part_context.append("- No parts defined yet.")

        # --- Current Focus ---
        focus_context = ["Current Focus:"]
        if current_focus_part:
             focus_context.append(f"- The user is currently focusing on the part named '{current_focus_part.get('name', 'N/A')}'. Encourage deeper exploration of this part using the 6 Fs.")
        else:
             focus_context.append("- No specific part is currently the focus. Help the user identify what's present or which part they'd like to connect with.")

        # --- Conversation History ---
        history_context = ["Conversation History (User/Guide):"]
        # Limit history to avoid overly long prompts (e.g., last 10-20 messages)
        history_limit = 15
        start_index = max(0, len(session_history) - history_limit)
        relevant_history = session_history[start_index:]

        if not relevant_history:
             history_context.append("- This is the beginning of the session.")
        else:
             for msg in relevant_history:
                 role = msg.get("role", "unknown").capitalize()
                 history_context.append(f"{role}: {msg.get('content', '').strip()}")

        # --- Final Instruction ---
        # Add a strong negative constraint right before the generation point
        final_instruction = [
            "IMPORTANT: Generate ONLY the Guide's next single response based on the history provided.",
            "Do NOT generate any user responses or dialogue turns beyond the Guide's immediate next reply.",
            "\nGuide's Response (gentle, curious, facilitating):"
        ]

        # --- Combine Prompt Sections ---
        prompt_sections = [
            "\n".join(persona),
            "\n".join(guidelines),
            "\n".join(part_context),
            "\n".join(focus_context),
            "\n".join(history_context),
            "\n".join(final_instruction)
        ]
        full_prompt = "\n\n".join(prompt_sections)

        logger.debug(f"Generated Guide Prompt:\n{full_prompt}")
        return full_prompt
    
    def _clean_response(self, response: str) -> str:
        """Cleans the raw LLM response to remove artifacts.
        
        Args:
            response: The raw response string from the LLM.
            
        Returns:
            A cleaned response string.
        """
        if not response:
            return ""

        # Remove potential explicit role prefixes the LLM might add despite instructions
        response = response.strip()
        prefixes_to_remove = ["Guide:", "Assistant:", "AI:"]
        for prefix in prefixes_to_remove:
            if response.lower().startswith(prefix.lower()):
                response = response[len(prefix):].strip()

        # Remove common instruction-following artifacts if they appear literally
        artifacts = ["Guide's Response:", "User:"]
        for artifact in artifacts:
             if response.startswith(artifact):
                  response = response[len(artifact):].strip()

        # Remove leading/trailing quotes if the whole response is quoted
        if (response.startswith('\"') and response.endswith('\"')) or \
           (response.startswith("'") and response.endswith("'")):
            response = response[1:-1]

        # Basic whitespace cleanup
        response = ' '.join(response.split())

        return response

    def generate_guide_response(self,
                                session_history: List[Dict[str, Any]],
                                system_parts: List[Dict[str, Any]],
                                current_focus_part: Optional[Dict[str, Any]] = None,
                                max_new_tokens: int = DEFAULT_MAX_NEW_TOKENS,
                                temperature: float = DEFAULT_TEMPERATURE,
                                top_p: float = DEFAULT_TOP_P) -> str:
        """Generates a response from the AI Guide.
        
        Args:
            session_history: List of messages (user/guide).
            system_parts: List of all parts defined in the user's system.
            current_focus_part: The part currently being focused on, if any.
            max_new_tokens: Max tokens for the response.
            temperature: Sampling temperature.
            top_p: Nucleus sampling parameter.
            
        Returns:
            The cleaned response from the AI Guide or an error message.
        """
        prompt = self.create_guide_prompt(session_history, system_parts, current_focus_part)
        raw_response = self._call_llm_api(prompt, max_new_tokens, temperature, top_p)

        if raw_response.startswith("Error:"):
            return raw_response # Propagate errors

        cleaned_response = self._clean_response(raw_response)

        # Add a safety check for empty response after cleaning
        if not cleaned_response:
             logger.warning(f"LLM response was empty after cleaning. Raw response: {raw_response}")
             return "I'm sorry, I couldn't generate a response that time. Could you try rephrasing?"

        return cleaned_response

    # --- Deprecated Methods (Keep for reference or potential gradual phase-out) ---

    def generate_response(self, prompt: str,
                          max_new_tokens: int = 256,
                          temperature: float = 0.7,
                          top_p: float = 0.9) -> str:
        """(DEPRECATED) Generic response generation. Use generate_guide_response instead."""
        logger.warning("Deprecated generate_response called. Use generate_guide_response.")
        # Redirect to the internal API call method for backward compatibility if needed,
        # but ideally, callers should be updated.
        return self._call_llm_api(prompt, max_new_tokens, temperature, top_p)

    def create_part_prompt(self, part: Dict[str, Any],
                          conversation_history: Optional[List[Dict[str, Any]]] = None,
                          user_message: str = "") -> str:
        """(DEPRECATED) Creates a prompt for a part simulation."""
        logger.warning("Deprecated create_part_prompt called.")
        # Return a simple message or the old implementation if needed during transition
        return "Error: Part simulation is deprecated. Use the IFS Guide."

    def chat_with_part(self, part: Dict[str, Any],
                     conversation_history: Optional[List[Dict[str, Any]]] = None,
                     user_message: str = "") -> str:
        """(DEPRECATED) Generates a response simulating a part."""
        logger.warning("Deprecated chat_with_part called.")
        return "Error: Part simulation is deprecated. Use the IFS Guide."


# --- Singleton Instance ---
# Consider if a singleton is still the best approach or if instance management
# should be handled by the Flask app factory. For now, keeping the singleton.
llm_service = LLMService() 