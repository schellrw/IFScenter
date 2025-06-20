"""
Authentication adapter module.
Provides a unified interface for authentication operations with both
custom JWT and Supabase Auth backends.
"""
import os
import logging
from typing import Dict, Any, Optional, Tuple
from functools import wraps
import uuid

from flask import request, g, current_app, jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from werkzeug.local import LocalProxy

# Import supabase client properly for the package structure
from backend.app.utils.supabase_client import supabase
from backend.app.models import db, User, IFSSystem, Part

logger = logging.getLogger(__name__)

# Set the logging level for detailed debugging
logger.setLevel(logging.DEBUG)

# Configuration
use_supabase_auth = os.environ.get('SUPABASE_USE_FOR_AUTH', 'False').lower() == 'true'
logger.debug(f"SUPABASE_USE_FOR_AUTH value: {use_supabase_auth}")

# Add a function to check if Supabase is truly available
def is_supabase_available():
    """Check if Supabase is available for authentication.
    
    Returns:
        bool: True if Supabase is available, False otherwise.
    """
    if not use_supabase_auth:
        # Not configured to use Supabase
        return False
        
    # Check if client was initialized
    if not supabase.is_available():
        logger.warning("Supabase client not available, will use JWT authentication")
        return False
        
    # Try a simple test call to ensure it's working
    try:
        # Do a lightweight operation to test connectivity
        supabase.client.auth.get_session()
        logger.info("Supabase auth connection verified")
        return True
    except Exception as e:
        logger.error(f"Supabase auth connection failed: {str(e)}")
        return False

# Determine whether to actually use Supabase based on availability
should_use_supabase = use_supabase_auth and supabase.is_available()
logger.info(f"Actual auth mode: {'Supabase' if should_use_supabase else 'JWT'}")

def get_current_user() -> Optional[Dict[str, Any]]:
    """Get the current authenticated user.
    
    Returns:
        Optional[Dict[str, Any]]: User data or None if not authenticated.
    """
    if hasattr(g, 'current_user'):
        return g.current_user
    return None

# Create a proxy for the current user
current_user = LocalProxy(get_current_user)

# === Add Standalone Token Verification Function ===
def verify_token() -> Optional[Dict[str, Any]]:
    """Verifies the token from the Authorization header using the active strategy.

    Currently prioritizes Supabase if configured and available.
    Extracts user info upon successful verification.

    Returns:
        Optional[Dict[str, Any]]: User info dictionary (e.g., {'id': ..., 'email': ...}) or None if verification fails.
    """
    if should_use_supabase:
        # Use Supabase Auth strategy
        try:
            auth_header = request.headers.get('Authorization')
            logger.debug(f"verify_token: Auth header: {auth_header}")
            if not auth_header or not auth_header.startswith('Bearer '):
                logger.error("verify_token: Missing or invalid authorization header")
                return None
            
            token = auth_header.split(' ')[1]
            
            # Verify with Supabase
            logger.debug(f"verify_token: Verifying token with Supabase: {token[:10]}...")
            user_data = supabase.client.auth.get_user(token)
            
            if not user_data or not user_data.user:
                logger.error("verify_token: Invalid or expired Supabase token")
                return None
            
            logger.debug(f"verify_token: Authenticated user: {user_data.user.email}")
            
            # Return relevant user info (using standard JWT claims where possible)
            return {
                "sub": str(user_data.user.id), # 'sub' is standard claim for subject/user ID
                "id": str(user_data.user.id),  # Include 'id' for compatibility
                "email": user_data.user.email,
                # Add any other claims you need from user_data.user or user_data.user.user_metadata
            }
        except Exception as e:
            logger.error(f"verify_token: Supabase auth error: {str(e)}")
            return None
    else:
        # JWT strategy (if not using Supabase)
        try:
            # This verifies the token is present, valid, and not expired
            verify_jwt_in_request() 
            user_id = get_jwt_identity()
            logger.debug(f"verify_token: JWT verified, identity: {user_id}")
            # For JWT, we might only have the ID. Fetch other details if needed.
            # Here, we just return the ID as 'sub' and 'id'.
            return {
                "sub": user_id, 
                "id": user_id 
                # Add email etc. if you store them in the JWT or fetch from DB
            }
        except Exception as e:
            logger.error(f"verify_token: JWT auth error: {str(e)}")
            return None

# ====================================================

def auth_required(f):
    """
    Decorator for routes that require authentication.
    Works with both JWT and Supabase auth strategies.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        # Allow OPTIONS requests to pass through without authentication
        if request.method == 'OPTIONS':
            return f(*args, **kwargs)
            
        if use_supabase_auth:
            # Use Supabase Auth strategy
            if supabase.is_available():
                try:
                    auth_header = request.headers.get('Authorization')
                    logger.debug(f"Auth header: {auth_header}")
                    if not auth_header or not auth_header.startswith('Bearer '):
                        return jsonify({"error": "Missing or invalid authorization header"}), 401
                    
                    token = auth_header.split(' ')[1]
                    # Store the token in Flask's g object for database operations
                    g.user_token = token
                    
                    # Verify with Supabase
                    logger.debug(f"Verifying token with Supabase: {token[:10]}...")
                    user_data = supabase.client.auth.get_user(token)
                    if not user_data or not user_data.user:
                        return jsonify({"error": "Invalid or expired token"}), 401
                    
                    logger.debug(f"Authenticated user: {user_data.user.email}")
                    
                    # Store user data in g
                    g.current_user = {
                        "id": user_data.user.id,
                        "email": user_data.user.email,
                        # Add any other user data you need
                    }
                    
                    # Check if user exists in the database and create if not
                    from backend.app.models import db, User, IFSSystem, Part
                    
                    user_exists_locally = False
                    user_id_uuid = uuid.UUID(user_data.user.id)
                    
                    # First check by ID
                    user = User.query.filter_by(id=user_id_uuid).first()
                    if user:
                        user_exists_locally = True
                    else:
                        # Then check by email - maybe user exists but with different ID
                        email_user = User.query.filter_by(email=user_data.user.email).first()
                        
                        if email_user:
                            # User exists with this email but different ID - update the ID
                            logger.info(f"Updating existing user ID to match Supabase: {user_data.user.email}")
                            try:
                                email_user.id = user_id_uuid
                                db.session.commit()
                                user_exists_locally = True # User now exists with correct ID
                                user = email_user # Use this user object going forward
                                logger.info(f"Updated user ID successfully to: {user.id}")
                            except Exception as e:
                                db.session.rollback()
                                logger.error(f"Failed to update user ID: {str(e)}")
                                # Proceed cautiously, user might be in inconsistent state
                        else:
                            # No user with this ID or email - try to create new
                            logger.info(f"Creating new user record for Supabase user: {user_data.user.email}")
                            
                            # Extract username from metadata or use email as fallback
                            # Keep username generation for the DB column requirement
                            username_base = user_data.user.user_metadata.get('username', user_data.user.email.split('@')[0])
                            
                            # Check if username already exists and modify if needed
                            username = username_base
                            username_counter = 1
                            while User.query.filter_by(username=username).first():
                                username = f"{username_base}{username_counter}"
                                username_counter += 1
                                
                            # Extract first name from metadata (attempt parsing)
                            extracted_first_name = None
                            # Prioritize 'first_name' if explicitly set in metadata (e.g., from our registration)
                            if 'first_name' in user_data.user.user_metadata:
                                extracted_first_name = user_data.user.user_metadata.get('first_name')
                            # Fallback: try parsing 'full_name' or 'name' from metadata (common OAuth fields)
                            elif 'full_name' in user_data.user.user_metadata:
                                full_name = user_data.user.user_metadata.get('full_name', '')
                                if full_name and isinstance(full_name, str):
                                    extracted_first_name = full_name.split(' ')[0]
                            elif 'name' in user_data.user.user_metadata:
                                full_name = user_data.user.user_metadata.get('name', '')
                                if full_name and isinstance(full_name, str):
                                    extracted_first_name = full_name.split(' ')[0]
                            
                            logger.info(f"Extracted first name: {extracted_first_name}")
                                
                            # Create a new user with a random password (won't be used for auth since we're using Supabase)
                            import secrets
                            import string
                            random_password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(16))
                            
                            # Create user with Supabase ID as the primary key
                            new_user = User(
                                username=username,
                                email=user_data.user.email,
                                password=random_password,
                                first_name=extracted_first_name # Pass extracted first name
                            )
                            # Set the id explicitly to match the Supabase Auth id
                            new_user.id = user_id_uuid
                            
                            try:
                                db.session.add(new_user)
                                # Commit here to ensure user exists before adding system/part
                                db.session.commit() 
                                user_exists_locally = True
                                user = new_user # Use the newly created user object
                                logger.info(f"Created new user record with ID: {user.id} and username: {username}")
                            except Exception as e:
                                db.session.rollback()
                                logger.error(f"Failed to create user record: {str(e)}")
                                # If user creation failed, we cannot proceed to create system/part
                                # Maybe return an error? For now, log and continue.
                    
                    # --- Add System/Part Creation Logic --- 
                    # If a user record was just created OR successfully found/updated,
                    # check if they have an IFSSystem and create if not.
                    if user_exists_locally and user: 
                        system = IFSSystem.query.filter_by(user_id=user.id).first()
                        system_created_now = False # Flag to track if system was created in this request
                        if not system:
                            logger.info(f"No IFSSystem found for user {user.id}. Creating system and default 'Self' part.")
                            try:
                                new_system = IFSSystem(user_id=user.id)
                                db.session.add(new_system)
                                db.session.flush() # Get the new_system ID
                                system = new_system # Use the newly created system object
                                system_created_now = True
                                
                                # --- Create Self Part ONLY if System was just created --- 
                                self_part = Part(
                                    name="Self", 
                                    system_id=str(system.id),
                                    role="Self", 
                                    description="The centered, compassionate Self that is the goal of IFS therapy.", 
                                    feelings=["Calm", "curious", "compassionate", "connected", "clear", "confident", "creative", "courageous"],
                                    beliefs=["All parts are welcome. I can hold space for all experiences."]
                                )
                                db.session.add(self_part)
                                # --- End Create Self Part --- 
                                
                                db.session.commit()
                                logger.info(f"Successfully created IFSSystem ({system.id}) and Self part for user {user.id}")
                            except Exception as e:
                                db.session.rollback()
                                logger.error(f"Failed to create IFSSystem or Self part for user {user.id}: {str(e)}")
                                system = None # Ensure system is None if creation failed
                                system_created_now = False
                        else:
                            logger.debug(f"User {user.id} already has an IFSSystem ({system.id}). Skipping system creation.")
                        
                        # --- Check/Create Self Part if System Existed but Part Might Be Missing --- 
                        if system and not system_created_now: # Only check if system existed before this request
                            self_part_exists = Part.query.filter_by(system_id=str(system.id), role='Self').first()
                            if not self_part_exists:
                                logger.warning(f"IFSSystem {system.id} exists for user {user.id}, but 'Self' part is missing. Creating Self part.")
                                try:
                                     # Create the missing Self part with DETAILED attributes
                                     new_self_part = Part(
                                         name="Self", 
                                         system_id=str(system.id),
                                         role="Self", 
                                         description="The centered, compassionate Self that is the goal of IFS therapy.",
                                         feelings=["Calm", "curious", "compassionate", "connected", "clear", "confident", "creative", "courageous"],
                                         beliefs=["All parts are welcome. I can hold space for all experiences."]
                                     )
                                     db.session.add(new_self_part)
                                     db.session.commit()
                                     logger.info(f"Successfully created missing 'Self' part for system {system.id}.")
                                except Exception as e:
                                     db.session.rollback()
                                     logger.error(f"Failed to create missing 'Self' part for system {system.id}: {str(e)}")
                        # --- End Check/Create Self Part --- 
                                     
                    # --- End System/Part Creation Logic --- 

                    return f(*args, **kwargs)
                except Exception as e:
                    logger.error(f"Supabase auth error: {str(e)}")
                    # Distinguish between invalid token and other errors if possible
                    if "invalid token" in str(e).lower():
                         return jsonify({"error": "Invalid or expired token"}), 401
                    return jsonify({"error": "Authentication failed"}), 401 # Or potentially 500 for unexpected errors
            else:
                # Supabase is configured but not available
                logger.error("Authentication required but Supabase auth is configured and unavailable.")
                return jsonify({"error": "Authentication service temporarily unavailable"}), 503
        else:
            # JWT strategy (only if use_supabase_auth is False)
            try:
                verify_jwt_in_request()
                user_id = get_jwt_identity()
                
                # Load user from DB if needed
                # g.current_user = User.query.get(user_id) # Example
                g.current_user = {"id": user_id} # Keep simple for now
                
                return f(*args, **kwargs)
            except Exception as e:
                logger.error(f"JWT auth error: {str(e)}")
                return jsonify({"error": "Authentication failed"}), 401
    
    return decorated

def register_user(firstName: Optional[str], email: str, password: str) -> Tuple[Dict[str, Any], str, Optional[str]]:
    """
    Register a new user using the appropriate authentication system.
    
    Args:
        firstName: Optional first name for the new user
        email: Email address
        password: Password
        
    Returns:
        Tuple[Dict[str, Any], str, Optional[str]]: User data, access token, and refresh token (or None)
    """
    # Check if we should use Supabase or JWT
    actually_use_supabase = use_supabase_auth and supabase.is_available()
    
    if actually_use_supabase:
        try:
            # Register with Supabase
            # Store firstName in user_metadata
            signup_options = {
                "data": {
                    "first_name": firstName if firstName else '' # Store as first_name, ensure it's at least an empty string
                }
            }
            
            signup_data = supabase.client.auth.sign_up({
                "email": email,
                "password": password,
                "options": signup_options
            })
            
            logger.debug(f"Supabase signup response: {signup_data}")
            
            if not signup_data.user:
                raise ValueError("User registration failed")
                
            user_data = {
                "id": signup_data.user.id,
                "email": signup_data.user.email,
                "firstName": firstName, # Return firstName
                # We might not have a reliable username here unless derived
            }
            
            # Extract tokens if session exists
            access_token = ""
            refresh_token = None
            if signup_data.session:
                access_token = signup_data.session.access_token
                refresh_token = signup_data.session.refresh_token # Get refresh token
                logger.debug("Session and tokens available after registration")
            else:
                logger.warning("No session available after registration - email confirmation may be required")
                user_data["confirmation_required"] = True
            
            return user_data, access_token, refresh_token # Return all three
        except Exception as e:
            logger.error(f"Supabase registration error: {str(e)}")
            raise
    else:
        # Use regular database models and JWT
        from backend.app.models import db, User
        from flask_jwt_extended import create_access_token
        
        # Check for existing email only
        existing_email = User.query.filter_by(email=email).first()
        if existing_email:
            raise ValueError("Email already exists")
        
        # Generate a unique username from email prefix
        username_base = email.split('@')[0]
        username = username_base
        username_counter = 1
        while User.query.filter_by(username=username).first():
            username = f"{username_base}{username_counter}"
            username_counter += 1
            
        logger.info(f"Generated unique username '{username}' for email {email}")
            
        # Create new user with generated username and provided firstName
        # ASSUMPTION: User model has a 'first_name' field/column
        user = User(username=username, email=email, password=password, first_name=firstName) 
        db.session.add(user)
        db.session.commit()
        
        # Create access token
        access_token = create_access_token(identity=str(user.id))
        
        # Get user data, potentially including firstName
        user_dict = user.to_dict() 
        if firstName and 'firstName' not in user_dict: # Add if to_dict doesn't include it
            user_dict['firstName'] = firstName
            
        return user_dict, access_token, None # Return None for refresh token in JWT mode

def login_user(username: str, password: str) -> Tuple[Dict[str, Any], str, Optional[str]]:
    """
    Log in a user using the appropriate authentication system.
    
    Args:
        username: Username or email
        password: Password
        
    Returns:
        Tuple[Dict[str, Any], str, Optional[str]]: User data, access token, and refresh token (or None)
    """
    logger.debug(f"Login attempt for user: {username}, auth mode: {'Supabase' if use_supabase_auth else 'JWT'}")
    
    # Check if we should use Supabase or JWT
    actually_use_supabase = use_supabase_auth and supabase.is_available()
    logger.info(f"Using {'Supabase' if actually_use_supabase else 'JWT'} authentication for login")
    
    if actually_use_supabase:
        try:
            # First, try to look up the user email if a username was provided
            user_email = username
            
            # If username doesn't look like an email, try to find the matching email
            if '@' not in username:
                try:
                    # Try to look up the user by username in the users table
                    logger.debug(f"Looking up email for username: {username}")
                    response = supabase.get_table('users').select('email').eq('username', username).execute()
                    logger.debug(f"Database lookup response: {response.data}")
                    
                    if response.data and len(response.data) > 0:
                        user_email = response.data[0]['email']
                        logger.info(f"Found email {user_email} for username {username}")
                    else:
                        logger.warning(f"No email found for username {username}")
                        # If no email found, try direct login with username (might work if metadata is set correctly)
                        logger.debug("Trying direct login with username")
                except Exception as e:
                    logger.error(f"Error looking up user email: {str(e)}")
            
            # Try login with email
            logger.info(f"Attempting Supabase login with email: {user_email}")
            login_data = supabase.client.auth.sign_in_with_password({
                "email": user_email,
                "password": password
            })
            
            logger.debug(f"Login response: {login_data}")
            
            # Check for user and session
            if not login_data.user or not login_data.session:
                # Handle cases like pending email confirmation after failed login attempts
                # Or just general login failure
                logger.warning(f"Supabase login failed or session missing for {user_email}")
                raise ValueError("Invalid email or password, or account requires confirmation.")
                
            # Fetch the full user profile from the local database using the Supabase user ID
            local_user = None
            try:
                from backend.app.models import User # Ensure User model is imported
                local_user = User.query.get(login_data.user.id)
                if local_user:
                    user_data = local_user.to_dict() # Use the full profile from DB
                    logger.info(f"Fetched local profile for Supabase user {login_data.user.id}")
                else:
                    logger.warning(f"Supabase user {login_data.user.id} not found in local DB, returning basic info.")
                    # Fallback to basic info if local user not found (should ideally not happen)
                    user_data = {
                        "id": login_data.user.id,
                        "email": login_data.user.email,
                        "username": login_data.user.user_metadata.get('username', username)
                    }
            except Exception as db_err:
                logger.error(f"Error fetching local user profile for {login_data.user.id}: {db_err}")
                # Fallback if DB query fails
                user_data = {
                    "id": login_data.user.id,
                    "email": login_data.user.email,
                    "username": login_data.user.user_metadata.get('username', username)
                }
            
            logger.info(f"Login successful for user: {user_data.get('username', 'N/A')} ({user_data.get('email', 'N/A')})")
            # Return user_data, access_token, refresh_token
            return user_data, login_data.session.access_token, login_data.session.refresh_token
        except Exception as e:
            logger.error(f"Supabase login error: {str(e)}")
            # Add specific check for invalid login credentials from Supabase/GoTrue
            if "invalid login credentials" in str(e).lower():
                raise ValueError("Invalid email or password")
            raise # Re-raise other exceptions 