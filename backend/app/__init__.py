"""
Application factory module.
"""
import os
import logging
from typing import Optional, Dict, Any, Union, List
import datetime
import stripe # Import Stripe library

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

    # Initialize Stripe
    if not app.config.get('STRIPE_SECRET_KEY'):
        app.logger.warning("STRIPE_SECRET_KEY not set. Stripe functionality will be disabled.")
    else:
        stripe.api_key = app.config['STRIPE_SECRET_KEY']
        app.logger.info("Stripe library initialized.")

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
    
    # Configure CORS to support both production and development
    flask_env = os.environ.get('FLASK_ENV', 'development')
    netlify_domain = 'https://ifscenter.netlify.app'
    local_domains = ['http://localhost:3000', 'http://127.0.0.1:3000']
    
    # Get CORS origins from environment or use defaults based on environment
    cors_origins = os.environ.get('CORS_ORIGINS', '')
    if not cors_origins:
        if flask_env == 'production':
            cors_origins = netlify_domain
        else:
            cors_origins = ','.join(local_domains)
    
    # Always ensure the Netlify domain is included in production
    if flask_env == 'production' and netlify_domain not in cors_origins:
        cors_origins += f',{netlify_domain}'
        
    # Always ensure localhost domains are included in development
    if flask_env == 'development':
        for domain in local_domains:
            if domain not in cors_origins:
                cors_origins += f',{domain}'
    
    # Convert string to list if it contains commas
    if isinstance(cors_origins, str) and ',' in cors_origins:
        cors_origins = [origin.strip() for origin in cors_origins.split(',') if origin.strip()]
    elif isinstance(cors_origins, str):
        cors_origins = [cors_origins]
        
    app.logger.info(f"Configuring CORS with origins: {cors_origins}")
    CORS(app, resources={r"/*": {
        "origins": cors_origins,
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
        
        # Get origin from request
        origin = request.headers.get('Origin')
        
        # Determine allowed origins based on environment
        allowed_origins = []
        if flask_env == 'production':
            allowed_origins = [netlify_domain]
        else:
            allowed_origins = local_domains
            
        # Add any additional origins from environment
        if os.environ.get('CORS_ORIGINS'):
            for origin_entry in os.environ.get('CORS_ORIGINS').split(','):
                if origin_entry.strip() and origin_entry.strip() not in allowed_origins:
                    allowed_origins.append(origin_entry.strip())
        
        # If origin matches allowed domains, set CORS headers
        if origin in allowed_origins:
            response.headers.extend({
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
                'Access-Control-Allow-Credentials': 'true',
                'Access-Control-Max-Age': '3600'  # Cache preflight for 1 hour
            })
            
        return response
    
    # Add test endpoints for connectivity testing
    @app.route('/api/test', methods=['GET', 'OPTIONS'])
    def test():
        return {"status": "ok", "message": "API is running"}
        
    @app.route('/api/health', methods=['GET', 'OPTIONS'])
    def health():
        return {"status": "ok", "message": "Backend is healthy"}
    
    @app.route('/api/cors-test', methods=['GET', 'OPTIONS'])
    def cors_test():
        """Test endpoint for CORS configuration."""
        # Get origin from request
        origin = request.headers.get('Origin', 'Not provided')
        # Check if origin matches Netlify
        is_netlify = origin == 'https://ifscenter.netlify.app'
        
        return {
            "status": "ok", 
            "message": "CORS test successful",
            "flask_env": os.environ.get('FLASK_ENV', 'Not set'),
            "request_origin": origin,
            "is_netlify_origin": is_netlify,
            "cors_origins_env": os.environ.get('CORS_ORIGINS', 'Not set'),
            "test_time": str(datetime.datetime.now())
        }
    
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
    
    @app.route('/api/auth-test', methods=['POST'])
    def auth_test():
        """Debug endpoint to test auth functionality."""
        try:
            data = request.json
            username = data.get('username', '')
            password = data.get('password', '')
            
            # Test if it's using Supabase or JWT
            from .utils.auth_adapter import use_supabase_auth
            auth_mode = 'Supabase' if use_supabase_auth else 'JWT'
            
            # Test database connection
            from .models import User
            user_exists = False
            users_count = 0
            
            try:
                users = db.session.execute(db.select(User).limit(5))
                users_list = list(users.scalars())
                users_count = len(users_list)
                user = User.query.filter_by(username=username).first()
                user_exists = user is not None
            except Exception as db_error:
                return jsonify({
                    "status": "error",
                    "message": "Database test failed",
                    "error": str(db_error),
                    "auth_mode": auth_mode
                }), 500
            
            return jsonify({
                "status": "ok",
                "message": "Auth test completed",
                "auth_mode": auth_mode,
                "username_submitted": username,
                "password_submitted": "(hidden)",
                "user_exists": user_exists,
                "users_count": users_count,
                "supabase_available": hasattr(app, 'supabase_client'),
                "database_connection": "working"
            })
        except Exception as e:
            app.logger.error(f"Auth test failed: {str(e)}")
            import traceback
            tb = traceback.format_exc()
            return jsonify({
                "status": "error",
                "message": "Auth test failed",
                "error": str(e),
                "traceback": tb
            }), 500
    
    @app.route('/api/debug/supabase', methods=['GET'])
    def debug_supabase():
        """Debug endpoint to check Supabase configuration."""
        from .utils.supabase_client import supabase
        
        # Get environment variables (show redacted values)
        supabase_url = os.environ.get('SUPABASE_URL', 'Not set')
        supabase_key = os.environ.get('SUPABASE_KEY', 'Not set')
        use_for_auth = os.environ.get('SUPABASE_USE_FOR_AUTH', 'False')
        use_for_db = os.environ.get('SUPABASE_USE_FOR_DB', 'False')
        
        # Redact sensitive information
        if supabase_url != 'Not set':
            supabase_url = f"{supabase_url[:10]}...{supabase_url[-5:]}" if len(supabase_url) > 15 else "Set but too short"
        if supabase_key != 'Not set':
            supabase_key = f"{supabase_key[:10]}...{supabase_key[-5:]}" if len(supabase_key) > 15 else "Set but too short"
            
        # Check if Supabase client is available
        is_available = supabase.is_available()
        
        # Test connection if available
        connection_test = "Not tested"
        if is_available:
            try:
                # Try a simple query as connection test
                test_query = supabase.client.table('users').select('count', count='exact').execute()
                connection_test = "Success"
            except Exception as e:
                connection_test = f"Failed: {str(e)}"
        
        return jsonify({
            "supabase_url": supabase_url,
            "supabase_key": supabase_key,
            "use_for_auth": use_for_auth,
            "use_for_db": use_for_db,
            "is_available": is_available,
            "connection_test": connection_test,
            "auth_mode": os.environ.get('SUPABASE_USE_FOR_AUTH', 'False').lower() == 'true',
            "python_version": os.environ.get('PYTHON_VERSION', 'Unknown')
        })
    
    @app.route('/api/debug/toggle-auth', methods=['POST'])
    def toggle_auth_mode():
        """Debug endpoint to toggle between JWT and Supabase auth for testing."""
        try:
            # Get current mode
            from .utils.auth_adapter import use_supabase_auth
            current_mode = 'Supabase' if use_supabase_auth else 'JWT'
            
            # Toggle the environment variable (in-memory only, won't persist after restart)
            new_mode = 'JWT' if use_supabase_auth else 'Supabase'
            os.environ['SUPABASE_USE_FOR_AUTH'] = 'False' if use_supabase_auth else 'True'
            
            # Update the module variable (this only works within the request context)
            # For a complete switch, the app needs to restart
            return jsonify({
                "message": f"Auth mode changed from {current_mode} to {new_mode}",
                "note": "This change is temporary and will reset on server restart. To make it permanent, update the environment variable in Digital Ocean."
            })
        except Exception as e:
            app.logger.error(f"Error toggling auth mode: {str(e)}")
            return jsonify({
                "error": "Failed to toggle auth mode",
                "details": str(e)
            }), 500
    
    # Register blueprints
    from .api.auth import auth_bp
    from .api.parts import parts_bp
    from .api.journals import journals_bp
    from .api.relationships import relationships_bp
    from .api.systems import systems_bp
    from .api.conversations import guided_sessions_bp
    from .api.billing import billing_bp
    
    app.register_blueprint(auth_bp, url_prefix='/api')
    app.register_blueprint(guided_sessions_bp, url_prefix='/api')
    app.register_blueprint(parts_bp, url_prefix='/api')
    app.register_blueprint(journals_bp, url_prefix='/api')
    app.register_blueprint(relationships_bp, url_prefix='/api')
    app.register_blueprint(systems_bp, url_prefix='/api')
    app.register_blueprint(billing_bp, url_prefix='/api')
    
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
    
    # Add a debug route to list all registered routes
    @app.route('/api/debug/routes', methods=['GET'])
    def list_routes():
        """List all registered routes for debugging."""
        routes = []
        for rule in app.url_map.iter_rules():
            routes.append({
                'endpoint': rule.endpoint,
                'methods': list(rule.methods),
                'rule': str(rule)
            })
        return jsonify(routes)
    
    # Shell context for Flask CLI
    @app.shell_context_processor
    def ctx():
        return {'app': app, 'db': db}
        
    return app 