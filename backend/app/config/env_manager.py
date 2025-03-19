"""
Environment configuration manager.
Handles loading different environment configurations based on FLASK_ENV.
"""
import os
from dotenv import load_dotenv
import logging

logger = logging.getLogger(__name__)

def load_environment():
    """
    Load the appropriate environment file based on FLASK_ENV.
    
    Priority:
    1. .env.{environment}.local (for local overrides)
    2. .env.{environment}
    3. .env.local (for local overrides)
    4. .env (default)
    
    Returns:
        dict: Loaded environment variables
    """
    # Determine the environment
    env = os.environ.get('FLASK_ENV', 'development')
    logger.info(f"Loading environment configuration for: {env}")
    
    # Define env files to try in order of priority
    env_files = [
        f".env.{env}.local",  # highest priority
        f".env.{env}",
        ".env.local",
        ".env"                # lowest priority
    ]
    
    # Try to load each env file in order
    loaded_files = []
    for env_file in env_files:
        if os.path.isfile(env_file):
            load_dotenv(env_file, override=True)
            loaded_files.append(env_file)
            
    if loaded_files:
        logger.info(f"Loaded environment from: {', '.join(loaded_files)}")
    else:
        logger.warning("No environment files found. Using system environment variables.")
    
    # Log important configuration (without sensitive values)
    logger.info(f"FLASK_ENV: {os.environ.get('FLASK_ENV', 'development')}")
    logger.info(f"DEBUG: {os.environ.get('DEBUG', 'False')}")
    logger.info(f"Using database: {os.environ.get('DATABASE_URL', 'Not set').split('@')[0]}@...")  # Hide credentials
    
    if 'SUPABASE_URL' in os.environ:
        logger.info("Supabase configuration found")
    
    return os.environ 