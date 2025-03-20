import logging
import os
import sys
from typing import Optional


def configure_logging(app_name: str = "backend", log_level: Optional[str] = None) -> logging.Logger:
    """
    Configure logging for the application
    
    Args:
        app_name: Name of the application for the logger
        log_level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
                  If None, will use environment variable LOG_LEVEL or default to INFO
    
    Returns:
        Configured logger instance
    """
    # Get log level from environment or use default
    if log_level is None:
        log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
    
    # Create logger
    logger = logging.getLogger(app_name)
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