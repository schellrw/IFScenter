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
        """Get a record by ID.
        
        Args:
            table: Table name (for Supabase)
            model_class: SQLAlchemy model class (for SQLAlchemy)
            id_value: ID value to look up
            
        Returns:
            Record as dictionary or None if not found
        """
        try:
            if self.using_supabase:
                # Get authentication headers
                headers = self._get_auth_headers()
                
                response = supabase.client.table(table).select('*').eq('id', id_value).execute(headers=headers)
                if response.data and len(response.data) > 0:
                    return response.data[0]
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
        """Get all records, optionally filtered.
        
        Args:
            table: Table name (for Supabase)
            model_class: SQLAlchemy model class (for SQLAlchemy)
            filter_dict: Optional dictionary of filter conditions
            
        Returns:
            List of records as dictionaries
        """
        try:
            if self.using_supabase:
                # Get authentication headers
                headers = self._get_auth_headers()
                
                query = supabase.client.table(table).select('*')
                
                # Apply filters
                if filter_dict:
                    for key, value in filter_dict.items():
                        query = query.eq(key, value)
                
                response = query.execute(headers=headers)
                return response.data
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
                # Pre-process data for Supabase - ensure JSONB fields are properly formatted
                processed_data = {}
                for key, value in data.items():
                    # Convert any list fields to properly formatted JSON
                    if isinstance(value, list):
                        logger.debug(f"Preprocessing list field {key} for Supabase")
                        processed_data[key] = value
                    else:
                        processed_data[key] = value
                
                logger.debug(f"Sending data to Supabase: {processed_data}")
                
                # Get authentication headers
                headers = self._get_auth_headers()
                
                # Move headers to execute() instead of insert()
                response = supabase.client.table(table).insert(processed_data).execute(headers=headers)
                
                if not response:
                    logger.error(f"Supabase insert returned None response")
                    return None
                    
                logger.debug(f"Supabase response: {response}")
                
                if hasattr(response, 'data') and response.data and len(response.data) > 0:
                    return response.data[0]
                else:
                    logger.error(f"Supabase insert returned empty data: {response}")
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
        """Update a record.
        
        Args:
            table: Table name (for Supabase)
            model_class: SQLAlchemy model class (for SQLAlchemy)
            id_value: ID of the record to update
            data: Updated record data
            
        Returns:
            Updated record as dictionary or None if failed
        """
        try:
            if self.using_supabase:
                # Get authentication headers
                headers = self._get_auth_headers()
                
                response = supabase.client.table(table).update(data).eq('id', id_value).execute(headers=headers)
                if response.data and len(response.data) > 0:
                    return response.data[0]
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
        """Delete a record.
        
        Args:
            table: Table name (for Supabase)
            model_class: SQLAlchemy model class (for SQLAlchemy)
            id_value: ID of the record to delete
            
        Returns:
            True if successful, False otherwise
        """
        try:
            if self.using_supabase:
                # Get authentication headers
                headers = self._get_auth_headers()
                
                response = supabase.client.table(table).delete().eq('id', id_value).execute(headers=headers)
                return len(response.data) > 0
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
        """Query for vector similarity using pgvector.
        
        Args:
            table: Table name (for Supabase)
            model_class: SQLAlchemy model class (for SQLAlchemy)
            vector_column: Name of the vector column
            query_vector: Query vector as list of floats
            limit: Maximum number of results
            
        Returns:
            List of records as dictionaries, ordered by similarity
        """
        try:
            if self.using_supabase:
                # Get authentication headers
                headers = self._get_auth_headers()
                
                # Supabase supports pgvector via Functions/RPC
                # This is a simplified example; RPC endpoint needs to be created in Supabase
                try:
                    response = supabase.client.rpc(
                        'vector_search',
                        {
                            'table_name': table,
                            'vector_column': vector_column,
                            'query_vector': query_vector,
                            'limit_results': limit
                        }
                    ).execute(headers=headers)
                    return response.data
                except Exception as e:
                    logger.error(f"Supabase vector search error: {e}")
                    return []
            else:
                # SQLAlchemy with pgvector extension
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
        """Count records, optionally filtered.
        
        Args:
            table: Table name (for Supabase)
            model_class: SQLAlchemy model class (for SQLAlchemy)
            filter_dict: Optional dictionary of filter conditions
            
        Returns:
            Count of matching records
        """
        try:
            if self.using_supabase:
                # Get authentication headers
                headers = self._get_auth_headers()
                
                query = supabase.client.table(table).select('id', count='exact')
                
                # Apply filters
                if filter_dict:
                    for key, value in filter_dict.items():
                        query = query.eq(key, value)
                
                response = query.execute(headers=headers)
                return response.count if hasattr(response, 'count') else len(response.data)
            else:
                from sqlalchemy import func
                
                # Use model_class.__table__.columns.id instead of model_class.id
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