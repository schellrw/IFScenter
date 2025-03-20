"""
Monkey patch for Flask-CORS to fix compatibility with Python 3.12.

This fixes the 'argument of type property is not iterable' error in flask_cors.core.probably_regex.
"""
import logging

logger = logging.getLogger(__name__)

def apply_patch():
    """Apply the monkey patch to Flask-CORS."""
    try:
        import flask_cors.core
        original_probably_regex = flask_cors.core.probably_regex

        def fixed_probably_regex(maybe_regex):
            """
            Fixed version of probably_regex that handles property objects.
            """
            if isinstance(maybe_regex, property):
                return False
            return original_probably_regex(maybe_regex)

        flask_cors.core.probably_regex = fixed_probably_regex
        logger.info("Successfully applied Flask-CORS patch for Python 3.12 compatibility")
    except ImportError:
        logger.warning("Could not patch Flask-CORS - package not imported yet")
    except Exception as e:
        logger.error(f"Error applying Flask-CORS patch: {e}") 