"""
API routes for managing parts in an IFS system.
Supports both SQLAlchemy and Supabase backends.
"""
import logging
from flask import Blueprint, request, jsonify, current_app, g
from marshmallow import Schema, fields, ValidationError, EXCLUDE
from datetime import datetime
from uuid import uuid4
from typing import Dict, Any, List, Optional

from ..models import db, Part, PartConversation
from ..utils.auth_adapter import auth_required

parts_bp = Blueprint('parts', __name__)
logger = logging.getLogger(__name__)

# Table name for Supabase operations
TABLE_NAME = 'parts'

# Input validation schemas
class PartSchema(Schema):
    """Part schema validation."""
    name = fields.String(required=True)
    role = fields.String(required=False, allow_none=True)
    description = fields.String(required=False, allow_none=True)
    image_url = fields.String(required=False, allow_none=True)
    system_id = fields.String(required=True)
    feelings = fields.List(fields.String(), required=False, allow_none=True)
    beliefs = fields.List(fields.String(), required=False, allow_none=True)
    triggers = fields.List(fields.String(), required=False, allow_none=True)
    needs = fields.List(fields.String(), required=False, allow_none=True)

class PartUpdateSchema(Schema):
    """Part schema validation for updates (system_id not required)."""
    name = fields.String(required=True)
    role = fields.String(required=False, allow_none=True)
    description = fields.String(required=False, allow_none=True)
    image_url = fields.String(required=False, allow_none=True)
    system_id = fields.String(required=False, allow_none=True)
    feelings = fields.List(fields.String(), required=False, allow_none=True)
    beliefs = fields.List(fields.String(), required=False, allow_none=True)
    triggers = fields.List(fields.String(), required=False, allow_none=True)
    needs = fields.List(fields.String(), required=False, allow_none=True)
    
    class Meta:
        """Meta options for schema."""
        # This makes the schema ignore unknown fields instead of raising errors
        unknown = EXCLUDE

@parts_bp.route('/parts', methods=['GET'])
@auth_required
def get_parts():
    """Get all parts for the current user's system.
    
    Returns:
        JSON response with parts data.
    """
    try:
        # Get system_id from request query parameters
        system_id = request.args.get('system_id')
        if not system_id:
            return jsonify({"error": "system_id is required"}), 400
        
        # Use the database adapter
        filter_dict = {'system_id': system_id}
        parts = current_app.db_adapter.get_all(TABLE_NAME, Part, filter_dict)
        
        return jsonify(parts)
    except Exception as e:
        logger.error(f"Error fetching parts: {str(e)}")
        return jsonify({"error": "An error occurred while fetching parts"}), 500

@parts_bp.route('/parts/<part_id>', methods=['GET'])
@auth_required
def get_part(part_id):
    """Get a single part by ID.
    
    Args:
        part_id: Part ID
        
    Returns:
        JSON response with part data.
    """
    try:
        # Use the database adapter
        part = current_app.db_adapter.get_by_id(TABLE_NAME, Part, part_id)
        
        if not part:
            return jsonify({"error": "Part not found"}), 404
            
        return jsonify(part)
    except Exception as e:
        logger.error(f"Error fetching part: {str(e)}")
        return jsonify({"error": "An error occurred while fetching the part"}), 500

@parts_bp.route('/parts', methods=['POST'])
@auth_required
def create_part():
    """Create a new part.
    
    Returns:
        JSON response with created part data.
    """
    try:
        data = request.json
        logger.debug(f"Received part creation request: {data}")
        
        # Validate input
        try:
            PartSchema().load(data)
            logger.debug("Part schema validation passed")
        except ValidationError as e:
            logger.error(f"Part schema validation failed: {e.messages}")
            return jsonify({"error": "Validation failed", "details": e.messages}), 400
        
        if 'system_id' not in data:
            logger.error("No system_id provided in part creation request")
            return jsonify({"error": "system_id is required"}), 400
            
        logger.debug(f"Using system_id: {data['system_id']} for new part")
            
        # Use the database adapter
        try:
            part = current_app.db_adapter.create(TABLE_NAME, Part, data)
            logger.debug(f"Part created successfully with ID: {part.get('id', 'unknown')}")
        except Exception as e:
            logger.error(f"Database adapter failed to create part: {str(e)}")
            return jsonify({"error": f"Failed to create part: {str(e)}"}), 500
        
        if not part:
            logger.error("Database adapter returned None for created part")
            return jsonify({"error": "Failed to create part"}), 500
            
        return jsonify(part), 201
    except ValidationError as e:
        logger.error(f"Validation error: {e.messages}")
        return jsonify({"error": "Validation failed", "details": e.messages}), 400
    except Exception as e:
        logger.error(f"Error creating part: {str(e)}")
        return jsonify({"error": f"An error occurred while creating the part: {str(e)}"}), 500

@parts_bp.route('/parts/<part_id>', methods=['PUT'])
@auth_required
def update_part(part_id):
    """Update a part.
    
    Args:
        part_id: Part ID
        
    Returns:
        JSON response with updated part data.
    """
    try:
        data = request.json
        logger.info(f"Updating part {part_id} with data: {data}")
        
        # For update operations, system_id should be optional
        # First, get the existing part to ensure it exists
        existing_part = current_app.db_adapter.get_by_id(TABLE_NAME, Part, part_id)
        if not existing_part:
            return jsonify({"error": "Part not found"}), 404
        
        # Validate input with update schema (doesn't require system_id)
        try:
            PartUpdateSchema().load(data)
        except ValidationError as e:
            logger.error(f"Validation error updating part: {e.messages}")
            return jsonify({"error": "Validation failed", "details": e.messages}), 400
        
        # Remove system_id if present (shouldn't be updated)
        data.pop('system_id', None)
        
        # Explicitly set updated_at to current time to ensure it's updated
        from datetime import datetime
        data['updated_at'] = datetime.utcnow().isoformat()
        logger.info(f"Setting updated_at to {data['updated_at']} for part update")
        
        # Use the database adapter to update
        part = current_app.db_adapter.update(TABLE_NAME, Part, part_id, data)
        if not part:
            logger.error(f"Update failed for part {part_id}")
            return jsonify({"error": "Failed to update part"}), 500
            
        logger.info(f"Part updated successfully: {part.get('id', 'unknown')} with timestamp {part.get('updated_at')}")
        return jsonify(part)
    except ValidationError as e:
        logger.error(f"Unexpected validation error: {e.messages}")
        return jsonify({"error": "Validation failed", "details": e.messages}), 400
    except Exception as e:
        logger.error(f"Error updating part: {str(e)}")
        return jsonify({"error": f"An error occurred while updating the part: {str(e)}"}), 500

@parts_bp.route('/parts/<part_id>', methods=['DELETE'])
@auth_required
def delete_part(part_id):
    """Delete a part.
    
    Args:
        part_id: Part ID
        
    Returns:
        JSON response with success message.
    """
    try:
        # Use the database adapter
        success = current_app.db_adapter.delete(TABLE_NAME, Part, part_id)
        
        if not success:
            return jsonify({"error": "Part not found"}), 404
            
        return jsonify({"message": "Part deleted successfully"})
    except Exception as e:
        logger.error(f"Error deleting part: {str(e)}")
        return jsonify({"error": "An error occurred while deleting the part"}), 500

@parts_bp.route('/parts/<part_id>/conversations', methods=['GET', 'OPTIONS'])
@auth_required
def get_part_conversations(part_id):
    """Get conversations for a specific part.
    
    Args:
        part_id: Part ID
        
    Returns:
        JSON response with conversations data.
    """
    # Handle OPTIONS request for CORS preflight
    if request.method == 'OPTIONS':
        logger.info(f"Handling OPTIONS request for /parts/{part_id}/conversations")
        # Set CORS headers for OPTIONS response
        response = current_app.make_response(('', 204))
        response.headers.extend({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        })
        return response

    try:
        # Verify the part exists
        part = current_app.db_adapter.get_by_id(TABLE_NAME, Part, part_id)
        if not part:
            return jsonify({"error": "Part not found"}), 404
            
        # Get conversations for this part
        from ..models import PartConversation
        filter_dict = {'part_id': part_id}
        conversations = current_app.db_adapter.get_all('part_conversations', PartConversation, filter_dict)
        
        return jsonify({"conversations": conversations})
    except Exception as e:
        logger.error(f"Error fetching part conversations: {str(e)}")
        return jsonify({"error": "An error occurred while fetching part conversations"}), 500

@parts_bp.route('/parts/<part_id>/conversations', methods=['POST', 'OPTIONS'])
@auth_required
def create_part_conversation(part_id):
    """Create a new conversation for a specific part.
    
    Args:
        part_id: Part ID
        
    Returns:
        JSON response with created conversation data.
    """
    # Handle OPTIONS request for CORS preflight
    if request.method == 'OPTIONS':
        logger.info(f"Handling OPTIONS request for POST /parts/{part_id}/conversations")
        # Set CORS headers for OPTIONS response
        response = current_app.make_response(('', 204))
        response.headers.extend({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        })
        return response
        
    try:
        # Verify the part exists
        part = current_app.db_adapter.get_by_id(TABLE_NAME, Part, part_id)
        if not part:
            return jsonify({"error": "Part not found"}), 404
            
        data = request.json
        title = data.get('title', f"Conversation with {part.get('name', 'Part')}")
        timestamp = data.get('timestamp')  # Optional timestamp to detect duplicates
        
        # Check for potential duplicate conversations (created in the last 5 seconds)
        if timestamp:
            from ..models import PartConversation
            import datetime
            from datetime import timezone
            
            # Get recent conversations
            filter_dict = {'part_id': part_id}
            recent_conversations = current_app.db_adapter.get_all('part_conversations', PartConversation, filter_dict)
            
            # Parse the provided timestamp
            try:
                request_time = datetime.datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            except (ValueError, AttributeError):
                # If timestamp is invalid, just continue with creation
                request_time = datetime.datetime.now(timezone.utc)
                
            # Check if any conversations were created very recently (within 5 seconds)
            for conv in recent_conversations:
                try:
                    # Parse the created_at timestamp
                    created_time_str = conv.get('created_at')
                    if created_time_str:
                        created_time = datetime.datetime.fromisoformat(created_time_str.replace('Z', '+00:00'))
                        time_diff = abs((request_time - created_time).total_seconds())
                        
                        # If a very recent conversation exists, return it instead of creating a new one
                        if time_diff < 5:
                            logger.info(f"Found duplicate conversation request, returning existing conversation {conv.get('id')}")
                            return jsonify({"conversation": conv, "duplicate": True}), 200
                except (ValueError, AttributeError) as e:
                    # If parsing fails, just continue checking other conversations
                    logger.warning(f"Error parsing timestamp: {e}")
                    continue
        
        # Create conversation
        from ..models import PartConversation
        conversation_data = {
            'title': title,
            'part_id': part_id,
            'system_id': part.get('system_id')
        }
        
        conversation = current_app.db_adapter.create('part_conversations', PartConversation, conversation_data)
        
        if not conversation:
            return jsonify({"error": "Failed to create conversation"}), 500
        
        return jsonify({"conversation": conversation}), 201
    except Exception as e:
        logger.error(f"Error creating part conversation: {str(e)}")
        return jsonify({"error": "An error occurred while creating the conversation"}), 500 