"""
API endpoints for part conversations.
Supports both SQLAlchemy and Supabase backends through the database adapter.
"""
import logging
from uuid import UUID
from typing import Dict, Any, List, Optional
from datetime import datetime

from flask import Blueprint, request, jsonify, current_app, g
from flask_jwt_extended import jwt_required, get_jwt_identity
from marshmallow import Schema, fields, ValidationError
from sqlalchemy.exc import SQLAlchemyError

from ..models import db, Part, PartConversation, ConversationMessage, PartPersonalityVector, User, IFSSystem
from ..utils.auth_adapter import auth_required

# Configure logging first
logger = logging.getLogger(__name__)

# Try importing the embedding service
try:
    from ..utils.embeddings import EmbeddingManager
    embedding_manager = EmbeddingManager()
    EMBEDDINGS_AVAILABLE = True
except ImportError:
    EMBEDDINGS_AVAILABLE = False
    logger.warning("Embedding manager not available, vector operations will be disabled")

# Try importing the LLM service
try:
    from ..utils.llm_service import LLMService
    llm_service = LLMService()
    LLM_AVAILABLE = True
except ImportError:
    LLM_AVAILABLE = False
    logger.warning("LLM service not available, part conversations will be limited")

# Create a blueprint
conversations_bp = Blueprint('conversations', __name__)

# Table names for Supabase operations
CONVERSATION_TABLE = 'part_conversations'
CONVERSATION_MESSAGE_TABLE = 'conversation_messages'
PART_TABLE = 'parts'
PERSONALITY_VECTOR_TABLE = 'part_personality_vectors'

# Input validation schemas
class ConversationSchema(Schema):
    """Conversation schema validation."""
    title = fields.String(required=True)
    part_id = fields.String(required=True)

class MessageSchema(Schema):
    """Message schema validation."""
    content = fields.String(required=True)
    auto_respond = fields.Boolean(required=False, default=True)

@conversations_bp.route('/conversations', methods=['GET'])
@auth_required
def get_conversations():
    """Get all conversations for the current user's system.
    
    Query params:
        system_id: System ID to filter by
        part_id: Optional part ID to filter by
        
    Returns:
        JSON response with conversations data.
    """
    try:
        # Get query parameters
        system_id = request.args.get('system_id')
        part_id = request.args.get('part_id')
        
        if not system_id:
            return jsonify({"error": "system_id query parameter is required"}), 400
        
        # Build filter dictionary
        filter_dict = {'system_id': system_id}
        if part_id:
            filter_dict['part_id'] = part_id
        
        # Use the database adapter
        conversations = current_app.db_adapter.get_all(CONVERSATION_TABLE, PartConversation, filter_dict)
        
        return jsonify(conversations)
    except Exception as e:
        logger.error(f"Error fetching conversations: {str(e)}")
        return jsonify({"error": "An error occurred while fetching conversations"}), 500

@conversations_bp.route('/conversations/<conversation_id>', methods=['GET'])
@auth_required
def get_conversation(conversation_id):
    """Get a conversation by ID with its messages.
    
    Args:
        conversation_id: Conversation ID
        
    Returns:
        JSON response with conversation and messages data.
    """
    try:
        # Get conversation
        conversation = current_app.db_adapter.get_by_id(CONVERSATION_TABLE, PartConversation, conversation_id)
        if not conversation:
            return jsonify({"error": "Conversation not found"}), 404
        
        # Get messages for the conversation
        filter_dict = {'conversation_id': conversation_id}
        messages = current_app.db_adapter.get_all(CONVERSATION_MESSAGE_TABLE, ConversationMessage, filter_dict)
        
        # Sort messages by creation time
        messages.sort(key=lambda x: x.get('timestamp', ''))
        
        # Get part information
        part_id = conversation.get('part_id')
        part = None
        if part_id:
            part = current_app.db_adapter.get_by_id(PART_TABLE, Part, part_id)
        
        response = {
            "conversation": conversation,
            "messages": messages,
            "part": part
        }
        
        return jsonify(response)
    except Exception as e:
        logger.error(f"Error fetching conversation: {str(e)}")
        return jsonify({"error": "An error occurred while fetching the conversation"}), 500

@conversations_bp.route('/conversations', methods=['POST'])
@auth_required
def create_conversation():
    """Create a new conversation.
    
    Returns:
        JSON response with created conversation data.
    """
    try:
        data = request.json
        
        # Validate input
        ConversationSchema().load(data)
        
        # Validate part exists
        part_id = data.get('part_id')
        part = current_app.db_adapter.get_by_id(PART_TABLE, Part, part_id)
        if not part:
            return jsonify({"error": "Part not found"}), 404
        
        # Extract system_id from part
        system_id = part.get('system_id')
        
        # Create conversation
        conversation_data = {
            'title': data.get('title'),
            'part_id': part_id,
            'system_id': system_id,
        }
        
        conversation = current_app.db_adapter.create(CONVERSATION_TABLE, PartConversation, conversation_data)
        
        if not conversation:
            return jsonify({"error": "Failed to create conversation"}), 500
        
        return jsonify(conversation), 201
    except ValidationError as e:
        return jsonify({"error": "Validation failed", "details": e.messages}), 400
    except Exception as e:
        logger.error(f"Error creating conversation: {str(e)}")
        return jsonify({"error": "An error occurred while creating the conversation"}), 500

@conversations_bp.route('/conversations/<conversation_id>/messages', methods=['POST'])
@auth_required
def add_message(conversation_id):
    """Add a message to a conversation.
    
    Args:
        conversation_id: Conversation ID
        
    Returns:
        JSON response with created message and optional AI response.
    """
    try:
        data = request.json
        
        # Validate input
        MessageSchema().load(data)
        
        # Validate conversation exists
        conversation = current_app.db_adapter.get_by_id(CONVERSATION_TABLE, PartConversation, conversation_id)
        if not conversation:
            return jsonify({"error": "Conversation not found"}), 404
        
        content = data.get('content')
        
        # Create user message
        user_message_data = {
            'conversation_id': conversation_id,
            'role': 'user',
            'content': content
        }
        
        # Generate embedding if available
        if EMBEDDINGS_AVAILABLE:
            try:
                embedding = embedding_manager.generate_embedding(content)
                if embedding:
                    user_message_data['embedding'] = embedding
            except Exception as e:
                logger.error(f"Error generating embedding: {str(e)}")
        
        # Create message
        user_message = current_app.db_adapter.create(CONVERSATION_MESSAGE_TABLE, ConversationMessage, user_message_data)
        
        if not user_message:
            return jsonify({"error": "Failed to create message"}), 500
        
        # If LLM service is available and auto_respond is requested, generate AI response
        ai_message = None
        auto_respond = data.get('auto_respond', True)
        
        if LLM_AVAILABLE and auto_respond and conversation.get('part_id'):
            try:
                # Get part
                part_id = conversation.get('part_id')
                part = current_app.db_adapter.get_by_id(PART_TABLE, Part, part_id)
                
                if not part:
                    logger.error(f"Part {part_id} not found for conversation {conversation_id}")
                    return jsonify({
                        "message": user_message,
                        "error": "Part not found, cannot generate AI response"
                    }), 207
                
                # Get conversation history
                filter_dict = {'conversation_id': conversation_id}
                messages = current_app.db_adapter.get_all(CONVERSATION_MESSAGE_TABLE, ConversationMessage, filter_dict)
                messages.sort(key=lambda x: x.get('timestamp', ''))
                
                # Generate AI response - use a generic method name if specific one doesn't exist
                try:
                    ai_response_content = llm_service.chat_with_part(part, messages, content)
                except AttributeError:
                    # Fallback to a more generic method if available
                    logger.warning("chat_with_part not found, trying generate_response")
                    
                    # Create a simple prompt if we need to fall back
                    part_name = part.get('name', 'Part')
                    fallback_prompt = f"You are {part_name}. User says: {content}"
                    ai_response_content = llm_service.generate_response(fallback_prompt)
                
                # Create AI message
                ai_message_data = {
                    'conversation_id': conversation_id,
                    'role': 'assistant',
                    'content': ai_response_content
                }
                
                # Generate embedding if available
                if EMBEDDINGS_AVAILABLE:
                    try:
                        embedding = embedding_manager.generate_embedding(ai_response_content)
                        if embedding:
                            ai_message_data['embedding'] = embedding
                    except Exception as e:
                        logger.error(f"Error generating embedding for AI response: {str(e)}")
                
                # Create and store AI message
                ai_message = current_app.db_adapter.create(CONVERSATION_MESSAGE_TABLE, ConversationMessage, ai_message_data)
                
                # Check if we should generate a summary for this conversation
                # We'll only generate summaries automatically for conversations that don't have one yet
                if not conversation.get('summary'):
                    try:
                        # Automatic summary generation now happens when the user navigates away
                        # We'll just log that this message was added without a summary
                        logger.info(f"Message added to conversation {conversation_id} without summary - will be generated on navigation")
                    except Exception as e:
                        logger.error(f"Error in automatic summary check: {str(e)}")
                        # Continue without failing if summary generation fails
            except Exception as e:
                logger.error(f"Error generating AI response: {str(e)}")
                return jsonify({
                    "message": user_message,
                    "error": f"Failed to generate AI response: {str(e)}"
                }), 207
        
        # Return both messages
        result = {"message": user_message}
        if ai_message:
            result["ai_response"] = ai_message
            
        return jsonify(result)
    except ValidationError as e:
        return jsonify({"error": "Validation failed", "details": e.messages}), 400
    except Exception as e:
        logger.error(f"Error adding message: {str(e)}")
        return jsonify({"error": "An error occurred while adding the message"}), 500

@conversations_bp.route('/conversations/<conversation_id>', methods=['DELETE'])
@auth_required
def delete_conversation(conversation_id):
    """Delete a conversation.
    
    Args:
        conversation_id: Conversation ID
        
    Returns:
        JSON response with success message.
    """
    try:
        # Use the database adapter
        success = current_app.db_adapter.delete(CONVERSATION_TABLE, PartConversation, conversation_id)
        
        if not success:
            return jsonify({"error": "Conversation not found"}), 404
            
        return jsonify({"message": "Conversation deleted successfully"})
    except Exception as e:
        logger.error(f"Error deleting conversation: {str(e)}")
        return jsonify({"error": "An error occurred while deleting the conversation"}), 500

@conversations_bp.route('/conversations/search', methods=['GET'])
@auth_required
def search_conversations():
    """Search conversations by text or semantic similarity.
    
    Query params:
        query: Search query text (required)
        part_id: Part ID (required)
        search_type: Type of search - 'text' or 'semantic' (required)
        limit: Maximum number of results (optional, default 10)
        
    Returns:
        JSON response with search results.
    """
    try:
        # Get query parameters
        query = request.args.get('query')
        part_id = request.args.get('part_id')
        search_type = request.args.get('search_type', 'text')
        limit = int(request.args.get('limit', 10))
        
        if not query:
            return jsonify({"error": "Search query is required"}), 400
            
        if not part_id:
            return jsonify({"error": "part_id is required"}), 400
            
        if search_type not in ['text', 'semantic']:
            return jsonify({"error": "search_type must be 'text' or 'semantic'"}), 400
        
        # Get conversations for this part
        filter_dict = {'part_id': part_id}
        conversations = current_app.db_adapter.get_all(CONVERSATION_TABLE, PartConversation, filter_dict)
        
        # For semantic search
        if search_type == 'semantic' and EMBEDDINGS_AVAILABLE:
            # Generate embedding for query
            query_embedding = embedding_manager.generate_embedding(query)
            
            if not query_embedding:
                return jsonify({"error": "Failed to generate embedding for query"}), 500
            
            # Perform vector similarity search for messages
            results = current_app.db_adapter.query_vector_similarity(
                CONVERSATION_MESSAGE_TABLE,
                ConversationMessage,
                'embedding',
                query_embedding,
                limit,
                filter_dict={'part_id': part_id}  # Add filter for part_id
            )
            
            # Get unique conversation IDs from results
            conversation_ids = set(result.get('conversation_id') for result in results if result.get('conversation_id'))
            
            # Filter conversations to only those with matching messages
            filtered_conversations = [conv for conv in conversations if conv.get('id') in conversation_ids]
            
        # For text search (simple substring matching)
        else:
            # Simple text search implementation
            query_lower = query.lower()
            filtered_conversations = []
            
            # Get all messages for conversations with this part_id
            for conversation in conversations:
                conv_id = conversation.get('id')
                if not conv_id:
                    continue
                
                # Get messages for this conversation
                filter_dict = {'conversation_id': conv_id}
                messages = current_app.db_adapter.get_all(CONVERSATION_MESSAGE_TABLE, ConversationMessage, filter_dict)
                
                # Check if any message content contains the query text
                for message in messages:
                    content = message.get('content', '')
                    if content and query_lower in content.lower():
                        filtered_conversations.append(conversation)
                        break
        
        return jsonify({"conversations": filtered_conversations})
    except Exception as e:
        logger.error(f"Error searching conversations: {str(e)}")
        return jsonify({"error": "An error occurred while searching conversations"}), 500

@conversations_bp.route('/parts/<part_id>/personality-vectors', methods=['POST'])
@auth_required
def generate_personality_vectors(part_id):
    """Generate personality vector embeddings for a part.
    
    Args:
        part_id: Part ID
        
    Returns:
        JSON response with created personality vectors.
    """
    if not EMBEDDINGS_AVAILABLE:
        return jsonify({"error": "Embedding service not available"}), 503
    
    try:
        # Get part
        part = current_app.db_adapter.get_by_id(PART_TABLE, Part, part_id)
        if not part:
            return jsonify({"error": "Part not found"}), 404
        
        # Get personality attributes from request
        data = request.json
        attributes = data.get('attributes', {})
        
        if not attributes or not isinstance(attributes, dict):
            return jsonify({"error": "Attributes dictionary is required"}), 400
        
        # Generate personality vectors
        created_vectors = []
        
        for attribute, description in attributes.items():
            if not description or not isinstance(description, str):
                continue
            
            # Generate embedding
            embedding = embedding_manager.generate_embedding(description)
            
            if not embedding:
                logger.error(f"Failed to generate embedding for {attribute}")
                continue
            
            # Create or update personality vector
            vector_data = {
                'part_id': part_id,
                'attribute': attribute,
                'description': description,
                'embedding': embedding
            }
            
            # Check if vector already exists
            filter_dict = {'part_id': part_id, 'attribute': attribute}
            existing_vectors = current_app.db_adapter.get_all(PERSONALITY_VECTOR_TABLE, PartPersonalityVector, filter_dict)
            
            if existing_vectors:
                # Update existing vector
                existing_id = existing_vectors[0].get('id')
                vector = current_app.db_adapter.update(PERSONALITY_VECTOR_TABLE, PartPersonalityVector, existing_id, vector_data)
            else:
                # Create new vector
                vector = current_app.db_adapter.create(PERSONALITY_VECTOR_TABLE, PartPersonalityVector, vector_data)
            
            if vector:
                created_vectors.append(vector)
        
        return jsonify({
            "message": f"Generated {len(created_vectors)} personality vectors",
            "vectors": created_vectors
        })
    except Exception as e:
        logger.error(f"Error generating personality vectors: {str(e)}")
        return jsonify({"error": "An error occurred while generating personality vectors"}), 500

@conversations_bp.route('/conversations/similar-messages', methods=['POST'])
@auth_required
def find_similar_messages():
    """Find messages similar to the provided text.
    
    Returns:
        JSON response with similar messages.
    """
    if not EMBEDDINGS_AVAILABLE:
        return jsonify({"error": "Embedding service not available"}), 503
    
    try:
        data = request.json
        
        # Get query text
        query_text = data.get('text')
        limit = int(data.get('limit', 5))
        
        if not query_text or not isinstance(query_text, str):
            return jsonify({"error": "Query text is required"}), 400
        
        # Generate embedding for query
        query_embedding = embedding_manager.generate_embedding(query_text)
        
        if not query_embedding:
            return jsonify({"error": "Failed to generate embedding for query"}), 500
        
        # Perform vector similarity search
        results = current_app.db_adapter.query_vector_similarity(
            CONVERSATION_MESSAGE_TABLE,
            ConversationMessage,
            'embedding',
            query_embedding,
            limit
        )
        
        # Enrich results with conversation and part information
        enriched_results = []
        
        for result in results:
            conversation_id = result.get('conversation_id')
            
            # Get conversation
            conversation = current_app.db_adapter.get_by_id(CONVERSATION_TABLE, PartConversation, conversation_id)
            
            if not conversation:
                continue
            
            # Get part if available
            part = None
            part_id = conversation.get('part_id')
            
            if part_id:
                part = current_app.db_adapter.get_by_id(PART_TABLE, Part, part_id)
            
            # Add to enriched results
            enriched_results.append({
                "message": result,
                "conversation": conversation,
                "part": part,
                "similarity_score": result.get('distance')
            })
        
        return jsonify(enriched_results)
    except Exception as e:
        logger.error(f"Error finding similar messages: {str(e)}")
        return jsonify({"error": "An error occurred while finding similar messages"}), 500

@conversations_bp.route('/conversations/<conversation_id>/summary', methods=['POST'])
@auth_required
def generate_conversation_summary(conversation_id):
    """Generate or update a summary for a conversation.
    
    Args:
        conversation_id: Conversation ID
        
    Returns:
        JSON response with updated conversation including summary.
    """
    try:
        # Validate conversation exists
        conversation = current_app.db_adapter.get_by_id(CONVERSATION_TABLE, PartConversation, conversation_id)
        if not conversation:
            return jsonify({"error": "Conversation not found"}), 404
        
        # Get messages for this conversation
        filter_dict = {'conversation_id': conversation_id}
        messages = current_app.db_adapter.get_all(CONVERSATION_MESSAGE_TABLE, ConversationMessage, filter_dict)
        
        # Sort messages by timestamp
        messages.sort(key=lambda x: x.get('timestamp', ''))
        
        # Filter valid messages (with content)
        valid_messages = [msg for msg in messages if msg.get('content')]
        
        # Generate a simple summary
        summary = ""
        
        if not valid_messages:
            # No valid messages, use a default summary
            summary = "Empty conversation"
        elif len(valid_messages) == 1:
            # Just one message - use first few words
            content = valid_messages[0].get('content', '')
            words = content.split()
            summary = ' '.join(words[:5]) + ('...' if len(words) > 5 else '')
        else:
            # Multiple messages - try using LLM if available
            try:
                if LLM_AVAILABLE:
                    # Get part information for context
                    part_id = conversation.get('part_id')
                    part = current_app.db_adapter.get_by_id(PART_TABLE, Part, part_id)
                    part_name = part.get('name', 'Part') if part else 'Part'
                    
                    # Create a simple prompt with just the first and last messages for brevity
                    first_msg = valid_messages[0]
                    last_msg = valid_messages[-1]
                    
                    conversation_text = f"{first_msg.get('role', 'unknown')}: {first_msg.get('content', '')}\n"
                    if len(valid_messages) > 2:
                        conversation_text += "... [middle messages omitted] ...\n"
                    conversation_text += f"{last_msg.get('role', 'unknown')}: {last_msg.get('content', '')}"
                    
                    summary_prompt = f"""
                    Briefly summarize what this conversation with {part_name} is about in 5-7 words only:
                    
                    {conversation_text}
                    
                    Summary (5-7 words only):
                    """
                    
                    # Generate summary with LLM
                    llm_summary = llm_service.generate_response(summary_prompt)
                    summary = llm_summary.strip('"\'.\n').strip()
                    
                    # Limit length
                    if len(summary.split()) > 10:  
                        summary = ' '.join(summary.split()[:7])
                else:
                    # No LLM - use first message approach
                    raise Exception("LLM not available")
            except Exception as e:
                logger.warning(f"LLM summary failed, falling back to simple approach: {str(e)}")
                # Simple approach - use first user message as summary
                first_user_msg = next((m for m in valid_messages if m.get('role') == 'user'), None) or valid_messages[0]
                content = first_user_msg.get('content', '')
                words = content.split()
                summary = ' '.join(words[:5]) + ('...' if len(words) > 5 else '')
        
        # Update the conversation with the summary
        update_data = {'summary': summary}
        updated_conversation = current_app.db_adapter.update(CONVERSATION_TABLE, PartConversation, conversation_id, update_data)
        
        if not updated_conversation:
            return jsonify({"error": "Failed to update conversation with summary"}), 500
            
        logger.info(f"Generated summary for conversation {conversation_id}: {summary}")
        return jsonify({"conversation": updated_conversation})
            
    except Exception as e:
        logger.error(f"Error generating conversation summary: {str(e)}")
        return jsonify({"error": "An error occurred while generating the summary"}), 500

@conversations_bp.route('/parts/<part_id>/conversations', methods=['GET'])
@auth_required
def get_conversations_by_part(part_id):
    """Get all conversations for a specific part.
    
    Args:
        part_id: Part ID
        
    Returns:
        JSON response with conversations data.
    """
    try:
        # Validate part exists
        part = current_app.db_adapter.get_by_id(PART_TABLE, Part, part_id)
        if not part:
            return jsonify({"error": "Part not found"}), 404
            
        # Get system_id from part
        system_id = part.get('system_id')
        
        # Build filter dictionary
        filter_dict = {'part_id': part_id}
        
        # Use the database adapter
        conversations = current_app.db_adapter.get_all(CONVERSATION_TABLE, PartConversation, filter_dict)
        
        # Enrich conversations with message counts to help frontend make better decisions
        for conversation in conversations:
            try:
                # Get message count for each conversation
                msg_filter = {'conversation_id': conversation.get('id')}
                message_count = current_app.db_adapter.count(CONVERSATION_MESSAGE_TABLE, ConversationMessage, msg_filter)
                conversation['message_count'] = message_count
            except Exception as e:
                logger.warning(f"Could not get message count for conversation {conversation.get('id')}: {str(e)}")
                # Don't fail if we can't get the count, just continue
        
        return jsonify({"conversations": conversations})
    except Exception as e:
        logger.error(f"Error fetching conversations for part: {str(e)}")
        return jsonify({"error": "An error occurred while fetching conversations"}), 500

@conversations_bp.route('/parts/<part_id>/conversations', methods=['POST'])
@auth_required
def create_conversation_for_part(part_id):
    """Create a new conversation for a specific part.
    
    Args:
        part_id: Part ID
        
    Returns:
        JSON response with created conversation data.
    """
    try:
        data = request.json
        
        # Validate part exists
        part = current_app.db_adapter.get_by_id(PART_TABLE, Part, part_id)
        if not part:
            return jsonify({"error": "Part not found"}), 404
        
        # Extract system_id from part
        system_id = part.get('system_id')
        
        # Extract title from request or generate one
        title = data.get('title')
        if not title:
            title = f"Conversation with {part.get('name', 'Part')} - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        
        # Create conversation
        conversation_data = {
            'title': title,
            'part_id': part_id,
            'system_id': system_id,
        }
        
        # Add timestamp if provided
        if 'timestamp' in data:
            conversation_data['timestamp'] = data.get('timestamp')
        
        conversation = current_app.db_adapter.create(CONVERSATION_TABLE, PartConversation, conversation_data)
        
        if not conversation:
            return jsonify({"error": "Failed to create conversation"}), 500
        
        return jsonify({"conversation": conversation}), 201
    except Exception as e:
        logger.error(f"Error creating conversation for part: {str(e)}")
        return jsonify({"error": "An error occurred while creating the conversation"}), 500

@conversations_bp.route('/test', methods=['GET'])
def test_conversation_route():
    """Test endpoint to verify the conversations blueprint is working."""
    return jsonify({
        "status": "ok",
        "message": "Conversations API is accessible",
        "blueprint": "conversations_bp"
    }) 