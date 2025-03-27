"""
Standalone test script for Supabase authentication.
This script tests Supabase authentication by attempting to log in with provided credentials.
"""
import os
import sys
import logging
from dotenv import load_dotenv

# Setup logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv(".env.shared")
load_dotenv(".env", override=True)

# Display environment configuration
print("=== Supabase Authentication Test ===")
print(f"SUPABASE_URL: {os.environ.get('SUPABASE_URL', 'Not set')}")
print(f"SUPABASE_KEY: {'Set (redacted)' if os.environ.get('SUPABASE_KEY') else 'Not set'}")
print(f"SUPABASE_USE_FOR_AUTH: {os.environ.get('SUPABASE_USE_FOR_AUTH', 'Not set')}")

# Import Supabase
try:
    from supabase import create_client, Client
    
    # Initialize Supabase client
    supabase_url = os.environ.get('SUPABASE_URL')
    supabase_key = os.environ.get('SUPABASE_KEY')
    
    if not supabase_url or not supabase_key:
        print("Error: Supabase URL or key not set in environment variables")
        sys.exit(1)
    
    print("\n=== Initializing Supabase Client ===")
    supabase = create_client(supabase_url, supabase_key)
    print("Supabase client initialized successfully")
    
    # Test connection by getting session
    try:
        print("\n=== Testing Connection ===")
        session = supabase.auth.get_session()
        print("Connection successful")
        
        # Try to sign in with test credentials
        if len(sys.argv) >= 3:
            email = sys.argv[1]
            password = sys.argv[2]
            
            print(f"\n=== Testing Login with {email} ===")
            result = supabase.auth.sign_in_with_password({
                "email": email,
                "password": password
            })
            
            if result.user:
                print("Login successful!")
                print(f"User ID: {result.user.id}")
                print(f"Email: {result.user.email}")
                print(f"Access Token: {result.session.access_token[:20]}...")
            else:
                print("Login failed: No user returned")
        else:
            print("\nTo test login, run: python test_supabase_auth.py <email> <password>")
    
    except Exception as e:
        print(f"Connection or login test failed: {str(e)}")
    
except ImportError:
    print("Error: Supabase Python package not installed")
    print("Run: pip install supabase")
except Exception as e:
    print(f"Error initializing Supabase: {str(e)}") 