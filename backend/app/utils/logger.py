import logging
import os
import sys
from typing import Optional, Union
from flask import Flask


def configure_logging(app_name: Union[str, Flask] = "backend", log_level: Optional[str] = None) -> logging.Logger:
    """
    Configure logging for the application
    
    Args:
        app_name: Name of the application for the logger or Flask app instance
        log_level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
                  If None, will use environment variable LOG_LEVEL or default to INFO
    
    Returns:
        Configured logger instance
    """
    # Get log level from environment or use default
    if log_level is None:
        log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
    
    # Handle Flask app object
    if isinstance(app_name, Flask):
        logger_name = app_name.name
    else:
        logger_name = str(app_name)
    
    # Create logger
    logger = logging.getLogger(logger_name)
    logger.setLevel(getattr(logging, log_level))
    
    # Configure handler if not already configured
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    
    return logger 