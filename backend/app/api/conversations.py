"""
API endpoints for managing Guided IFS Sessions and their messages.
Supports both SQLAlchemy and Supabase backends through the database adapter.
Contains deprecated endpoints for old part_conversations for reference.
"""
import logging
from uuid import UUID
from typing import Dict, Any, List, Optional
from datetime import datetime

from flask import Blueprint, request, jsonify, current_app, g
from flask_jwt_extended import jwt_required, get_jwt_identity
from marshmallow import Schema, fields, ValidationError
from sqlalchemy.exc import SQLAlchemyError

# --- Model Imports ---
# Assuming models are correctly defined in app.models
# Adjust imports based on your actual model file structure
try:
    from ..models import db, Part, GuidedSession, SessionMessage, User, IFSSystem
    # Import deprecated models if needed for reference/migration logic
    from ..models import PartConversation, ConversationMessage, PartPersonalityVector
    MODELS_AVAILABLE = True
except ImportError as e:
    MODELS_AVAILABLE = False
    logging.getLogger(__name__).error(f"Error importing models: {e}. API endpoints may fail.")

from ..utils.auth_adapter import auth_required
# Import the keyword generation utility
from ..utils.keywords import generate_keywords

# Configure logging first
logger = logging.getLogger(__name__)

# --- Service Imports ---
try:
    from ..utils.embeddings import EmbeddingManager
    embedding_manager = EmbeddingManager()
    EMBEDDINGS_AVAILABLE = True
except ImportError:
    EMBEDDINGS_AVAILABLE = False
    logger.warning("Embedding manager not available, vector operations will be disabled")

try:
    from ..utils.llm_service import LLMService
    llm_service = LLMService()
    LLM_AVAILABLE = True
except ImportError:
    LLM_AVAILABLE = False
    logger.warning("LLM service not available, guide responses will be disabled")

# --- Blueprint Setup ---
# Rename blueprint to reflect new focus
guided_sessions_bp = Blueprint('guided_sessions', __name__)

# --- Table Names (Using model.__tablename__ is preferred but keeping constants for potential direct DB calls) ---
GUIDED_SESSION_TABLE = 'guided_sessions'
SESSION_MESSAGE_TABLE = 'session_messages'
PART_TABLE = 'parts'
SYSTEM_TABLE = 'ifs_systems' # Assuming this table name
USER_TABLE = 'users' # Assuming this table name

# --- Input Validation Schemas ---
class GuidedSessionSchema(Schema):
    """Schema for creating a new guided session."""
    title = fields.String(required=False, allow_none=True)
    system_id = fields.UUID(required=True) # User must belong to this system
    initial_focus_part_id = fields.UUID(required=False, allow_none=True, data_key="focusPartId")

class SessionMessageSchema(Schema):
    """Schema for adding a message to a session."""
    content = fields.String(required=True, validate=lambda s: len(s) > 0)

class UpdateSessionSchema(Schema):
    """Schema for updating session details."""
    title = fields.String(required=False, allow_none=True)
    summary = fields.String(required=False, allow_none=True)
    status = fields.String(required=False, validate=lambda s: s in ['active', 'archived'])
    current_focus_part_id = fields.UUID(required=False, allow_none=True, data_key="focusPartId")

# === Guided Session Endpoints ===

@guided_sessions_bp.route('/guided-sessions', methods=['GET'])
@auth_required
def get_guided_sessions():
    """Get all guided sessions for the current user.

    Query params:
        system_id: (Optional) Filter by a specific system ID owned by the user.
        status: (Optional) Filter by status (e.g., 'active', 'archived')

    Returns:
        JSON response with a list of guided sessions.
    """
    if not MODELS_AVAILABLE:
        return jsonify({"error": "Server configuration error: Models not loaded"}), 500

    user_id_for_log = "unknown"
    try:
        # Safely get user_id from g.current_user which should be set by @auth_required
        current_user_data = getattr(g, 'current_user', None)
        if not current_user_data or 'id' not in current_user_data:
            logger.error("User ID not found in g.current_user within get_guided_sessions")
            return jsonify({"error": "Authentication context error"}), 500
            
        user_id = current_user_data['id']
        user_id_for_log = str(user_id) # Store safely for logging
        
        system_id_filter = request.args.get('system_id')
        status_filter = request.args.get('status')

        # Base filter: ensure user owns the session
        # Note: RLS policies should enforce this at the DB level, but adding here for clarity/safety
        filter_dict = {'user_id': user_id}

        if system_id_filter:
            # Optional: Verify user owns this system_id first
            filter_dict['system_id'] = system_id_filter
        if status_filter:
            filter_dict['status'] = status_filter

        # Use the database adapter
        sessions = current_app.db_adapter.get_all(GUIDED_SESSION_TABLE, GuidedSession, filter_dict)

        return jsonify({"sessions": sessions})

    except Exception as e:
        # Use the safely stored user_id_for_log
        logger.error(f"Error fetching guided sessions for user {user_id_for_log}: {str(e)}", exc_info=True)
        # Also log g.current_user state for debugging
        logger.debug(f"g.current_user at time of error: {getattr(g, 'current_user', 'Not set')}")
        return jsonify({"error": "An error occurred while fetching guided sessions"}), 500

@guided_sessions_bp.route('/guided-sessions', methods=['POST'])
@auth_required
def create_guided_session():
    """Create a new guided IFS session."""
    if not MODELS_AVAILABLE:
        return jsonify({"error": "Server configuration error: Models not loaded"}), 500

    user_id_for_log = "unknown"
    try:
        # Safely get user_id from g.current_user
        current_user_data = getattr(g, 'current_user', None)
        if not current_user_data or 'id' not in current_user_data:
            logger.error("User ID not found in g.current_user within create_guided_session")
            return jsonify({"error": "Authentication context error"}), 500
        user_id = current_user_data['id']
        user_id_for_log = str(user_id)
        
        data = request.json

        # Validate input
        try:
            validated_data = GuidedSessionSchema().load(data)
        except ValidationError as e:
            return jsonify({"error": "Validation failed", "details": e.messages}), 400

        system_id = validated_data['system_id']

        # Verify user owns the target system (important check)
        system = current_app.db_adapter.get_by_id(SYSTEM_TABLE, IFSSystem, str(system_id))
        if not system or str(system.get('user_id')) != str(user_id):
            # Use the validated user_id for comparison
            logger.warning(f"System access denied or not found. User: {user_id}, System: {system_id}")
            return jsonify({"error": "System not found or access denied"}), 403

        # Prepare session data
        session_data = {
            'user_id': user_id,
            'system_id': system_id,
            'title': validated_data.get('title') or f"IFS Session - {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            'current_focus_part_id': validated_data.get('initial_focus_part_id')
        }

        # Create session using adapter
        new_session = current_app.db_adapter.create(GUIDED_SESSION_TABLE, GuidedSession, session_data)

        if not new_session:
            return jsonify({"error": "Failed to create guided session"}), 500

        # Optional: Add an initial greeting message from the guide
        if LLM_AVAILABLE:
            try:
                initial_greeting = "Welcome! I\'m here to help guide your IFS exploration. What\'s present for you right now, or which part would you like to connect with?"
                initial_message_data = {
                    'session_id': new_session['id'],
                    'role': 'guide',
                    'content': initial_greeting
                }
                if EMBEDDINGS_AVAILABLE:
                    try:
                        embedding = embedding_manager.generate_embedding(initial_greeting)
                        if embedding:
                            initial_message_data['embedding'] = embedding
                    except Exception as emb_err:
                        logger.error(f"Error generating embedding for initial guide message: {emb_err}")

                current_app.db_adapter.create(SESSION_MESSAGE_TABLE, SessionMessage, initial_message_data)
            except Exception as msg_err:
                logger.error(f"Failed to add initial guide message to session {new_session['id']}: {msg_err}")
                # Continue even if initial message fails

        return jsonify({"session": new_session}), 201

    except Exception as e:
        # Use the safely stored user_id_for_log
        logger.error(f"Error creating guided session for user {user_id_for_log}: {str(e)}", exc_info=True)
        logger.debug(f"g.current_user at time of error: {getattr(g, 'current_user', 'Not set')}")
        return jsonify({"error": "An error occurred while creating the guided session"}), 500

@guided_sessions_bp.route('/guided-sessions/<session_id>', methods=['GET'])
@auth_required
def get_guided_session(session_id):
    """Get a specific guided session and its messages."""
    if not MODELS_AVAILABLE:
        return jsonify({"error": "Server configuration error: Models not loaded"}), 500

    user_id_for_log = "unknown"
    try:
        # Safely get user_id from g.current_user
        current_user_data = getattr(g, 'current_user', None)
        if not current_user_data or 'id' not in current_user_data:
            logger.error("User ID not found in g.current_user within get_guided_session")
            return jsonify({"error": "Authentication context error"}), 500
        user_id = current_user_data['id']
        user_id_for_log = str(user_id)

        # Get session (RLS should prevent unauthorized access, but check user_id for defense-in-depth)
        session = current_app.db_adapter.get_by_id(GUIDED_SESSION_TABLE, GuidedSession, session_id)
        if not session or str(session.get('user_id')) != str(user_id):
             logger.warning(f"Attempt to access session {session_id} denied for user {user_id_for_log}")
             return jsonify({"error": "Guided session not found or access denied"}), 404

        # Get messages for the session
        filter_dict = {'session_id': session_id}
        messages = current_app.db_adapter.get_all(SESSION_MESSAGE_TABLE, SessionMessage, filter_dict)

        # Sort messages by timestamp (should be handled by model relationship order_by, but explicit sort is safer)
        messages.sort(key=lambda x: x.get('timestamp', ''))

        # Get related system and current focus part details
        system = current_app.db_adapter.get_by_id(SYSTEM_TABLE, IFSSystem, str(session.get('system_id')))
        focus_part = None
        if session.get('current_focus_part_id'):
            focus_part = current_app.db_adapter.get_by_id(PART_TABLE, Part, str(session.get('current_focus_part_id')))

        response = {
            "session": session,
            "messages": messages,
            "system": system, # Include system details
            "currentFocusPart": focus_part # Include details of the focused part
        }

        return jsonify(response)

    except Exception as e:
        # Use the safely stored user_id_for_log
        logger.error(f"Error fetching guided session {session_id} for user {user_id_for_log}: {str(e)}", exc_info=True)
        logger.debug(f"g.current_user at time of error: {getattr(g, 'current_user', 'Not set')}")
        return jsonify({"error": "An error occurred while fetching the guided session"}), 500

@guided_sessions_bp.route('/guided-sessions/<session_id>/messages', methods=['POST'])
@auth_required
def add_session_message(session_id):
    """Add a user message to a guided session and get the AI guide's response."""
    if not MODELS_AVAILABLE:
        return jsonify({"error": "Server configuration error: Models not loaded"}), 500

    user_id_for_log = "unknown"
    try:
        # Safely get user_id from g.current_user
        current_user_data = getattr(g, 'current_user', None)
        if not current_user_data or 'id' not in current_user_data:
            logger.error("User ID not found in g.current_user within add_session_message")
            return jsonify({"error": "Authentication context error"}), 500
        user_id = current_user_data['id']
        user_id_for_log = str(user_id)

        data = request.json

        # Validate input
        try:
            validated_data = SessionMessageSchema().load(data)
        except ValidationError as e:
            return jsonify({"error": "Validation failed", "details": e.messages}), 400

        # Get session and verify ownership
        session = current_app.db_adapter.get_by_id(GUIDED_SESSION_TABLE, GuidedSession, session_id)
        if not session or str(session.get('user_id')) != str(user_id):
            logger.warning(f"Attempt to add message to session {session_id} denied for user {user_id_for_log}")
            return jsonify({"error": "Guided session not found or access denied"}), 404

        # --- Create and store user message ---
        user_content = validated_data['content']
        user_message_data = {
            'session_id': session_id,
            'role': 'user',
            'content': user_content
        }

        if EMBEDDINGS_AVAILABLE:
            try:
                embedding = embedding_manager.generate_embedding(user_content)
                if embedding:
                    user_message_data['embedding'] = embedding
            except Exception as e:
                logger.error(f"Error generating embedding for user message: {str(e)}")

        user_message = current_app.db_adapter.create(SESSION_MESSAGE_TABLE, SessionMessage, user_message_data)
        if not user_message:
             # If message creation fails, we probably shouldn't proceed
             return jsonify({"error": "Failed to save user message"}), 500

        # --- Attempt to generate topic if not already set ---
        # Refetch session data *after* potentially creating it to get the latest state including ID
        # Or assume 'session' dict fetched earlier is sufficient if adapter updates it implicitly
        # Re-fetch for safety:
        current_session_state = current_app.db_adapter.get_by_id(GUIDED_SESSION_TABLE, GuidedSession, session_id)
        if current_session_state and not current_session_state.get('topic'):
            logger.debug(f"Session {session_id} has no topic, attempting generation.")
            # Fetch message history needed for topic generation (and later for LLM)
            history_filter = {'session_id': session_id}
            message_history = current_app.db_adapter.get_all(SESSION_MESSAGE_TABLE, SessionMessage, history_filter)
            message_history.sort(key=lambda x: x.get('timestamp', '')) # Ensure order

            MIN_MESSAGES_FOR_TOPIC = 3
            if len(message_history) >= MIN_MESSAGES_FOR_TOPIC:
                logger.debug(f"Session {session_id} meets message threshold ({len(message_history)} >= {MIN_MESSAGES_FOR_TOPIC}).")
                message_contents = [msg.get('content', '') for msg in message_history]
                try:
                    generated_topic = generate_keywords(message_contents)
                    if generated_topic:
                        logger.info(f"Generated topic for session {session_id}: '{generated_topic}'")
                        # Update the session with the new topic
                        update_data = {'topic': generated_topic}
                        updated = current_app.db_adapter.update(
                            GUIDED_SESSION_TABLE, GuidedSession, session_id, update_data
                        )
                        if not updated:
                            logger.warning(f"Failed to save generated topic for session {session_id}")
                        # No need to update current_session_state dict here unless needed later *before* LLM call
                    else:
                        logger.debug(f"Keyword generation returned None for session {session_id}. Insufficient unique words?")
                except Exception as topic_err:
                    logger.error(f"Error generating topic keywords for session {session_id}: {topic_err}", exc_info=True)
            else:
                logger.debug(f"Session {session_id} does not meet message threshold for topic generation ({len(message_history)} < {MIN_MESSAGES_FOR_TOPIC}).")

        # --- Generate and store guide response --- (Only if LLM is available)
        guide_message = None
        if LLM_AVAILABLE:
            try:
                # Fetch necessary context for the guide prompt
                # If message_history wasn't fetched for topic generation, fetch it now.
                if 'message_history' not in locals(): # Check if it was already fetched
                    history_filter = {'session_id': session_id}
                    message_history = current_app.db_adapter.get_all(SESSION_MESSAGE_TABLE, SessionMessage, history_filter)
                    message_history.sort(key=lambda x: x.get('timestamp', '')) # Ensure order

                # 2. Get all parts for the system
                system_id = session.get('system_id')
                parts_filter = {'system_id': str(system_id)}
                system_parts = current_app.db_adapter.get_all(PART_TABLE, Part, parts_filter)

                # 3. Get current focus part details (if any)
                current_focus_part = None
                focus_part_id = session.get('current_focus_part_id')
                if focus_part_id:
                    current_focus_part = current_app.db_adapter.get_by_id(PART_TABLE, Part, str(focus_part_id))

                # Generate guide response using the refactored LLM service
                guide_response_content = llm_service.generate_guide_response(
                    session_history=message_history,
                    system_parts=system_parts,
                    current_focus_part=current_focus_part
                )

                # Check for errors from LLM service
                if guide_response_content.startswith("Error:"):
                    logger.error(f"LLM service failed for session {session_id}: {guide_response_content}")
                    # Return user message but include the error
                    return jsonify({
                        "user_message": user_message,
                        "error": f"AI guide failed: {guide_response_content}"
                    }), 207 # Multi-Status
                else:
                    # Store the guide's response
                    guide_message_data = {
                        'session_id': session_id,
                        'role': 'guide',
                        'content': guide_response_content
                    }
                    if EMBEDDINGS_AVAILABLE:
                        try:
                            embedding = embedding_manager.generate_embedding(guide_response_content)
                            if embedding:
                                guide_message_data['embedding'] = embedding
                        except Exception as e:
                            logger.error(f"Error generating embedding for guide response: {str(e)}")

                    guide_message = current_app.db_adapter.create(SESSION_MESSAGE_TABLE, SessionMessage, guide_message_data)
                    if not guide_message:
                        logger.error(f"Failed to save guide message for session {session_id}")
                        # Proceed but log error, return user message + AI content without saved AI message ID
                        return jsonify({
                            "user_message": user_message,
                            "guide_response_content": guide_response_content, # Send content even if save failed
                            "error": "Failed to save guide response message"
                        }), 207

            except Exception as llm_err:
                logger.error(f"Error during AI guide response generation for session {session_id}: {llm_err}", exc_info=True)
                # Return user message with error about AI failure
                return jsonify({
                    "user_message": user_message,
                    "error": f"Failed to generate AI guide response: {str(llm_err)}"
                }), 207
        else:
             # LLM not available, return only the user message
             logger.warning(f"LLM service unavailable, only user message saved for session {session_id}")

        # --- Prepare and return response ---
        response = {"user_message": user_message}
        if guide_message:
            response["guide_response"] = guide_message

        return jsonify(response)

    except Exception as e:
        # Use the safely stored user_id_for_log
        logger.error(f"Error adding message to session {session_id} for user {user_id_for_log}: {str(e)}", exc_info=True)
        logger.debug(f"g.current_user at time of error: {getattr(g, 'current_user', 'Not set')}")
        return jsonify({"error": "An error occurred while adding the message"}), 500

@guided_sessions_bp.route('/guided-sessions/<session_id>', methods=['PUT', 'PATCH'])
@auth_required
def update_guided_session(session_id):
    """Update details of a guided session (title, summary, status, focus part)."""
    if not MODELS_AVAILABLE:
        return jsonify({"error": "Server configuration error: Models not loaded"}), 500

    user_id_for_log = "unknown"
    try:
        # Safely get user_id from g.current_user
        current_user_data = getattr(g, 'current_user', None)
        if not current_user_data or 'id' not in current_user_data:
            logger.error("User ID not found in g.current_user within update_guided_session")
            return jsonify({"error": "Authentication context error"}), 500
        user_id = current_user_data['id']
        user_id_for_log = str(user_id)

        data = request.json

        # Validate input
        try:
            # Use partial=True for updates
            validated_data = UpdateSessionSchema().load(data, partial=True)
        except ValidationError as e:
            return jsonify({"error": "Validation failed", "details": e.messages}), 400

        # Get session and verify ownership
        session = current_app.db_adapter.get_by_id(GUIDED_SESSION_TABLE, GuidedSession, session_id)
        if not session or str(session.get('user_id')) != str(user_id):
            logger.warning(f"Attempt to update session {session_id} denied for user {user_id_for_log}")
            return jsonify({"error": "Guided session not found or access denied"}), 404

        # Perform update
        updated_session = current_app.db_adapter.update(
            GUIDED_SESSION_TABLE, GuidedSession, session_id, validated_data
        )

        if not updated_session:
            return jsonify({"error": "Failed to update guided session"}), 500

        return jsonify({"session": updated_session})

    except Exception as e:
        # Use the safely stored user_id_for_log
        logger.error(f"Error updating guided session {session_id} for user {user_id_for_log}: {str(e)}", exc_info=True)
        logger.debug(f"g.current_user at time of error: {getattr(g, 'current_user', 'Not set')}")
        return jsonify({"error": "An error occurred while updating the session"}), 500

@guided_sessions_bp.route('/guided-sessions/<session_id>', methods=['DELETE'])
@auth_required
def delete_guided_session(session_id):
    """Delete a guided session and its messages."""
    if not MODELS_AVAILABLE:
        return jsonify({"error": "Server configuration error: Models not loaded"}), 500

    user_id_for_log = "unknown"
    try:
        # Safely get user_id from g.current_user
        current_user_data = getattr(g, 'current_user', None)
        if not current_user_data or 'id' not in current_user_data:
            logger.error("User ID not found in g.current_user within delete_guided_session")
            return jsonify({"error": "Authentication context error"}), 500
        user_id = current_user_data['id']
        user_id_for_log = str(user_id)

        # Get session to verify ownership before deleting
        # RLS handles DB security, but this check provides a clearer API error
        session = current_app.db_adapter.get_by_id(GUIDED_SESSION_TABLE, GuidedSession, session_id)
        if not session or str(session.get('user_id')) != str(user_id):
            logger.warning(f"Attempt to delete session {session_id} denied for user {user_id_for_log}")
            return jsonify({"error": "Guided session not found or access denied"}), 404

        # Perform delete (CASCADE should handle messages)
        success = current_app.db_adapter.delete(GUIDED_SESSION_TABLE, GuidedSession, session_id)

        if not success:
            # This might happen if the session was deleted between the check and the delete call
            return jsonify({"error": "Failed to delete guided session or session already deleted"}), 500

        return jsonify({"message": "Guided session deleted successfully"})

    except Exception as e:
        # Use the safely stored user_id_for_log
        logger.error(f"Error deleting guided session {session_id} for user {user_id_for_log}: {str(e)}", exc_info=True)
        logger.debug(f"g.current_user at time of error: {getattr(g, 'current_user', 'Not set')}")
        return jsonify({"error": "An error occurred while deleting the session"}), 500

# === Test Endpoint ===
@guided_sessions_bp.route('/guided-sessions/test', methods=['GET'])
def test_guided_sessions_route():
    """Test endpoint to verify the guided sessions blueprint is working."""
    return jsonify({
        "status": "ok",
        "message": "Guided Sessions API is accessible",
        "blueprint": guided_sessions_bp.name
    }) 