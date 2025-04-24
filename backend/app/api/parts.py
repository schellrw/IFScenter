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

from ..models import db, Part, PartConversation, User, IFSSystem
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
    """Create a new part, checking subscription limits."""
    try:
        user_id = g.current_user['id']
        user = db.session.get(User, user_id)
        
        if not user:
             logger.error(f"User {user_id} not found during part creation.")
             # This case should ideally not happen if auth_required works
             return jsonify({"error": "Authenticated user not found in database"}), 404

        # --- Subscription Limit Check --- 
        if user.subscription_tier != 'unlimited':
            # Get system_id from request data first
            data = request.json
            system_id = data.get('system_id')
            if not system_id:
                 # Validation handles this later, but check early for clarity
                 return jsonify({"error": "system_id is required"}), 400
                 
            # Check if the system belongs to the user (important security check)
            system = db.session.query(IFSSystem).filter_by(id=system_id, user_id=user_id).first()
            if not system:
                logger.warning(f"User {user_id} attempting to create part in system {system_id} they don't own.")
                return jsonify({"error": "System not found or access denied"}), 403

            # Count existing parts in this system
            current_part_count = db.session.query(Part).filter_by(system_id=system_id).count()
            
            # New limits: Free=10, Pro=20
            limit = 20 if user.subscription_tier == 'pro' else 10
            
            if current_part_count >= limit:
                logger.info(f"Part limit reached for user {user_id} (Tier: {user.subscription_tier}, Limit: {limit}, Count: {current_part_count})")
                tier_name = user.subscription_tier.capitalize()
                # Generalize message for free tier
                upgrade_suggestion = "Please upgrade to add more parts."
                if user.subscription_tier == 'pro':
                     upgrade_suggestion = "Please upgrade to Unlimited to add more parts."
                
                return jsonify({
                    "error": f"{tier_name} plan part limit ({limit}) reached. {upgrade_suggestion}"
                }), 403 # Forbidden status code
        # --- End Limit Check ---
        
        # Proceed with existing part creation logic
        data = request.json # Re-get data if not already fetched
        logger.debug(f"Received part creation request: {data}")
        
        # Validate input
        try:
            PartSchema().load(data)
            logger.debug("Part schema validation passed")
        except ValidationError as e:
            logger.error(f"Part schema validation failed: {e.messages}")
            return jsonify({"error": "Validation failed", "details": e.messages}), 400
        
        # system_id check is done above
        # if 'system_id' not in data:
        #     logger.error("No system_id provided in part creation request")
        #     return jsonify({"error": "system_id is required"}), 400
            
        logger.debug(f"Using system_id: {data['system_id']} for new part")
            
        # Use the database adapter
        try:
            part = current_app.db_adapter.create(TABLE_NAME, Part, data)
            if part is None:
                logger.error("Database adapter returned None for created part")
                return jsonify({"error": "Failed to create part"}), 500
                
            logger.debug(f"Part created successfully with ID: {part.get('id', 'unknown')}")
        except Exception as e:
            logger.error(f"Database adapter failed to create part: {str(e)}")
            return jsonify({"error": f"Failed to create part: {str(e)}"}), 500
        
        return jsonify(part), 201
    except ValidationError as e:
        # This specific catch might be redundant if validation is done earlier
        logger.error(f"Validation error: {e.messages}")
        return jsonify({"error": "Validation failed", "details": e.messages}), 400
    except Exception as e:
        logger.error(f"Error creating part: {str(e)}", exc_info=True) # Add exc_info
        return jsonify({"error": f"An error occurred while creating the part"}), 500 # Simplified error message

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
        # First, get the part to check its name
        part_to_delete = current_app.db_adapter.get_by_id(TABLE_NAME, Part, part_id)
        
        if not part_to_delete:
            return jsonify({"error": "Part not found"}), 404

        # Check if the part name is 'Self'
        if part_to_delete.get('name') == 'Self':
            logger.warning(f"Attempt to delete the core 'Self' part (ID: {part_id}) was blocked.")
            return jsonify({"error": "The core 'Self' part cannot be deleted."}), 403 # Forbidden

        # If not 'Self', proceed with deletion using the database adapter
        success = current_app.db_adapter.delete(TABLE_NAME, Part, part_id)
        
        if not success:
            # This could happen if the part was deleted between the get and delete calls
            logger.error(f"Deletion failed for part {part_id} after initial check.")
            return jsonify({"error": "Part deletion failed unexpectedly."}), 500
            
        logger.info(f"Part {part_id} deleted successfully.")
        return jsonify({"message": "Part deleted successfully"})
    except Exception as e:
        logger.error(f"Error deleting part: {str(e)}")
        return jsonify({"error": "An error occurred while deleting the part"}), 500

# Remove the duplicate conversation routes entirely from parts.py
# The routes in conversations.py will handle these endpoints 