"""
Journals API routes for managing IFS journal entries.
"""
import logging
from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import jwt_required, get_jwt_identity
from marshmallow import Schema, fields, validate, ValidationError
import uuid
from datetime import date # Import date for daily check

from ..models import db, Journal, Part, IFSSystem, User
from ..utils.auth_adapter import auth_required

journals_bp = Blueprint('journals', __name__)
logger = logging.getLogger(__name__)

# Validation schema for journal creation/updates
class JournalSchema(Schema):
    """Schema for validating journal data."""
    title = fields.String(required=True, validate=validate.Length(min=1, max=200))
    content = fields.String(allow_none=True)
    part_id = fields.String(allow_none=True)
    metadata = fields.String(allow_none=True)  # Keep as metadata in API schema for consistency

@journals_bp.route('/journals', methods=['GET'])
@auth_required
def get_journals():
    """Get all journals in the user's system.
    
    Returns:
        JSON response with all journal entries.
    """
    user_id = g.current_user['id'] if hasattr(g, 'current_user') else get_jwt_identity()
    
    # Allow passing system_id as a query parameter
    system_id = request.args.get('system_id')
    
    if system_id:
        # Verify the system belongs to the user
        system = IFSSystem.query.filter_by(id=system_id, user_id=user_id).first()
        if not system:
            logger.error(f"System {system_id} not found for user {user_id}")
            return jsonify({"error": "System not found or unauthorized"}), 404
    else:
        # Look up the system for the user
        system = IFSSystem.query.filter_by(user_id=user_id).first()
        if not system:
            logger.error(f"System not found for user {user_id}")
            return jsonify({"error": "System not found"}), 404
        system_id = str(system.id)
    
    # Get journals for the system
    journals = Journal.query.filter_by(system_id=system_id).all()
    
    logger.info(f"Retrieved {len(journals)} journals for system {system_id}")
    return jsonify([journal.to_dict() for journal in journals])

@journals_bp.route('/journals', methods=['POST'])
@auth_required
def create_journal():
    """Create a new journal entry, checking subscription limits."""
    try:
        user_id = g.current_user['id']
        user = db.session.get(User, user_id)
        system = IFSSystem.query.filter_by(user_id=user_id).first()

        if not user:
             logger.error(f"User {user_id} not found during journal creation.")
             return jsonify({"error": "Authenticated user not found in database"}), 404
             
        if not system:
            logger.error(f"System not found for user {user_id}")
            return jsonify({"error": "System not found"}), 404

        # --- Subscription Limit Check --- 
        needs_commit = False
        if user.subscription_tier != 'unlimited':
            # New limits: Free=1, Pro=10
            limit = 10 if user.subscription_tier == 'pro' else 1
            today = date.today() # Keep using server date for daily check unless consistency is needed

            # Check if the counter needs resetting
            if user.last_journal_date != today:
                logger.info(f"Resetting daily journal count for user {user_id}")
                user.daily_journals_used = 0
                user.last_journal_date = today
                needs_commit = True 
                
            # Check the limit
            if user.daily_journals_used >= limit:
                logger.info(f"Daily journal limit reached for user {user_id} (Tier: {user.subscription_tier}, Limit: {limit}, Count: {user.daily_journals_used})")
                tier_name = user.subscription_tier.capitalize()
                return jsonify({
                    "error": f"{tier_name} plan daily journal limit ({limit}) reached. Please upgrade for more daily entries."
                }), 403 # Forbidden

            # --- If check passes, increment happens after successful creation --- 
        
        # --- End Limit Check ---

        # Validate incoming data
        try:
            data = request.json
            JournalSchema().load(data)
        except ValidationError as e:
            logger.warning(f"Validation error: {e.messages}")
            return jsonify({"error": "Validation failed", "details": e.messages}), 400
        
        part_id = data.get('part_id')
        
        # If part_id is provided, verify it exists
        if part_id:
            part = Part.query.filter_by(id=part_id, system_id=str(system.id)).first()
            if not part:
                logger.warning(f"Part {part_id} not found")
                return jsonify({"error": f"Part {part_id} not found"}), 404
        
        # Create journal
        journal = Journal(
            title=data.get('title', 'Untitled Journal'),
            content=data.get('content', ''),
            part_id=part_id,
            system_id=str(system.id),
            journal_metadata=data.get('metadata', '')  # Use journal_metadata in model
        )
        
        db.session.add(journal)
        
        # Increment counter before committing, only if not unlimited
        if user.subscription_tier != 'unlimited':
            user.daily_journals_used += 1
            needs_commit = True # Ensure commit happens if counter increments

        # Commit all changes (reset, increment, new journal)
        if needs_commit:
            db.session.commit()
        else:
            # Only commit the new journal if no counter changes were needed
            db.session.flush() # Get journal ID
            db.session.refresh(journal) # Ensure journal object is updated
            db.session.commit()
            
        journal_dict = journal.to_dict() # Convert after commit to get ID
        
        logger.info(f"Created journal entry: {journal.title}")
        return jsonify({
            "success": True,
            "journal": journal_dict
        }), 201
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating journal: {str(e)}", exc_info=True)
        return jsonify({"error": "An error occurred while creating the journal"}), 500

@journals_bp.route('/journals/<journal_id>', methods=['GET'])
@auth_required
def get_journal(journal_id):
    """Get a specific journal entry.
    
    Args:
        journal_id: ID of the journal to retrieve.
        
    Returns:
        JSON response with the requested journal entry.
    """
    user_id = g.current_user['id'] if hasattr(g, 'current_user') else get_jwt_identity()
    system = IFSSystem.query.filter_by(user_id=user_id).first()
    
    if not system:
        logger.error(f"System not found for user {user_id}")
        return jsonify({"error": "System not found"}), 404
    
    journal = Journal.query.filter_by(id=journal_id, system_id=str(system.id)).first()
    
    if not journal:
        logger.warning(f"Journal {journal_id} not found")
        return jsonify({"error": "Journal not found"}), 404
    
    logger.info(f"Retrieved journal {journal.title}")
    return jsonify(journal.to_dict())

@journals_bp.route('/journals/<journal_id>', methods=['PUT'])
@auth_required
def update_journal(journal_id):
    """Update a specific journal entry.
    
    Args:
        journal_id: ID of the journal to update.
        
    Returns:
        JSON response with the updated journal.
    """
    try:
        user_id = g.current_user['id'] if hasattr(g, 'current_user') else get_jwt_identity()
        system = IFSSystem.query.filter_by(user_id=user_id).first()
        
        if not system:
            logger.error(f"System not found for user {user_id}")
            return jsonify({"error": "System not found"}), 404
        
        journal = Journal.query.filter_by(id=journal_id, system_id=str(system.id)).first()
        
        if not journal:
            logger.warning(f"Journal {journal_id} not found")
            return jsonify({"error": "Journal not found"}), 404
        
        data = request.json
        
        # Update journal fields
        if 'title' in data:
            journal.title = data['title']
        if 'content' in data:
            journal.content = data['content']
        if 'part_id' in data:
            # If part_id is provided, verify it exists
            part_id = data['part_id']
            if part_id:
                part = Part.query.filter_by(id=part_id, system_id=str(system.id)).first()
                if not part:
                    logger.warning(f"Part {part_id} not found")
                    return jsonify({"error": f"Part {part_id} not found"}), 404
            journal.part_id = part_id
        if 'metadata' in data:
            journal.journal_metadata = data['metadata']  # Use journal_metadata in model
        
        db.session.commit()
        
        logger.info(f"Updated journal {journal.title}")
        return jsonify({
            "success": True,
            "journal": journal.to_dict()
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating journal: {str(e)}")
        return jsonify({"error": str(e)}), 500

@journals_bp.route('/journals/<journal_id>', methods=['DELETE'])
@auth_required
def delete_journal(journal_id):
    """Delete a specific journal entry.
    
    Args:
        journal_id: ID of the journal to delete.
        
    Returns:
        JSON response indicating success or failure.
    """
    try:
        user_id = g.current_user['id'] if hasattr(g, 'current_user') else get_jwt_identity()
        system = IFSSystem.query.filter_by(user_id=user_id).first()
        
        if not system:
            logger.error(f"System not found for user {user_id}")
            return jsonify({"error": "System not found"}), 404
        
        # Find the journal entry ensuring it belongs to the user's system
        journal = Journal.query.filter_by(id=journal_id, system_id=str(system.id)).first()
        
        if not journal:
            logger.warning(f"Journal {journal_id} not found or unauthorized for user {user_id}")
            return jsonify({"error": "Journal not found or unauthorized"}), 404
        
        # Delete the journal
        db.session.delete(journal)
        db.session.commit()
        
        logger.info(f"Deleted journal {journal_id} for user {user_id}")
        return jsonify({"success": True, "message": "Journal deleted successfully"}), 200
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting journal {journal_id}: {str(e)}", exc_info=True)
        return jsonify({"error": "An error occurred while deleting the journal"}), 500 