"""
Relationships API routes for managing connections between IFS parts.
"""
import logging
from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import jwt_required, get_jwt_identity
from marshmallow import Schema, fields, validate, ValidationError
import uuid

from ..models import db, Relationship, Part, IFSSystem
from ..utils.auth_adapter import auth_required

relationships_bp = Blueprint('relationships', __name__)
logger = logging.getLogger(__name__)

# Validation schema for relationship creation/updates
class RelationshipSchema(Schema):
    """Schema for validating relationship data."""
    source_id = fields.String(required=True)
    target_id = fields.String(required=True)
    relationship_type = fields.String(required=True, validate=validate.Length(min=1, max=100))
    description = fields.String(allow_none=True)

@relationships_bp.route('/relationships', methods=['GET'])
@auth_required
def get_relationships():
    """Get all relationships in the user's system.
    
    Returns:
        JSON response with all relationships.
    """
    user_id = g.current_user['id'] if hasattr(g, 'current_user') else get_jwt_identity()
    system = IFSSystem.query.filter_by(user_id=user_id).first()
    
    if not system:
        logger.error(f"System not found for user {user_id}")
        return jsonify({"error": "System not found"}), 404
    
    relationships = Relationship.query.filter_by(system_id=str(system.id)).all()
    
    logger.info(f"Retrieved {len(relationships)} relationships for user {user_id}")
    return jsonify([rel.to_dict() for rel in relationships])

@relationships_bp.route('/relationships', methods=['POST'])
@auth_required
def create_relationship():
    """Create a new relationship between parts.
    
    Returns:
        JSON response with the created relationship.
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
            RelationshipSchema().load(data)
        except ValidationError as e:
            logger.warning(f"Validation error: {e.messages}")
            return jsonify({"error": "Validation failed", "details": e.messages}), 400
        
        source_id = data.get('source_id')
        target_id = data.get('target_id')
        
        # Verify source part exists
        source_part = Part.query.filter_by(id=source_id, system_id=str(system.id)).first()
        if not source_part:
            logger.warning(f"Source part {source_id} not found")
            return jsonify({"error": f"Source part {source_id} not found"}), 404
        
        # Verify target part exists
        target_part = Part.query.filter_by(id=target_id, system_id=str(system.id)).first()
        if not target_part:
            logger.warning(f"Target part {target_id} not found")
            return jsonify({"error": f"Target part {target_id} not found"}), 404
        
        # Check if relationship already exists using part1_id/part2_id
        existing_rel = Relationship.query.filter_by(
            part1_id=source_id,
            part2_id=target_id,
            system_id=str(system.id)
        ).first()
        
        if existing_rel:
            logger.warning(f"Relationship already exists between {source_id} and {target_id}")
            return jsonify({"error": f"Relationship already exists between these parts"}), 400
            
        # Create relationship with source_id/target_id which will map to part1_id/part2_id
        relationship = Relationship(
            source_id=source_id,
            target_id=target_id,
            relationship_type=data.get('relationship_type'),
            description=data.get('description', ''),
            system_id=str(system.id)
        )
        
        db.session.add(relationship)
        db.session.commit()
        
        logger.info(f"Created relationship: {relationship.relationship_type}")
        return jsonify({
            "success": True,
            "relationship": relationship.to_dict()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating relationship: {str(e)}")
        return jsonify({"error": str(e)}), 500

@relationships_bp.route('/relationships/<relationship_id>', methods=['GET'])
@auth_required
def get_relationship(relationship_id):
    """Get a specific relationship.
    
    Args:
        relationship_id: ID of the relationship to retrieve.
        
    Returns:
        JSON response with the requested relationship.
    """
    user_id = g.current_user['id'] if hasattr(g, 'current_user') else get_jwt_identity()
    system = IFSSystem.query.filter_by(user_id=user_id).first()
    
    if not system:
        logger.error(f"System not found for user {user_id}")
        return jsonify({"error": "System not found"}), 404
    
    relationship = Relationship.query.filter_by(id=relationship_id, system_id=str(system.id)).first()
    
    if not relationship:
        logger.warning(f"Relationship {relationship_id} not found")
        return jsonify({"error": "Relationship not found"}), 404
    
    logger.info(f"Retrieved relationship {relationship_id}")
    return jsonify(relationship.to_dict())

@relationships_bp.route('/relationships/<relationship_id>', methods=['PUT'])
@auth_required
def update_relationship(relationship_id):
    """Update a specific relationship.
    
    Args:
        relationship_id: ID of the relationship to update.
        
    Returns:
        JSON response with the updated relationship.
    """
    try:
        user_id = g.current_user['id'] if hasattr(g, 'current_user') else get_jwt_identity()
        system = IFSSystem.query.filter_by(user_id=user_id).first()
        
        if not system:
            logger.error(f"System not found for user {user_id}")
            return jsonify({"error": "System not found"}), 404
        
        relationship = Relationship.query.filter_by(id=relationship_id, system_id=str(system.id)).first()
        
        if not relationship:
            logger.warning(f"Relationship {relationship_id} not found")
            return jsonify({"error": "Relationship not found"}), 404
        
        data = request.json
        
        # Update relationship fields
        if 'relationship_type' in data:
            relationship.relationship_type = data['relationship_type']
        if 'description' in data:
            relationship.description = data['description']
        
        db.session.commit()
        
        logger.info(f"Updated relationship {relationship_id}")
        return jsonify({
            "success": True,
            "relationship": relationship.to_dict()
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating relationship: {str(e)}")
        return jsonify({"error": str(e)}), 500

@relationships_bp.route('/relationships/<relationship_id>', methods=['DELETE'])
@auth_required
def delete_relationship(relationship_id):
    """Delete a specific relationship.
    
    Args:
        relationship_id: ID of the relationship to delete.
        
    Returns:
        JSON response indicating success or failure.
    """
    try:
        user_id = g.current_user['id'] if hasattr(g, 'current_user') else get_jwt_identity()
        system = IFSSystem.query.filter_by(user_id=user_id).first()
        
        if not system:
            logger.error(f"System not found for user {user_id}")
            return jsonify({"error": "System not found"}), 404
        
        relationship = Relationship.query.filter_by(id=relationship_id, system_id=str(system.id)).first()
        
        if not relationship:
            logger.warning(f"Relationship {relationship_id} not found")
            return jsonify({"error": "Relationship not found"}), 404
        
        db.session.delete(relationship)
        db.session.commit()
        
        logger.info(f"Deleted relationship {relationship_id}")
        return jsonify({"success": True})
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting relationship: {str(e)}")
        return jsonify({"error": str(e)}), 500 