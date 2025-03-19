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

# Use absolute imports instead of relative imports
from backend.app.utils.supabase_client import supabase

logger = logging.getLogger(__name__)

# Set the logging level for detailed debugging
logger.setLevel(logging.DEBUG)

# Configuration
use_supabase_auth = os.environ.get('SUPABASE_USE_FOR_AUTH', 'False').lower() == 'true'
logger.debug(f"SUPABASE_USE_FOR_AUTH value: {use_supabase_auth}")

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
            # Supabase Auth strategy
            try:
                auth_header = request.headers.get('Authorization')
                logger.debug(f"Auth header: {auth_header}")
                if not auth_header or not auth_header.startswith('Bearer '):
                    return jsonify({"error": "Missing or invalid authorization header"}), 401
                
                token = auth_header.split(' ')[1]
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
                from backend.app.models import db, User
                
                # First check by ID
                user = User.query.filter_by(id=user_data.user.id).first()
                if not user:
                    # Then check by email - maybe user exists but with different ID
                    email_user = User.query.filter_by(email=user_data.user.email).first()
                    
                    if email_user:
                        # User exists with this email but different ID - update the ID
                        logger.info(f"Updating existing user ID to match Supabase: {user_data.user.email}")
                        try:
                            email_user.id = uuid.UUID(user_data.user.id)
                            db.session.commit()
                            logger.info(f"Updated user ID successfully to: {email_user.id}")
                            # User now exists with correct ID
                        except Exception as e:
                            db.session.rollback()
                            logger.error(f"Failed to update user ID: {str(e)}")
                    else:
                        # No user with this ID or email - try to create new
                        logger.info(f"Creating new user record for Supabase user: {user_data.user.email}")
                        
                        # Extract username from metadata or use email as fallback
                        username_base = user_data.user.user_metadata.get('username', user_data.user.email.split('@')[0])
                        
                        # Check if username already exists and modify if needed
                        username = username_base
                        username_counter = 1
                        while User.query.filter_by(username=username).first():
                            username = f"{username_base}{username_counter}"
                            username_counter += 1
                        
                        # Create a new user with a random password (won't be used for auth since we're using Supabase)
                        import secrets
                        import string
                        random_password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(16))
                        
                        # Create user with Supabase ID as the primary key
                        new_user = User(
                            username=username,
                            email=user_data.user.email,
                            password=random_password
                        )
                        # Set the id explicitly to match the Supabase Auth id
                        new_user.id = uuid.UUID(user_data.user.id)
                        
                        try:
                            db.session.add(new_user)
                            db.session.commit()
                            logger.info(f"Created new user record with ID: {new_user.id} and username: {username}")
                        except Exception as e:
                            db.session.rollback()
                            logger.error(f"Failed to create user record: {str(e)}")
                            # Continue anyway to prevent login failures
                
                return f(*args, **kwargs)
            except Exception as e:
                logger.error(f"Supabase auth error: {str(e)}")
                return jsonify({"error": "Authentication failed"}), 401
        else:
            # JWT strategy
            try:
                verify_jwt_in_request()
                user_id = get_jwt_identity()
                
                # You may want to load the user from the database here
                # and store it in g.current_user
                g.current_user = {"id": user_id}
                
                return f(*args, **kwargs)
            except Exception as e:
                logger.error(f"JWT auth error: {str(e)}")
                return jsonify({"error": "Authentication failed"}), 401
    
    return decorated

def register_user(username: str, email: str, password: str) -> Tuple[Dict[str, Any], str]:
    """
    Register a new user using the appropriate authentication system.
    
    Args:
        username: Username for the new user
        email: Email address
        password: Password
        
    Returns:
        Tuple[Dict[str, Any], str]: User data and access token
    """
    if use_supabase_auth:
        try:
            # Register with Supabase
            signup_data = supabase.client.auth.sign_up({
                "email": email,
                "password": password,
                "options": {
                    "data": {
                        "username": username
                    }
                }
            })
            
            if not signup_data.user:
                raise ValueError("User registration failed")
                
            user_data = {
                "id": signup_data.user.id,
                "email": signup_data.user.email,
                "username": username
            }
            
            return user_data, signup_data.session.access_token
        except Exception as e:
            logger.error(f"Supabase registration error: {str(e)}")
            raise
    else:
        # Use regular database models and JWT
        # This would call your existing registration logic
        from backend.app.models import db, User
        from backend.app.api.auth import create_access_token
        
        # Check for existing user
        existing_user = User.query.filter_by(username=username).first()
        if existing_user:
            raise ValueError("Username already exists")
            
        existing_email = User.query.filter_by(email=email).first()
        if existing_email:
            raise ValueError("Email already exists")
        
        # Create new user
        user = User(username=username, email=email, password=password)
        db.session.add(user)
        db.session.commit()
        
        # Create access token
        access_token = create_access_token(identity=str(user.id))
        
        return user.to_dict(), access_token

def login_user(username: str, password: str) -> Tuple[Dict[str, Any], str]:
    """
    Log in a user using the appropriate authentication system.
    
    Args:
        username: Username or email
        password: Password
        
    Returns:
        Tuple[Dict[str, Any], str]: User data and access token
    """
    logger.debug(f"Login attempt for user: {username}, auth mode: {'Supabase' if use_supabase_auth else 'JWT'}")
    
    if use_supabase_auth:
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
            
            if not login_data.user:
                raise ValueError("Login failed")
                
            user_data = {
                "id": login_data.user.id,
                "email": login_data.user.email,
                "username": login_data.user.user_metadata.get('username', username)
            }
            
            logger.info(f"Login successful for user: {user_data['username']} ({user_data['email']})")
            return user_data, login_data.session.access_token
        except Exception as e:
            logger.error(f"Supabase login error: {str(e)}")
            raise
    else:
        # Use regular database models and JWT
        from backend.app.models import User
        from backend.app.api.auth import create_access_token
        
        # Find user
        user = User.query.filter_by(username=username).first()
        
        if not user or not user.verify_password(password):
            raise ValueError("Invalid username or password")
        
        # Create access token
        access_token = create_access_token(identity=str(user.id))
        
        return user.to_dict(), access_token 