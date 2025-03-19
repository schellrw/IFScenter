"""
Systems API routes for managing IFS systems.
"""
import logging
from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import jwt_required, get_jwt_identity
from marshmallow import Schema, fields, validate, ValidationError
import uuid

from ..models import db, IFSSystem, Part
from ..utils.auth_adapter import auth_required

systems_bp = Blueprint('systems', __name__)
logger = logging.getLogger(__name__)

# Validation schema for system creation/updates
class SystemSchema(Schema):
    """Schema for validating system data."""
    name = fields.String(required=True, validate=validate.Length(min=1, max=200))
    description = fields.String(allow_none=True)

@systems_bp.route('/system', methods=['GET'])
@auth_required
def get_system():
    """Get the user's IFS system.
    
    Returns:
        JSON response with the user's system, or creates one if it doesn't exist.
    """
    try:
        user_id = g.current_user['id'] if hasattr(g, 'current_user') else get_jwt_identity()
        system = IFSSystem.query.filter_by(user_id=user_id).first()
        
        # Create a system if it doesn't exist
        if not system:
            logger.info(f"Creating new system for user {user_id}")
            system = IFSSystem(
                user_id=user_id,
                name="My IFS System",  # This will be ignored since column doesn't exist in DB
                description="Default IFS system"  # This will be ignored since column doesn't exist in DB
            )
            
            # Add and commit the system first to get an ID
            db.session.add(system)
            db.session.commit()
            
            # Now create the default "Self" part with the valid system ID
            self_part = Part(
                name="Self",
                role="Core Self",
                description="The centered, compassionate Self that is the goal of IFS therapy.",
                feelings=["Calm", "curious", "compassionate", "connected", "clear", "confident", "creative", "courageous"],
                beliefs=["All parts are welcome. I can hold space for all experiences."],
                system_id=str(system.id)
            )
            
            # Add and commit the Self part separately
            db.session.add(self_part)
            db.session.commit()
            
            logger.info(f"Created new system with ID {system.id} for user {user_id}")
        else:
            logger.info(f"Retrieved existing system for user {user_id}")
        
        # Get parts count
        parts_count = Part.query.filter_by(system_id=str(system.id)).count()
        
        system_data = system.to_dict()
        system_data['parts_count'] = parts_count
        
        return jsonify(system_data)
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error retrieving system: {str(e)}")
        return jsonify({"error": str(e)}), 500

@systems_bp.route('/system', methods=['PUT'])
@auth_required
def update_system():
    """Update the user's IFS system.
    
    Returns:
        JSON response with the updated system.
    """
    try:
        user_id = g.current_user['id'] if hasattr(g, 'current_user') else get_jwt_identity()
        system = IFSSystem.query.filter_by(user_id=user_id).first()
        
        if not system:
            logger.error(f"System not found for user {user_id}")
            return jsonify({"error": "System not found"}), 404
        
        # Validate incoming data
        try:
            data = request.json
            SystemSchema().load(data)
        except ValidationError as e:
            logger.warning(f"Validation error: {e.messages}")
            return jsonify({"error": "Validation failed", "details": e.messages}), 400
        
        # Update system fields
        if 'name' in data:
            system.name = data['name']
        if 'description' in data:
            system.description = data['description']
        
        db.session.commit()
        
        logger.info(f"Updated system for user {user_id}")
        return jsonify({
            "success": True,
            "system": system.to_dict()
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating system: {str(e)}")
        return jsonify({"error": str(e)}), 500

@systems_bp.route('/system/overview', methods=['GET'])
@auth_required
def get_system_overview():
    """Get a comprehensive overview of the user's IFS system.
    
    Returns:
        JSON response with the system overview including parts and relationships count.
    """
    try:
        user_id = g.current_user['id'] if hasattr(g, 'current_user') else get_jwt_identity()
        system = IFSSystem.query.filter_by(user_id=user_id).first()
        
        if not system:
            # Create a system if it doesn't exist
            return get_system()
        
        # Get parts
        parts = Part.query.filter_by(system_id=str(system.id)).all()
        parts_count = len(parts)
        
        # Get relationships count using raw SQL for efficiency
        relationships_count_query = db.session.execute(
            """
            SELECT COUNT(*) 
            FROM relationship r
            JOIN part p1 ON r.part1_id = p1.id
            JOIN part p2 ON r.part2_id = p2.id
            WHERE p1.system_id = :system_id AND p2.system_id = :system_id
            """,
            {"system_id": str(system.id)}
        )
        relationships_count = relationships_count_query.scalar() or 0
        
        # Get journal entries count
        journals_count_query = db.session.execute(
            """
            SELECT COUNT(*)
            FROM journal
            WHERE system_id = :system_id
            """,
            {"system_id": str(system.id)}
        )
        journals_count = journals_count_query.scalar() or 0
        
        system_data = system.to_dict()
        system_data.update({
            "parts_count": parts_count,
            "relationships_count": relationships_count,
            "journals_count": journals_count,
            "parts": [part.to_dict() for part in parts]
        })
        
        logger.info(f"Retrieved system overview for user {user_id}")
        return jsonify(system_data)
        
    except Exception as e:
        logger.error(f"Error retrieving system overview: {str(e)}")
        return jsonify({"error": str(e)}), 500

@systems_bp.route('/system/reset', methods=['POST'])
@auth_required
def reset_system():
    """Reset the user's IFS system (delete all parts, relationships, and journal entries).
    
    Returns:
        JSON response indicating success or failure.
    """
    try:
        user_id = g.current_user['id'] if hasattr(g, 'current_user') else get_jwt_identity()
        system = IFSSystem.query.filter_by(user_id=user_id).first()
        
        if not system:
            logger.error(f"System not found for user {user_id}")
            return jsonify({"error": "System not found"}), 404
        
        # Delete relationships (will be cascaded but doing explicitly for logging)
        db.session.execute(
            """
            DELETE FROM relationship
            WHERE part1_id IN (SELECT id FROM part WHERE system_id = :system_id)
            OR part2_id IN (SELECT id FROM part WHERE system_id = :system_id)
            """,
            {"system_id": str(system.id)}
        )
        
        # Delete journals
        db.session.execute(
            """
            DELETE FROM journal
            WHERE system_id = :system_id
            """,
            {"system_id": str(system.id)}
        )
        
        # Delete all parts except "Self"
        db.session.execute(
            """
            DELETE FROM part
            WHERE system_id = :system_id
            AND name != 'Self'
            """,
            {"system_id": str(system.id)}
        )
        
        db.session.commit()
        
        logger.info(f"Reset system for user {user_id}")
        return jsonify({
            "success": True,
            "message": "System has been reset. All parts (except Self), relationships, and journal entries have been deleted."
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error resetting system: {str(e)}")
        return jsonify({"error": str(e)}), 500 