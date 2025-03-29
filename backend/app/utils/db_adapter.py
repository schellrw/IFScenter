"""
Database adapter module.
Provides a unified interface for database operations with both
SQLAlchemy and Supabase backends.
"""
import os
import logging
import json
from typing import Dict, List, Any, Optional, Union
from uuid import UUID

from flask_sqlalchemy import SQLAlchemy
from backend.app.utils.supabase_client import supabase

logger = logging.getLogger(__name__)

# Configuration
use_supabase_db = os.environ.get('SUPABASE_USE_FOR_DB', 'False').lower() == 'true'

class DBAdapter:
    """Database adapter class for unified access to SQLAlchemy and Supabase."""
    
    def __init__(self, sqlalchemy_db: SQLAlchemy):
        """Initialize the database adapter.
        
        Args:
            sqlalchemy_db: SQLAlchemy database instance for traditional access
        """
        self.db = sqlalchemy_db
        self.session = sqlalchemy_db.session if sqlalchemy_db else None
        self.using_supabase = use_supabase_db
        
        if self.using_supabase and not supabase.is_available():
            logger.error("Supabase client not available but SUPABASE_USE_FOR_DB is True")
            raise ValueError("Supabase client not available")
    
    def _model_to_dict(self, model) -> Dict[str, Any]:
        """Convert SQLAlchemy model to dictionary.
        
        Args:
            model: SQLAlchemy model instance
            
        Returns:
            Dictionary representation of the model
        """
        if hasattr(model, 'to_dict'):
            return model.to_dict()
        
        # Fall back to manual conversion
        result = {}
        for column in model.__table__.columns:
            value = getattr(model, column.name)
            if isinstance(value, UUID):
                value = str(value)
            result[column.name] = value
        return result
    
    def _get_auth_headers(self) -> Dict[str, str]:
        """Get authentication headers for Supabase requests.
        
        Returns:
            Dict[str, str]: Headers dictionary with authentication if available
        """
        headers = {}
        
        if self.using_supabase:
            # Get the user token from Flask's g object (if available)
            from flask import g
            user_token = getattr(g, 'user_token', None)
            
            if user_token:
                logger.debug(f"Using user token for Supabase request: {user_token[:10]}...")
                headers['Authorization'] = f'Bearer {user_token}'
            else:
                logger.warning("No user token available for Supabase request")
                
        return headers
    
    def get_by_id(self, table: str, model_class, id_value: str) -> Optional[Dict[str, Any]]:
        """Get a record by ID."""
        try:
            if self.using_supabase:
                # Get authentication headers
                headers = self._get_auth_headers()
                
                # Make a direct HTTP request to the Supabase REST API
                import requests
                
                # Get the Supabase URL and key from the client
                supabase_url = supabase.client.rest_url
                api_key = supabase.client.supabase_key
                
                # Build the URL for the specific record
                url = f"{supabase_url}/{table}?id=eq.{id_value}"
                
                # Combine our auth headers with the required Supabase headers
                request_headers = {
                    'apikey': api_key,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
                # Add the Authorization header if we have it
                if headers and 'Authorization' in headers:
                    request_headers['Authorization'] = headers['Authorization']
                
                # Make the GET request
                response = requests.get(url, headers=request_headers)
                
                if response.status_code >= 200 and response.status_code < 300:
                    # Success
                    response_data = response.json()
                    if response_data and len(response_data) > 0:
                        return response_data[0]
                    return None
                
                # Log error details
                logger.error(f"Supabase REST API error: {response.status_code} - {response.text}")
                return None
            else:
                record = model_class.query.get(id_value)
                if record:
                    return self._model_to_dict(record)
                return None
        except Exception as e:
            logger.error(f"Error getting record by ID from {table}: {e}")
            return None
    
    def get_all(self, table: str, model_class, filter_dict: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Get all records, optionally filtered."""
        try:
            if self.using_supabase:
                # Get authentication headers
                headers = self._get_auth_headers()
                
                # Make a direct HTTP request to the Supabase REST API
                import requests
                
                # Get the Supabase URL and key from the client
                supabase_url = supabase.client.rest_url
                api_key = supabase.client.supabase_key
                
                # Build the URL with filters if provided
                url = f"{supabase_url}/{table}"
                params = {}
                
                # Apply filters if provided
                if filter_dict:
                    for key, value in filter_dict.items():
                        params[key] = f"eq.{value}"
                
                # Combine our auth headers with the required Supabase headers
                request_headers = {
                    'apikey': api_key,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
                # Add the Authorization header if we have it
                if headers and 'Authorization' in headers:
                    request_headers['Authorization'] = headers['Authorization']
                
                # Make the GET request
                response = requests.get(url, headers=request_headers, params=params)
                
                if response.status_code >= 200 and response.status_code < 300:
                    # Success
                    return response.json()
                
                # Log error details
                logger.error(f"Supabase REST API error: {response.status_code} - {response.text}")
                return []
            else:
                query = model_class.query
                
                # Apply filters
                if filter_dict:
                    for key, value in filter_dict.items():
                        query = query.filter(getattr(model_class, key) == value)
                
                records = query.all()
                return [self._model_to_dict(record) for record in records]
        except Exception as e:
            logger.error(f"Error getting records from {table}: {e}")
            return []
    
    def create(self, table: str, model_class, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Create a new record.
        
        Args:
            table: Table name (for Supabase)
            model_class: SQLAlchemy model class (for SQLAlchemy)
            data: Record data
            
        Returns:
            Created record as dictionary or None if failed
        """
        try:
            if self.using_supabase:
                # Pre-process data to handle non-JSON serializable types like UUID and list (for vectors)
                processed_data = {}
                for key, value in data.items():
                    if isinstance(value, UUID):
                        processed_data[key] = str(value)
                    elif isinstance(value, list):
                        # Convert list (likely embedding vector) to string representation
                        # Supabase might expect vectors as strings like '[1,2,3]'
                        processed_data[key] = str(value)
                    else:
                        processed_data[key] = value
                
                # Get authentication headers
                headers = self._get_auth_headers()
                
                # Make a direct HTTP request to the Supabase REST API instead
                import requests
                
                # Get the Supabase URL and key from the client
                supabase_url = supabase.client.rest_url
                api_key = supabase.client.supabase_key
                
                # Build the URL for the table
                url = f"{supabase_url}/{table}"
                
                # Combine our auth headers with the required Supabase headers
                request_headers = {
                    'apikey': api_key,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                }
                # Add the Authorization header if we have it
                if headers and 'Authorization' in headers:
                    request_headers['Authorization'] = headers['Authorization']
                
                # Make the POST request
                logger.debug(f"Supabase Create Payload for {table}: {json.dumps(processed_data)[:200]}...") # Log payload
                response = requests.post(url, json=processed_data, headers=request_headers)
                
                if response.status_code >= 200 and response.status_code < 300:
                    # Success
                    response_data = response.json()
                    if response_data and len(response_data) > 0:
                        return response_data[0]
                    else:
                         # Handle case where Prefer: representation returns empty list on success (e.g., 204 No Content)
                         logger.warning(f"Supabase create for {table} returned success status {response.status_code} but no data.")
                         # We might not have the ID here, return the processed data as a fallback
                         return processed_data
                
                # Log error details
                logger.error(f"Supabase REST API error creating record in {table}: {response.status_code} - {response.text}")
                return None
            else:
                record = model_class(**data)
                self.db.session.add(record)
                self.db.session.commit()
                return self._model_to_dict(record)
        except Exception as e:
            logger.error(f"Error creating record in {table}: {e}")
            # Log more details about the error
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            
            if not self.using_supabase:
                self.db.session.rollback()
            return None
    
    def update(self, table: str, model_class, id_value: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update a record."""
        try:
            if self.using_supabase:
                # Get authentication headers
                headers = self._get_auth_headers()
                
                # Make a direct HTTP request to the Supabase REST API
                import requests
                
                # Get the Supabase URL and key from the client
                supabase_url = supabase.client.rest_url
                api_key = supabase.client.supabase_key
                
                # Build the URL for the specific record
                url = f"{supabase_url}/{table}?id=eq.{id_value}"
                
                # Combine our auth headers with the required Supabase headers
                request_headers = {
                    'apikey': api_key,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Prefer': 'return=representation'
                }
                # Add the Authorization header if we have it
                if headers and 'Authorization' in headers:
                    request_headers['Authorization'] = headers['Authorization']
                
                # Make the PATCH request
                response = requests.patch(url, json=data, headers=request_headers)
                
                if response.status_code >= 200 and response.status_code < 300:
                    # Success
                    response_data = response.json()
                    if response_data and len(response_data) > 0:
                        return response_data[0]
                    return None
                
                # Log error details
                logger.error(f"Supabase REST API error: {response.status_code} - {response.text}")
                return None
            else:
                record = model_class.query.get(id_value)
                if not record:
                    return None
                
                for key, value in data.items():
                    setattr(record, key, value)
                
                self.db.session.commit()
                return self._model_to_dict(record)
        except Exception as e:
            logger.error(f"Error updating record in {table}: {e}")
            if not self.using_supabase:
                self.db.session.rollback()
            return None
    
    def delete(self, table: str, model_class, id_value: str) -> bool:
        """Delete a record."""
        try:
            if self.using_supabase:
                # Get authentication headers
                headers = self._get_auth_headers()
                
                # Make a direct HTTP request to the Supabase REST API
                import requests
                
                # Get the Supabase URL and key from the client
                supabase_url = supabase.client.rest_url
                api_key = supabase.client.supabase_key
                
                # Build the URL for the specific record
                url = f"{supabase_url}/{table}?id=eq.{id_value}"
                
                # Combine our auth headers with the required Supabase headers
                request_headers = {
                    'apikey': api_key,
                    'Content-Type': 'application/json'
                }
                # Add the Authorization header if we have it
                if headers and 'Authorization' in headers:
                    request_headers['Authorization'] = headers['Authorization']
                
                # Make the DELETE request
                response = requests.delete(url, headers=request_headers)
                
                return response.status_code >= 200 and response.status_code < 300
            else:
                record = model_class.query.get(id_value)
                if not record:
                    return False
                
                self.db.session.delete(record)
                self.db.session.commit()
                return True
        except Exception as e:
            logger.error(f"Error deleting record from {table}: {e}")
            if not self.using_supabase:
                self.db.session.rollback()
            return False
    
    def query_vector_similarity(self, table: str, model_class, vector_column: str, 
                               query_vector: List[float], limit: int = 5) -> List[Dict[str, Any]]:
        """Query for vector similarity using pgvector."""
        try:
            if self.using_supabase:
                # Get authentication headers
                headers = self._get_auth_headers()
                
                # Make a direct HTTP request to the Supabase RPC endpoint
                import requests
                
                # Get the Supabase URL and key from the client
                supabase_url = supabase.client.rest_url
                api_key = supabase.client.supabase_key
                
                # Build the URL for the RPC endpoint
                url = f"{supabase_url.replace('/rest/v1', '/rest/v1/rpc')}/vector_search"
                
                # Prepare the RPC parameters
                rpc_params = {
                    'table_name': table,
                    'vector_column': vector_column,
                    'query_vector': query_vector,
                    'limit_results': limit
                }
                
                # Combine our auth headers with the required Supabase headers
                request_headers = {
                    'apikey': api_key,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
                # Add the Authorization header if we have it
                if headers and 'Authorization' in headers:
                    request_headers['Authorization'] = headers['Authorization']
                
                # Make the RPC POST request
                response = requests.post(url, json=rpc_params, headers=request_headers)
                
                if response.status_code >= 200 and response.status_code < 300:
                    # Success
                    return response.json()
                
                # Log error details
                logger.error(f"Supabase RPC error: {response.status_code} - {response.text}")
                return []
            else:
                # SQLAlchemy with pgvector extension - unchanged
                from sqlalchemy import text
                
                query = text(f"""
                    SELECT *, {vector_column} <-> :query_vector AS distance
                    FROM {table}
                    WHERE {vector_column} IS NOT NULL
                    ORDER BY {vector_column} <-> :query_vector
                    LIMIT :limit
                """)
                
                result = self.db.session.execute(
                    query, 
                    {"query_vector": query_vector, "limit": limit}
                )
                
                return [dict(row) for row in result]
        except Exception as e:
            logger.error(f"Error performing vector similarity search: {e}")
            return []
    
    def count(self, table: str, model_class, filter_dict: Optional[Dict[str, Any]] = None) -> int:
        """Count records, optionally filtered."""
        try:
            if self.using_supabase:
                # Get authentication headers
                headers = self._get_auth_headers()
                
                # Make a direct HTTP request to the Supabase REST API
                import requests
                
                # Get the Supabase URL and key from the client
                supabase_url = supabase.client.rest_url
                api_key = supabase.client.supabase_key
                
                # Build the URL with filters if provided
                url = f"{supabase_url}/{table}"
                params = {}
                
                # Apply filters if provided
                if filter_dict:
                    for key, value in filter_dict.items():
                        params[key] = f"eq.{value}"
                
                # Combine our auth headers with the required Supabase headers
                request_headers = {
                    'apikey': api_key,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Prefer': 'count=exact'
                }
                # Add the Authorization header if we have it
                if headers and 'Authorization' in headers:
                    request_headers['Authorization'] = headers['Authorization']
                
                # Make a HEAD request to get the count
                response = requests.head(url, headers=request_headers, params=params)
                
                if response.status_code >= 200 and response.status_code < 300:
                    # Get count from headers
                    content_range = response.headers.get('content-range', '')
                    if content_range:
                        try:
                            # Format is like "0-9/42" where 42 is the total count
                            total_count = int(content_range.split('/')[1])
                            return total_count
                        except (IndexError, ValueError):
                            logger.error(f"Failed to parse content-range header: {content_range}")
                            return 0
                    
                    # Fallback to getting all records and counting them
                    response = requests.get(url, headers=request_headers, params=params)
                    if response.status_code >= 200 and response.status_code < 300:
                        return len(response.json())
                
                # Log error details
                logger.error(f"Supabase REST API count error: {response.status_code}")
                return 0
            else:
                from sqlalchemy import func
                
                # Explicit column reference for count
                query = self.db.session.query(func.count(model_class.__table__.columns.id))
                
                # Apply filters
                if filter_dict:
                    for key, value in filter_dict.items():
                        query = query.filter(getattr(model_class, key) == value)
                
                return query.scalar() or 0
        except Exception as e:
            logger.error(f"Error counting records in {table}: {e}")
            return 0

# Initialize adapter in the application context
def init_db_adapter(app, db) -> DBAdapter:
    """Initialize the database adapter in Flask application context.
    
    Args:
        app: Flask application
        db: SQLAlchemy database instance
        
    Returns:
        DBAdapter instance
    """
    adapter = DBAdapter(db)
    app.db_adapter = adapter
    return adapter 