"""
Script to set up pgvector extension in PostgreSQL.

This script should be run manually before migrations if you're using PostgreSQL
and want to enable vector operations with pgvector.
"""
import os
import sys
import psycopg2
from urllib.parse import urlparse
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def setup_pgvector():
    """Set up the pgvector extension in PostgreSQL."""
    # Get database URL from environment variable
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        logger.error("DATABASE_URL environment variable not set.")
        sys.exit(1)
    
    # Parse database URL
    parsed_url = urlparse(db_url)
    dbname = parsed_url.path[1:]  # Remove leading slash
    user = parsed_url.username
    password = parsed_url.password
    host = parsed_url.hostname
    port = parsed_url.port or 5432
    
    # Connect to PostgreSQL
    try:
        logger.info(f"Connecting to PostgreSQL database {dbname} on {host}:{port}")
        conn = psycopg2.connect(
            dbname=dbname,
            user=user,
            password=password,
            host=host,
            port=port
        )
        conn.autocommit = True
        cursor = conn.cursor()
        
        # Create the extension
        logger.info("Creating pgvector extension...")
        cursor.execute("CREATE EXTENSION IF NOT EXISTS vector;")
        
        # Verify that the extension was created
        cursor.execute("SELECT extname FROM pg_extension WHERE extname = 'vector';")
        result = cursor.fetchone()
        
        if result and result[0] == 'vector':
            logger.info("pgvector extension successfully installed!")
        else:
            logger.error("Failed to install pgvector extension.")
            sys.exit(1)
            
        # Close connection
        cursor.close()
        conn.close()
        
    except psycopg2.Error as e:
        logger.error(f"Error setting up pgvector extension: {e}")
        sys.exit(1)

if __name__ == "__main__":
    logger.info("Setting up pgvector extension...")
    setup_pgvector()
    logger.info("Done!") 