#!/usr/bin/env python
"""
Development server script for running the IFS Assistant application.
Supports different environments through environment files:
- .env, .env.development, .env.staging, .env.production

Usage: 
  FLASK_ENV=development python app.py  # Development mode with local PostgreSQL + pgvector
  FLASK_ENV=staging python app.py      # Staging mode with Supabase
"""
import os
import sys
from backend.app.config.env_manager import load_environment
from backend.app import create_app

# Load environment variables based on FLASK_ENV
env_vars = load_environment()
flask_env = os.environ.get('FLASK_ENV', 'development')

if __name__ == "__main__":
    # Create the Flask application
    app = create_app()
    port = int(os.environ.get("PORT", 5000))
    
    # Print environment info
    print(f"Starting IFS Assistant on http://localhost:{port}")
    print(f"Environment: {flask_env}")
    
    # Check database configuration
    if 'SUPABASE_URL' in os.environ and os.environ.get('SUPABASE_USE_FOR_DB') == 'True':
        print(f"Using Supabase for database: {os.environ.get('SUPABASE_URL')}")
    elif os.environ.get('DATABASE_URL', '').startswith('postgresql://'):
        print(f"Using database: {os.environ.get('DATABASE_URL').split('@')[0]}@...")
    else:
        print("Error: No valid database configuration found.")
        print("Please update your environment file with either:")
        print("  - DATABASE_URL for PostgreSQL")
        print("  - SUPABASE_URL and SUPABASE_USE_FOR_DB for Supabase")
        sys.exit(1)
        
    # Run the Flask application
    debug = os.environ.get('DEBUG', 'False').lower() == 'true'
    app.run(host=os.environ.get('HOST', '0.0.0.0'), port=port, debug=debug) 