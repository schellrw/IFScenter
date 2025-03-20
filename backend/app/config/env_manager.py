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
    5. .env.shared (shared configuration across environments)
    
    Returns:
        dict: Loaded environment variables
    """
    # Determine the environment
    env = os.environ.get('FLASK_ENV', 'development')
    logger.info(f"Loading environment configuration for: {env}")
    
    # Always load shared environment first
    if os.path.isfile('.env.shared'):
        load_dotenv('.env.shared')
        logger.info("Loaded shared environment from .env.shared")
    
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
    
    db_url = os.environ.get('DATABASE_URL', 'Not set')
    if db_url != 'Not set':
        # Hide credentials in logs
        masked_db_url = db_url.split('@')[0].split('://')[0] + '://' + db_url.split('@')[0].split('://')[1].split(':')[0] + ':***@' + db_url.split('@')[1]
        logger.info(f"Using database: {masked_db_url}")
    
    if 'SUPABASE_URL' in os.environ:
        logger.info(f"Supabase configuration found: {os.environ.get('SUPABASE_URL')}")
    
    return os.environ 