"""
Application factory module.
"""
import os
import logging
from typing import Optional, Dict, Any, Union, List

# Add dotenv loading at the top level
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from flask import Flask, request, jsonify, g
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from werkzeug.middleware.proxy_fix import ProxyFix

from .models import db
from .utils.logger import configure_logging
from .config.config import get_config
from .utils.db_adapter import init_db_adapter

# Apply Flask-CORS patch for Python 3.12 compatibility
from .utils.flask_cors_patch import apply_patch
apply_patch()

# Import CORS after applying the patch
from flask_cors import CORS

def create_app(test_config: Optional[Dict[str, Any]] = None) -> Flask:
    """Application factory for creating a Flask app instance.
    
    Args:
        test_config: Optional configuration dictionary for testing.
        
    Returns:
        Configured Flask application instance.
    """
    # Create and configure the app
    app = Flask(__name__, instance_relative_config=True, static_folder='static', static_url_path='/')
    
    # Load config
    if test_config is None:
        app.config.from_object(get_config())
    else:
        app.config.from_mapping(test_config)
    
    # Configure logging
    configure_logging(app)
    
    # Initialize extensions
    db.init_app(app)
    migrate = Migrate()
    migrate.init_app(app, db)
    jwt = JWTManager(app)
    
    # Initialize database adapter
    try:
        init_db_adapter(app, db)
        app.logger.info("Database adapter initialized successfully")
    except ImportError as e:
        app.logger.warning(f"Could not initialize database adapter: {e}")
    except Exception as e:
        app.logger.error(f"Error initializing database adapter: {e}")
    
    # Configure CORS
    CORS(app, resources={r"/*": {
        "origins": app.config.get('CORS_ORIGINS', '*'),
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
        "supports_credentials": True
    }})
    
    @app.route('/health')
    def health_check():
        """Simple health check endpoint."""
        return {"status": "ok", "message": "App is running"}, 200

    # Add global OPTIONS handler for preflight requests
    @app.route('/<path:path>', methods=['OPTIONS'])
    def handle_options(path):
        """Global OPTIONS handler to ensure CORS preflight requests work for all routes."""
        app.logger.info(f"Global OPTIONS handler called for path: /{path}")
        response = app.make_response(('', 204))
        response.headers.extend({
            'Access-Control-Allow-Origin': app.config.get('CORS_ORIGINS', '*') if isinstance(app.config.get('CORS_ORIGINS'), str) else '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
        })
        return response
    
    # Add test endpoints for connectivity testing
    @app.route('/api/test', methods=['GET', 'OPTIONS'])
    def test():
        return {"status": "ok", "message": "API is running"}
        
    @app.route('/api/health', methods=['GET', 'OPTIONS'])
    def health():
        return {"status": "ok", "message": "Backend is healthy"}
    
    @app.route('/api/db-status', methods=['GET'])
    def db_status():
        """Check database connection status."""
        try:
            # Try a simple query to check if database is connected
            from .models import User
            result = db.session.execute(db.select(User).limit(1))
            count = len(list(result.scalars()))
            
            # Check JWT config
            jwt_config = {
                "secret_key": app.config.get("JWT_SECRET_KEY", "Not set")[:5] + "...",
                "algorithm": app.config.get("JWT_ALGORITHM", "Not set"),
                "access_expiry": app.config.get("JWT_ACCESS_TOKEN_EXPIRES", "Not set"),
            }
            
            # Return database status and configuration info
            return {
                "status": "ok", 
                "message": "Database connection successful",
                "count": count,
                "db_uri": app.config.get("SQLALCHEMY_DATABASE_URI", "Not set").split("@")[0] + "...",
                "jwt_config": jwt_config
            }
        except Exception as e:
            app.logger.error(f"Database health check failed: {str(e)}")
            return {
                "status": "error",
                "message": f"Database connection failed: {str(e)}",
                "config": app.config.get("SQLALCHEMY_DATABASE_URI", "Not set").split("@")[0] + "..."
            }, 500
    
    @app.route('/api/auth-debug', methods=['GET'])
    def auth_debug():
        """Debug endpoint to check authentication headers."""
        auth_header = request.headers.get('Authorization', 'No Authorization header')
        
        # Get the first 10 chars of the token for debugging (if it exists)
        token_preview = "None"
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            token_preview = token[:10] + "..." if len(token) > 10 else token
        
        # Get all headers for debugging
        headers = {key: value for key, value in request.headers.items()}
        
        return {
            "status": "ok",
            "auth_header": auth_header,
            "token_preview": token_preview,
            "all_headers": headers
        }
    
    # Register blueprints
    from .api.auth import auth_bp
    from .api.parts import parts_bp
    from .api.journals import journals_bp
    from .api.relationships import relationships_bp
    from .api.systems import systems_bp
    from .api.conversations import conversations_bp
    
    app.register_blueprint(auth_bp, url_prefix='/api')
    app.register_blueprint(parts_bp, url_prefix='/api')
    app.register_blueprint(journals_bp, url_prefix='/api')
    app.register_blueprint(relationships_bp, url_prefix='/api')
    app.register_blueprint(systems_bp, url_prefix='/api')
    app.register_blueprint(conversations_bp, url_prefix='/api')
    
    # Root route handler
    @app.route('/', methods=['GET'])
    def index():
        """Serve the root path - either redirect to health check or serve index.html."""
        # Check if we have a static/index.html file
        if app.static_folder and os.path.exists(os.path.join(app.static_folder, 'index.html')):
            return app.send_static_file('index.html')
        else:
            # No static file found, redirect to health endpoint
            return jsonify({
                "message": "IFS Center API - Backend Service",
                "status": "running",
                "api_endpoints": {
                    "health_check": "/health",
                    "api_base": "/api",
                    "api_health": "/api/health",
                    "api_test": "/api/test"
                }
            })
    
    # Shell context for Flask CLI
    @app.shell_context_processor
    def ctx():
        return {'app': app, 'db': db}
        
    return app 