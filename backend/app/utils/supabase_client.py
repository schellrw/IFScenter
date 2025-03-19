"""
Supabase client utility.
This module provides a client for connecting to Supabase services.
"""
import os
from typing import Optional, Dict, Any
import logging
from supabase import create_client, Client

logger = logging.getLogger(__name__)

class SupabaseManager:
    """Singleton class for managing Supabase client instances."""
    
    _instance = None
    _client: Optional[Client] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(SupabaseManager, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if not self._initialized:
            self._initialize_client()
            self._initialized = True
    
    def _initialize_client(self):
        """Initialize the Supabase client."""
        supabase_url = os.environ.get('SUPABASE_URL')
        supabase_key = os.environ.get('SUPABASE_KEY')
        
        if not supabase_url or not supabase_key:
            logger.warning("Supabase configuration not found in environment variables.")
            return
        
        try:
            logger.info(f"Initializing Supabase client with URL: {supabase_url}")
            self._client = create_client(supabase_url, supabase_key)
            logger.info("Supabase client initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Supabase client: {e}")
            raise
    
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

# Create a singleton instance
supabase = SupabaseManager() 