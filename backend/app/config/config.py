import os
from datetime import timedelta
from typing import List, Optional
from urllib.parse import quote_plus, urlparse, urlunparse

# Database URL configuration function
def get_db_url():
    """Get database URL with encoded password."""
    db_url = os.environ.get('DATABASE_URL')
    
    if not db_url:
        return None
    
    # Fix for SQLAlchemy 1.4+ which requires 'postgresql://' instead of 'postgres://'
    if db_url.startswith('postgres://'):
        db_url = db_url.replace('postgres://', 'postgresql://', 1)
    
    if db_url.startswith('postgresql://'):
        # Parse the URL to extract components
        parsed = urlparse(db_url)
        userinfo = parsed.netloc.split('@')[0]
        
        # If URL contains password
        if ':' in userinfo:
            username, password = userinfo.split(':')
            # URL encode the password
            encoded_password = quote_plus(password)
            # Reconstruct the URL
            host_port = parsed.netloc.split('@')[1]
            return f"postgresql://{username}:{encoded_password}@{host_port}{parsed.path}"
            
    return db_url

class Config:
    """Base configuration."""
    # Flask settings
    SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'dev-secret-key-change-in-production')
    
    # JWT settings
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'dev-secret-key-change-in-production')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=1)
    
    # Database settings
    SQLALCHEMY_DATABASE_URI = get_db_url()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # CORS settings
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000').split(',')
    
    # Logging
    LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')


class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True
    

class TestingConfig(Config):
    """Testing configuration."""
    TESTING = True
    DEBUG = True
    # Use in-memory SQLite for testing
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    

class ProductionConfig(Config):
    """Production configuration."""
    DEBUG = False
    TESTING = False
    # Enforce HTTPS in production
    SESSION_COOKIE_SECURE = True
    REMEMBER_COOKIE_SECURE = True
    
    # Set strict CORS in production
    @property
    def CORS_ORIGINS(self) -> List[str]:
        origins = os.environ.get('CORS_ORIGINS', '').split(',')
        if not origins or origins == ['']:
            # Fallback to specific domains if not configured
            return ['https://your-production-frontend-url.vercel.app']
        return origins


# Configuration dictionary
config_by_name = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}

# Get configuration based on environment
def get_config() -> Config:
    env = os.environ.get('FLASK_ENV', 'default')
    return config_by_name.get(env, config_by_name['default']) 