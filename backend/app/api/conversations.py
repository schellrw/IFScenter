"""
API endpoints for managing Guided IFS Sessions and their messages.
Supports both SQLAlchemy and Supabase backends through the database adapter.
Contains deprecated endpoints for old part_conversations for reference.
"""
import logging
from uuid import UUID
from typing import Dict, Any, List, Optional
from datetime import datetime, date, timezone
import json

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
        
        # --- Add Backend Limit Check --- 
        # Fetch user object from DB for subscription info
        user = db.session.get(User, user_id)
        if not user:
             logger.error(f"User {user_id} not found in database for create_guided_session.")
             return jsonify({"error": "Authenticated user not found in database"}), 404
        
        if user.subscription_tier != 'unlimited':
            # New limits: Free=10, Pro=30
            limit = 30 if user.subscription_tier == 'pro' else 10
            today_utc = datetime.now(timezone.utc).date()
            messages_used_today = 0
            if user.last_message_date == today_utc:
                messages_used_today = user.daily_messages_used or 0
                
            if messages_used_today >= limit:
                logger.info(f"Preventing new session creation: Daily limit reached for user {user_id}")
                tier_name = user.subscription_tier.capitalize()
                return jsonify({
                    "error": f"{tier_name} plan daily message limit ({limit}) reached. Please upgrade or wait until tomorrow."
                }), 403 # Forbidden
        # --- End Backend Limit Check ---

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
    """Adds a user message, gets a guide response, checking limits."""
    if not MODELS_AVAILABLE:
        return jsonify({"error": "Server configuration error: Models not loaded"}), 500

    user_id_for_log = "unknown"
    user = None # Define user earlier to use in finally block if needed
    needs_commit = False # Track if user object needs saving

    try:
        # --- Get User and Session --- 
        current_user_data = getattr(g, 'current_user', None)
        if not current_user_data or 'id' not in current_user_data:
            logger.error("User ID not found in g.current_user within add_session_message")
            return jsonify({"error": "Authentication context error"}), 500
        user_id = current_user_data['id']
        user_id_for_log = str(user_id)
        
        # Fetch user object from DB for subscription info
        user = db.session.get(User, user_id)
        if not user:
             logger.error(f"User {user_id} not found in database for add_session_message.")
             return jsonify({"error": "Authenticated user not found in database"}), 404

        # Get session and verify user ownership
        session = current_app.db_adapter.get_by_id(GUIDED_SESSION_TABLE, GuidedSession, session_id)
        if not session or str(session.get('user_id')) != str(user_id):
            logger.warning(f"Attempt to add message to session {session_id} denied for user {user_id_for_log}")
            return jsonify({"error": "Guided session not found or access denied"}), 404
            
        # --- Subscription Limit Check (BEFORE expensive LLM call) --- 
        if user.subscription_tier != 'unlimited':
            # New limits: Free=10, Pro=30
            limit = 30 if user.subscription_tier == 'pro' else 10 
            # Use UTC date for comparison
            today_utc = datetime.now(timezone.utc).date()

            # Check if the counter needs resetting
            # Compare against the UTC date
            if user.last_message_date != today_utc:
                logger.info(f"Resetting daily message count for user {user_id}")
                user.daily_messages_used = 0
                user.last_message_date = today_utc # Store UTC date
                needs_commit = True
                
            # Check the limit
            if user.daily_messages_used >= limit:
                logger.info(f"Daily message limit reached for user {user_id} (Tier: {user.subscription_tier}, Limit: {limit}, Count: {user.daily_messages_used})")
                tier_name = user.subscription_tier.capitalize()
                # Commit potential date/reset changes before returning error
                if needs_commit:
                    try:
                        db.session.commit()
                    except Exception as commit_err:
                         logger.error(f"Error committing user counter reset before limit error for user {user_id}: {commit_err}")
                         db.session.rollback() # Rollback if commit failed
                return jsonify({
                    "error": f"{tier_name} plan daily message limit ({limit}) reached. Please upgrade for more daily guided messages."
                }), 403 # Forbidden

            # --- Limit check passed, increment will happen AFTER successful LLM response --- 
        # --- End Limit Check ---
        
        # --- Process User Message --- 
        data = request.json
        try:
            validated_data = SessionMessageSchema().load(data)
        except ValidationError as e:
            return jsonify({"error": "Validation failed", "details": e.messages}), 400
        
        user_message_content = validated_data['content']
        user_message_data = {
            'session_id': session_id,
            'role': 'user',
            'content': user_message_content
        }
        
        # Add user message embedding if available
        user_message_embedding = None
        if EMBEDDINGS_AVAILABLE:
            try:
                user_message_embedding = embedding_manager.generate_embedding(user_message_content)
                if user_message_embedding:
                    user_message_data['embedding'] = user_message_embedding
            except Exception as emb_err:
                logger.error(f"Error generating embedding for user message in session {session_id}: {emb_err}")
        
        # Save user message
        saved_user_message = current_app.db_adapter.create(SESSION_MESSAGE_TABLE, SessionMessage, user_message_data)
        if not saved_user_message:
            logger.error(f"Failed to save user message for session {session_id}")
            # Commit potential date/reset changes even if user message fails? Maybe not.
            if needs_commit:
                db.session.rollback()
            return jsonify({"error": "Failed to save user message"}), 500

        # --- Generate and Process Guide Response --- 
        guide_response_content = "Error generating response."
        guide_message_embedding = None
        
        if not LLM_AVAILABLE:
            logger.warning(f"LLM service not available for session {session_id}")
            guide_response_content = "(Guide response generation is currently unavailable)"
        else:
            try:
                # Prepare context for LLM
                # 1. Get recent messages (e.g., last 10-20)
                recent_messages_data = current_app.db_adapter.get_all(
                    SESSION_MESSAGE_TABLE, 
                    SessionMessage, 
                    {'session_id': session_id}, 
                    order_by=('timestamp', 'desc'), 
                    limit=20 # Example: Get last 20 messages
                )
                
                # Ensure messages are dictionaries before processing
                processed_messages_data = []
                for item in recent_messages_data:
                    if isinstance(item, str):
                        try:
                            # Attempt to parse if it's a JSON string representation of a dict
                            parsed_item = json.loads(item)
                            if isinstance(parsed_item, dict):
                                processed_messages_data.append(parsed_item)
                            else:
                                logger.warning(f"Parsed string item, but result was not a dict: {parsed_item}")
                                # Optionally skip or handle differently
                        except json.JSONDecodeError:
                            logger.warning(f"Skipping non-dictionary, non-JSON string item in recent messages: {item}")
                    elif isinstance(item, dict):
                        processed_messages_data.append(item)
                    else:
                         logger.warning(f"Skipping unexpected item type in recent messages: {type(item)}")

                # Sort the validated dictionaries
                recent_messages = sorted(processed_messages_data, key=lambda x: x.get('timestamp', '')) # Re-sort ascending
                
                # --- Add Detailed Logging Here ---
                logger.debug(f"--- Recent Messages Prepared for LLM (Session: {session_id}) ---")
                for i, msg_item in enumerate(recent_messages):
                    logger.debug(f"Message {i}: Type={type(msg_item)}, Content={str(msg_item)[:150]}...") 
                logger.debug("--- End Recent Messages ---")
                # --- End Detailed Logging ---

                # 2. Get relevant part information (CRITICAL FOR COST & CONTEXT)
                # TODO: Implement a more sophisticated context strategy
                # - Get all parts associated with the system?
                # - Get only the current_focus_part_id?
                # - Use embeddings to find relevant parts based on user message?
                # Example: Get only the current focus part (if any)
                focus_part_info = None
                if session.get('current_focus_part_id'):
                    focus_part = current_app.db_adapter.get_by_id(PART_TABLE, Part, str(session.get('current_focus_part_id')))
                    if focus_part:
                        # Select only relevant fields to pass
                        focus_part_info = {
                            'name': focus_part.get('name'),
                            'role': focus_part.get('role'),
                            'description': focus_part.get('description')
                            # Add beliefs, needs etc. carefully based on token limits
                        }
                        
                # 3. Get System details (including ALL parts for context)
                system_parts = []
                system_id = session.get('system_id')
                if system_id:
                    try:
                        system_parts = current_app.db_adapter.get_all(
                            PART_TABLE, 
                            Part, 
                            {'system_id': system_id}
                        )
                    except Exception as parts_err:
                        logger.error(f"Failed to fetch system parts for system {system_id} in session {session_id}: {parts_err}")
                else:
                    logger.warning(f"No system_id found in session {session_id}, cannot fetch system parts.")

                # 4. Generate response (Correct argument order)
                guide_response_content = llm_service.generate_guide_response(
                    recent_messages, # Pass formatted history FIRST
                    system_parts,    # Pass system parts SECOND
                    focus_part_info  # Pass selected part info THIRD
                )
                
                # Increment counter only AFTER successful LLM response generation
                if user.subscription_tier != 'unlimited':
                    user.daily_messages_used += 1
                    needs_commit = True # Mark user object as needing save

            except Exception as llm_err:
                logger.error(f"LLM service failed for session {session_id}: {llm_err}", exc_info=True)
                guide_response_content = "(Sorry, I encountered an error trying to generate a response.)"
                # Do NOT increment counter if LLM failed

        # --- Save Guide Response --- 
        guide_message_data = {
            'session_id': session_id,
            'role': 'guide',
            'content': guide_response_content
        }
        
        # Add guide message embedding if available
        if EMBEDDINGS_AVAILABLE:
            try:
                guide_message_embedding = embedding_manager.generate_embedding(guide_response_content)
                if guide_message_embedding:
                    guide_message_data['embedding'] = guide_message_embedding
            except Exception as emb_err:
                logger.error(f"Error generating embedding for guide message in session {session_id}: {emb_err}")
                
        # Save guide message
        saved_guide_message = current_app.db_adapter.create(SESSION_MESSAGE_TABLE, SessionMessage, guide_message_data)
        if not saved_guide_message:
            logger.error(f"Failed to save guide message for session {session_id}")
            # Don't commit user changes if guide message fails?
            if needs_commit:
                db.session.rollback() # Rollback user counter changes
            return jsonify({"error": "Failed to save guide response"}), 500

        # --- Commit Transaction --- 
        # Commit user message save, guide message save, and any user counter updates together
        db.session.commit()
        needs_commit = False # Reset flag after commit

        # --- Return Response --- 
        # Construct usage info
        # Ensure limit is defined (it should be from the earlier check)
        user_limit = float('inf') # Default to infinity for unlimited
        if user.subscription_tier != 'unlimited':
            user_limit = 30 if user.subscription_tier == 'pro' else 10
            
        usage_info = {
            "dailyMessageCount": user.daily_messages_used,
            "dailyMessageLimit": user_limit
        }
        
        # Return both the saved user message and the saved guide message, plus usage info
        return jsonify({
            "userMessage": saved_user_message, 
            "guideMessage": saved_guide_message,
            "usageInfo": usage_info # Add the usage info here
        }), 201

    except Exception as e:
        logger.error(f"Error adding message to session {session_id} for user {user_id_for_log}: {str(e)}", exc_info=True)
        db.session.rollback() # Rollback any partial changes
        # Ensure commit doesn't happen in finally block if rollback occurred
        needs_commit = False 
        return jsonify({"error": "An error occurred while processing the message"}), 500

@guided_sessions_bp.route('/guided-sessions/<session_id>', methods=['PUT', 'PATCH'])
@auth_required
def update_guided_session(session_id):
    """Update details of a guided session (title, summary/topic, status, focus part)."""
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

        # --- Add Keyword Generation --- 
        # Fetch messages to generate keywords/topic
        try:
            session_messages = current_app.db_adapter.get_all(
                SESSION_MESSAGE_TABLE, 
                SessionMessage, 
                {'session_id': session_id}
            )
            if session_messages and len(session_messages) > 1: # Need some messages
                message_contents = [msg.get('content', '') for msg in session_messages]
                # Generate keywords and store in 'topic' field 
                # (as established earlier that's where they ended up)
                keywords = generate_keywords(message_contents, num_keywords=3) 
                if keywords:
                    logger.info(f"Generated keywords for session {session_id}: {keywords}")
                    validated_data['topic'] = keywords # Add/overwrite topic field
                else:
                    logger.info(f"Could not generate keywords for session {session_id} (not enough content or other issue).")
        except Exception as kw_err:
            logger.error(f"Error during keyword generation for session {session_id}: {kw_err}")
        # --- End Keyword Generation ---

        # Perform update with potentially added/updated 'topic'
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