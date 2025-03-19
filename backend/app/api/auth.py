"""
Authentication routes for user registration and login.
Supports both traditional JWT and Supabase Auth based on environment configuration.
"""
import logging
from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from marshmallow import Schema, fields, validate, ValidationError
from email_validator import validate_email, EmailNotValidError

from ..models import db, User, IFSSystem, Part
from ..utils.auth_adapter import auth_required, register_user, login_user, use_supabase_auth

auth_bp = Blueprint('auth', __name__)
logger = logging.getLogger(__name__)

# Input validation schemas
class RegisterSchema(Schema):
    """Registration request schema validation."""
    username = fields.String(required=True, validate=validate.Length(min=3, max=80))
    email = fields.Email(required=True)
    password = fields.String(required=True, validate=validate.Length(min=8))

class LoginSchema(Schema):
    """Login request schema validation."""
    username = fields.String(required=True)
    password = fields.String(required=True)

def validate_registration_input(data):
    """Validate registration input data.
    
    Args:
        data: Dictionary containing registration data.
        
    Returns:
        Tuple of (is_valid, errors) where is_valid is a boolean and errors is a dict or None.
    """
    try:
        # Validate data using schema
        RegisterSchema().load(data)
        
        # Additional email validation
        try:
            validate_email(data.get('email', ''))
        except EmailNotValidError as e:
            return False, {"email": str(e)}
        
        # Check password strength
        password = data.get('password', '')
        if len(password) < 8:
            return False, {"password": "Password must be at least 8 characters long"}
            
        if not any(c.isupper() for c in password) or not any(c.islower() for c in password) or not any(c.isdigit() for c in password):
            return False, {"password": "Password must contain uppercase, lowercase, and numeric characters"}
            
        return True, None
    except ValidationError as e:
        return False, e.messages

@auth_bp.route('/register', methods=['POST'])
def register():
    """Register a new user.
    
    Returns:
        JSON response with user data and access token.
    """
    data = request.json
    
    # Validate input
    is_valid, errors = validate_registration_input(data)
    if not is_valid:
        return jsonify({"error": "Validation failed", "details": errors}), 400
        
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')
    
    logger.info(f"Registration attempt for: {username}, {email}")
    
    try:
        # Use the auth adapter for registration
        user_data, access_token = register_user(username, email, password)
        
        # Create a new system for the user
        # Note: This needs to be adapted for Supabase as well
        if not use_supabase_auth:
            # For traditional database, this is already handled in register_user
            pass
        else:
            # For Supabase, we need to create the system
            system = IFSSystem(user_id=user_data["id"])
            db.session.add(system)
            db.session.flush()
            
            # Add default "Self" part
            self_part = Part(
                name="Self", 
                system_id=str(system.id),
                role="Self", 
                description="The compassionate core consciousness that can observe and interact with other parts"
            )
            db.session.add(self_part)
            db.session.commit()
        
        logger.info(f"User {username} registered successfully with ID: {user_data.get('id')}")
        return jsonify({
            "message": "User registered successfully",
            "access_token": access_token,
            "user": user_data
        }), 201
    except ValueError as e:
        logger.warning(f"Registration validation error: {str(e)}")
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        db.session.rollback()
        logger.error(f"Registration error: {str(e)}")
        return jsonify({"error": "An error occurred during registration"}), 500

@auth_bp.route('/login', methods=['POST'])
def login():
    """Log in a user.
    
    Returns:
        JSON response with user data and access token.
    """
    try:
        data = request.json
        # Validate input
        LoginSchema().load(data)
        
        username = data.get('username')
        password = data.get('password')
        
        # Use the auth adapter for login
        user_data, access_token = login_user(username, password)
        
        logger.info(f"User {username} logged in successfully")
        return jsonify({
            "message": "Login successful",
            "access_token": access_token,
            "user": user_data
        })
    except ValidationError as e:
        return jsonify({"error": "Validation failed", "details": e.messages}), 400
    except ValueError as e:
        logger.warning(f"Login failed: {str(e)}")
        return jsonify({"error": str(e)}), 401
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        return jsonify({"error": "An error occurred during login"}), 500

@auth_bp.route('/me', methods=['GET'])
@auth_required
def get_current_user():
    """Get current authenticated user.
    
    Returns:
        JSON response with current user data.
    """
    if not g.current_user:
        return jsonify({"error": "User not found"}), 404
        
    return jsonify(g.current_user)

@auth_bp.route('/refresh-token', methods=['POST'])
@auth_required
def refresh_token():
    """Refresh the user's access token before it expires.
    
    This endpoint allows extending the user's session without requiring
    them to log in again, as long as their current token is still valid.
    
    Returns:
        JSON response with a new access token.
    """
    try:
        if not g.current_user or not g.current_user.get('id'):
            return jsonify({"error": "User not found"}), 404
            
        user_id = g.current_user.get('id')
        
        if use_supabase_auth:
            # For Supabase Auth, you'd implement their token refresh mechanism
            # This is a placeholder - implement actual Supabase refresh logic
            try:
                from ..utils.supabase_client import supabase
                # This would need to be implemented based on Supabase's API
                logger.warning("Supabase token refresh not fully implemented")
                return jsonify({"error": "Token refresh for Supabase not implemented"}), 501
            except Exception as e:
                logger.error(f"Supabase token refresh error: {str(e)}")
                return jsonify({"error": "Failed to refresh token"}), 500
        else:
            # For JWT, create a new token with the same identity
            new_access_token = create_access_token(identity=user_id)
            
            logger.info(f"Token refreshed for user {user_id}")
            return jsonify({
                "message": "Token refreshed successfully",
                "access_token": new_access_token
            })
    except Exception as e:
        logger.error(f"Token refresh error: {str(e)}")
        return jsonify({"error": "An error occurred during token refresh"}), 500 