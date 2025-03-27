"""
Supabase client utility.
This module provides a client for connecting to Supabase services.
"""
import os
from typing import Optional, Dict, Any
import logging
from supabase import create_client, Client
from contextlib import contextmanager

logger = logging.getLogger(__name__)

# First, monkey patch the SyncClient class in gotrue to not use the proxy parameter
try:
    from httpx import Client as HttpxClient
    from gotrue._sync.gotrue_base_api import SyncClient
    
    # Store the original init
    original_init = SyncClient.__init__
    
    # Define a new init that filters out the proxy parameter
    def new_init(self, *args, **kwargs):
        # Remove proxy if it exists
        if 'proxy' in kwargs:
            del kwargs['proxy']
        return original_init(self, *args, **kwargs)
    
    # Replace the original init with our new one
    SyncClient.__init__ = new_init
    
except ImportError:
    logging.warning("Could not patch gotrue SyncClient, Supabase might not work")

class SupabaseManager:
    """Singleton class for managing Supabase client instances."""
    
    _instance = None
    _client: Optional[Client] = None
    
    def __new__(cls):
        if cls._instance is None:
            instance = super(SupabaseManager, cls).__new__(cls)
            instance._initialized = False
            instance._client = None
            cls._instance = instance
        return cls._instance
    
    def __init__(self):
        if not self._initialized:
            self._initialize_client()
            self._initialized = True
    
    def _initialize_client(self):
        """Initialize the Supabase client."""
        try:
            supabase_url = os.getenv('SUPABASE_URL')
            supabase_key = os.getenv('SUPABASE_KEY')
            
            logging.info(f"Initializing Supabase client with URL: {supabase_url[:10] if supabase_url else 'None'}... and key: {supabase_key[:10] if supabase_key else 'None'}...")
            
            if not supabase_url or not supabase_key:
                logging.warning("Supabase URL or key not set. Supabase functionality will be limited.")
                return

            self._client = create_client(supabase_url, supabase_key)
            logging.info("Supabase client initialized successfully")
            
            # Test the connection by making a simple API call
            try:
                # Try simple query to test connection
                user_count = self._client.table('users').select('count', count='exact').execute()
                logging.info(f"Supabase connection test successful. User count: {user_count.count if hasattr(user_count, 'count') else 'unknown'}")
            except Exception as test_error:
                logging.error(f"Supabase connection test failed: {str(test_error)}")
                # Don't set client to None - this would break the fallback mechanism
                # Let auth_adapter handle the fallback
                
        except Exception as e:
            logging.error(f"Failed to initialize Supabase client: {str(e)}")
            self._client = None
    
    @property
    def client(self) -> Optional[Client]:
        """Get the Supabase client instance.
        
        Returns:
            Optional[Client]: The Supabase client, or None if not initialized.
        """
        if not self._client:
            self._initialize_client()
        return self._client
    
    def is_available(self) -> bool:
        """Check if Supabase is available and configured.
        
        Returns:
            bool: True if Supabase is available and configured, False otherwise.
        """
        return self._client is not None
    
    def get_table(self, table_name: str):
        """Get a table reference for queries.
        
        Args:
            table_name: The name of the table to query.
            
        Returns:
            Table reference for further operations.
        """
        if not self._client:
            raise ValueError("Supabase client not initialized")
        return self._client.table(table_name)
    
    def execute_sql(self, query: str, variables: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Execute a raw SQL query via Supabase.
        
        Args:
            query: SQL query string.
            variables: Optional dictionary of variable values.
            
        Returns:
            Dict: Query result.
        """
        if not self._client:
            raise ValueError("Supabase client not initialized")
        
        # Note: Supabase Python client doesn't directly support raw SQL
        # This would normally use the REST API or extend the client
        # For now, we'll raise an exception as this needs implementation
        raise NotImplementedError(
            "Direct SQL execution not yet implemented in the Python client. "
            "Consider using the table() method for queries."
        )

# Initialize the singleton instance
try:
    supabase = SupabaseManager()
except Exception as e:
    logging.error(f"Could not initialize Supabase: {str(e)}")
    # Create a fallback/dummy implementation if needed
    class DummySupabase:
        def __getattr__(self, name):
            def dummy_method(*args, **kwargs):
                logging.warning(f"Supabase method {name} called but Supabase is not available")
                return None
            return dummy_method 