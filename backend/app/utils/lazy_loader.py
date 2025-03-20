import functools
import logging

def lazy_load(func):
    """Decorator to lazy-load heavy resources only when first used."""
    loaded_resource = None
    
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        nonlocal loaded_resource
        if loaded_resource is None:
            try:
                logging.info(f"Lazy-loading resource via {func.__name__}")
                loaded_resource = func(*args, **kwargs)
                logging.info(f"Successfully loaded resource via {func.__name__}")
            except Exception as e:
                logging.error(f"Failed to load resource via {func.__name__}: {str(e)}")
                raise
        return loaded_resource
    
    return wrapper