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
    firstName = fields.String(required=False, validate=validate.Length(max=100), data_key='firstName')
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
        logger.warning(f"Registration validation failed: {errors}")
        return jsonify({"error": "Validation failed", "details": errors}), 400
        
    # Extract firstName instead of username
    firstName = data.get('firstName') # Can be None
    email = data.get('email')
    password = data.get('password')
    
    logger.info(f"Registration attempt for email: {email}, firstName: {firstName}")
    
    # Check if using Supabase auth
    using_supabase = use_supabase_auth
    supabase_available = False
    
    # Test Supabase availability
    if using_supabase:
        from ..utils.supabase_client import supabase
        supabase_available = supabase.is_available()
        logger.info(f"Supabase available for auth: {supabase_available}")
        
        if not supabase_available:
            logger.warning("Supabase is not available but SUPABASE_USE_FOR_AUTH is True")
            # Fallback logic removed here - we rely on auth_adapter now
            # If Supabase is configured but unavailable, adapter should handle it
            # For registration, we might need a specific check here if we want to prevent registration
            # return jsonify({"error": "Registration service temporarily unavailable due to auth system issue"}), 503
            # For now, let register_user handle the check

    try:
        # Call the updated register_user with firstName
        user_data, access_token, refresh_token = register_user(firstName, email, password) # Pass firstName
        
        # Determine auth method based on whether refresh_token was returned (only Supabase returns one)
        auth_method = "supabase" if refresh_token else "jwt"
        
        # Create a new system for the user
        try:
            # For all auth types, create a system
            system = IFSSystem(user_id=user_data["id"])
            db.session.add(system)
            db.session.flush()
            
            # Add default "Self" part with DETAILED attributes
            self_part = Part(
                name="Self", 
                system_id=str(system.id),
                role="Self", # Keep role as Self for consistency 
                description="The centered, compassionate Self that is the goal of IFS therapy.", # Use detailed description
                feelings=["Calm", "curious", "compassionate", "connected", "clear", "confident", "creative", "courageous"], # Add 8 Cs
                beliefs=["All parts are welcome. I can hold space for all experiences."] # Add core belief
            )
            db.session.add(self_part)
            db.session.commit()
            
            logger.info(f"Created system and default 'Self' part for user {email} with ID {user_data.get('id')}")
        except Exception as system_error:
            logger.error(f"Error creating system for user {email}: {str(system_error)}")
            # Try to rollback just the system creation
            db.session.rollback()
            # Still return success since the user was created
            
        confirmation_required = user_data.get("confirmation_required", False)
        if confirmation_required:
            return jsonify({
                "message": "Registration successful! Please check your email to confirm your account.",
                "confirmation_required": True,
                "user": user_data
            }), 201
            
        logger.info(f"User {email} registered successfully with ID: {user_data.get('id')}")
        response_data = {
            "message": "User registered successfully",
            "access_token": access_token,
            "user": user_data,
            "auth_method": auth_method
        }
        # Add refresh token to response only if using Supabase
        if auth_method == "supabase":
            response_data["refresh_token"] = refresh_token
            
        return jsonify(response_data), 201
    except ValueError as e:
        logger.warning(f"Registration validation error: {str(e)}")
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        db.session.rollback()
        logger.error(f"Registration error: {str(e)}")
        import traceback
        tb = traceback.format_exc()
        logger.error(f"Traceback: {tb}")
        
        # Return more detailed error
        return jsonify({
            "error": "An error occurred during registration", 
            "details": str(e),
            "using_supabase": using_supabase,
            "supabase_available": supabase_available
        }), 500

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
        
        # Call the updated login_user which returns user_data, access_token, refresh_token
        user_data, access_token, refresh_token = login_user(username, password)
        
        # Determine auth method based on whether refresh_token was returned
        auth_method = "supabase" if refresh_token else "jwt"
        
        logger.info(f"User {username} logged in successfully using {auth_method}")
        response_data = {
            "message": "Login successful",
            "access_token": access_token,
            "user": user_data,
            "auth_method": auth_method
        }
        # Add refresh token to response only if using Supabase
        if auth_method == "supabase":
            response_data["refresh_token"] = refresh_token
            
        return jsonify(response_data)
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
    """Get the current authenticated user's full profile from the database.
    
    Returns:
        JSON response with current user data including subscription status.
    """
    if not hasattr(g, 'current_user') or not g.current_user or 'id' not in g.current_user:
        logger.error("Attempted to access /me route without valid user in g context.")
        return jsonify({"error": "Authentication context not found"}), 401

    user_id = g.current_user['id']
    logger.debug(f"Fetching full profile for user ID: {user_id} from g context")
    
    # Query the database for the full user object
    user = db.session.query(User).filter_by(id=user_id).first()
    
    if not user:
        # This case is unlikely if auth_required succeeded but good practice to check
        logger.error(f"User with ID {user_id} found in token but not in database for /me route.")
        return jsonify({"error": "User profile not found in database"}), 404
        
    # Convert user object to dictionary for JSON response
    # Assuming User model has a to_dict() method or similar
    # If not, construct manually: e.g., user_data = {"id": user.id, "email": user.email, ...}
    try:
        user_data = user.to_dict() 
        logger.debug(f"Returning full user profile: {user_data}")
        return jsonify(user_data)
    except AttributeError:
        # Fallback if no to_dict() method
        logger.warning(f"User model does not have to_dict() method. Returning manually constructed profile.")
        user_data = {
            "id": str(user.id), # Ensure UUID is string
            "username": user.username,
            "email": user.email,
            "subscription_tier": user.subscription_tier,
            "subscription_status": user.subscription_status,
            # Add any other fields needed by the frontend
            # "full_name": user.full_name, # If you have this field
            "stripe_customer_id": user.stripe_customer_id, 
            "created_at": user.created_at.isoformat() if user.created_at else None
            # Avoid sending password hash!
        }
        logger.debug(f"Returning manually constructed user profile: {user_data}")
        return jsonify(user_data)
    except Exception as e:
         logger.error(f"Error serializing user data for /me: {e}", exc_info=True)
         return jsonify({"error": "Internal server error preparing user data"}), 500

@auth_bp.route('/refresh-token', methods=['POST'])
def refresh_token():
    """Refresh the user's Supabase access token using a refresh token.
    
    Expects a JSON body with {\"refresh_token\": \"...\"}.
    
    Returns:
        JSON response with new access_token and refresh_token on success.
    """
    if not use_supabase_auth:
        # If not using Supabase, this endpoint is not applicable
        # Or, implement JWT refresh if needed (currently creates new token in else block below)
        # For consistency, let's return an error if Supabase isn't the configured method.
        logger.warning("Refresh token endpoint called while not using Supabase auth.")
        return jsonify({"error": "Token refresh only available for Supabase authentication"}), 400

    data = request.json
    refresh_token_from_request = data.get('refresh_token')

    if not refresh_token_from_request:
        logger.warning("Refresh token request missing refresh_token in body")
        return jsonify({"error": "Missing refresh_token in request body"}), 400

    try:
        from ..utils.supabase_client import supabase
        
        if not supabase.is_available():
             logger.error("Supabase client not available during token refresh attempt.")
             return jsonify({"error": "Authentication service unavailable"}), 503

        logger.info("Attempting to refresh Supabase session...")
        
        # Use the refresh token to get a new session
        # Note: The access_token in the session object is the NEW access token.
        # Pass None for access_token as we are using the refresh token method.
        new_session_response = supabase.client.auth.set_session(
            access_token=None,  # Important: Set access_token to None when using refresh_token
            refresh_token=refresh_token_from_request
        )

        if not new_session_response or not new_session_response.session:
            logger.warning("Supabase set_session did not return a valid session.")
            # This often means the refresh token was invalid or expired
            return jsonify({"error": "Invalid or expired refresh token"}), 401 
            
        new_access_token = new_session_response.session.access_token
        new_refresh_token = new_session_response.session.refresh_token # Supabase might issue a new refresh token

        logger.info(f"Supabase token refreshed successfully for user: {new_session_response.user.id if new_session_response.user else 'Unknown'}")
        
        return jsonify({
            "message": "Token refreshed successfully",
            "access_token": new_access_token,
            "refresh_token": new_refresh_token 
        })

    except Exception as e:
        # Handle potential exceptions from the Supabase client, e.g., network errors, invalid token errors
        logger.error(f"Supabase token refresh error: {str(e)}")
        # Check if the error message indicates an invalid token (this might vary based on Supabase/GoTrue versions)
        if "invalid refresh token" in str(e).lower() or "invalid grant" in str(e).lower():
             return jsonify({"error": "Invalid or expired refresh token"}), 401
        return jsonify({"error": "Failed to refresh token due to server error"}), 500

@auth_bp.route('/profile', methods=['PUT'])
@auth_required
def update_profile():
    """Update the current authenticated user's profile (e.g., first name)."""
    if not hasattr(g, 'current_user') or not g.current_user or 'id' not in g.current_user:
        logger.error("Attempted to access /profile route without valid user in g context.")
        return jsonify({"error": "Authentication context not found"}), 401

    user_id = g.current_user['id']
    data = request.json
    new_first_name = data.get('firstName')

    # Basic validation
    if not new_first_name or not isinstance(new_first_name, str) or len(new_first_name.strip()) == 0:
        return jsonify({"error": "Validation failed", "details": {"firstName": "Name cannot be empty."}}), 400
        
    if len(new_first_name) > 100: # Match model max length if set
         return jsonify({"error": "Validation failed", "details": {"firstName": "Name is too long (max 100 characters)."}}), 400

    try:
        user = db.session.query(User).filter_by(id=user_id).first()
        if not user:
            logger.error(f"User with ID {user_id} found in token but not in database for /profile update.")
            return jsonify({"error": "User profile not found"}), 404

        user.first_name = new_first_name.strip() # Update the first name
        db.session.commit()

        logger.info(f"User profile updated successfully for user ID: {user_id}")
        # Return the updated user profile
        return jsonify(user.to_dict()), 200
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating user profile for user ID {user_id}: {e}", exc_info=True)
        return jsonify({"error": "Internal server error updating profile"}), 500

@auth_bp.route('/logout', methods=['POST'])
@auth_required
def logout():
    # Implement logout logic here
    pass 