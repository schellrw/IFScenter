import os
import sys
import logging
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Load environment variables from .env files
load_dotenv(".env")
load_dotenv(".env.shared")

print("=== Authentication System Debug ===")
print(f"Current working directory: {os.getcwd()}")
print("\n=== Environment Variables ===")
print(f"SUPABASE_URL: {os.environ.get('SUPABASE_URL', 'Not set')}")
print(f"SUPABASE_KEY: {'Set (redacted)' if os.environ.get('SUPABASE_KEY') else 'Not set'}")
print(f"SUPABASE_USE_FOR_AUTH: {os.environ.get('SUPABASE_USE_FOR_AUTH', 'Not set')}")
print(f"SUPABASE_USE_FOR_DB: {os.environ.get('SUPABASE_USE_FOR_DB', 'Not set')}")
print(f"DATABASE_URL: {'Set (redacted)' if os.environ.get('DATABASE_URL') else 'Not set'}")

try:
    # Use backend package pattern for imports
    import backend.app.utils.supabase_client as supabase_module
    from backend.app.utils.auth_adapter import use_supabase_auth, is_supabase_available, should_use_supabase
    
    # Get supabase instance 
    supabase = supabase_module.supabase
    
    print("\n=== Supabase Client Test ===")
    print(f"Supabase client available: {supabase.is_available()}")
    if supabase.is_available():
        print("Testing Supabase connection...")
        try:
            result = supabase.client.auth.get_session()
            print("Connected to Supabase Auth successfully!")
        except Exception as e:
            print(f"Supabase Auth error: {str(e)}")
    else:
        print("Supabase client not available!")
        
    print("\n=== Auth Mode Test ===")
    print(f"use_supabase_auth: {use_supabase_auth}")
    print(f"is_supabase_available(): {is_supabase_available()}")
    print(f"should_use_supabase: {should_use_supabase}")
    print(f"Actual auth mode: {'Supabase' if should_use_supabase else 'JWT'}")
    
except Exception as e:
    print(f"Error during testing: {str(e)}") 