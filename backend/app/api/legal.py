import os
from flask import Blueprint, jsonify, current_app

legal_bp = Blueprint('legal', __name__)

def read_markdown_file(filename):
    """Helper function to read a markdown file using current_app.root_path."""
    
    # Log filename type for extreme debugging
    current_app.logger.debug(f"Filename received: '{filename}', Type: {type(filename)}")
    
    root_path = current_app.root_path
    if not root_path:
        current_app.logger.error("Flask root_path is not configured.")
        return None
        
    current_app.logger.debug(f"Value of current_app.root_path: {root_path}")

    # Construct path from root_path -> static -> legal -> filename
    dir_path = os.path.join(root_path, 'static', 'legal')
    filepath = os.path.join(dir_path, filename)
    
    current_app.logger.debug(f"Attempting to read legal doc from root_path. Dir: {dir_path}, File: {filepath}")
    try:
        current_app.logger.info(f"Attempting to open: {filepath}")
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        current_app.logger.debug(f"Successfully read: {filepath}")
        return content
    except FileNotFoundError:
        current_app.logger.error(f"FileNotFoundError caught when trying to open: {filepath}")
        try:
             if os.path.isdir(dir_path):
                 files_in_dir = os.listdir(dir_path)
                 current_app.logger.info(f"Directory exists. Files in {dir_path}: {files_in_dir}")
             else:
                 current_app.logger.error(f"Directory does not exist: {dir_path}")
        except Exception as list_e:
             current_app.logger.error(f"Could not list files in {dir_path}: {list_e}")
        return None
    except Exception as e:
        current_app.logger.error(f"Error reading legal document {filepath}: {e}")
        return None

@legal_bp.route('/legal/privacy-policy', methods=['GET'])
def get_privacy_policy():
    """Endpoint to get the privacy policy content."""
    content = read_markdown_file('privacy-policy.md')
    if content is not None:
        return jsonify({"content": content})
    else:
        return jsonify({"error": "Privacy Policy not found"}), 404

@legal_bp.route('/legal/terms-of-service', methods=['GET'])
def get_terms_of_service():
    """Endpoint to get the terms of service content."""
    content = read_markdown_file('terms-of-service.md')
    if content is not None:
        return jsonify({"content": content})
    else:
        return jsonify({"error": "Terms of Service not found"}), 404 