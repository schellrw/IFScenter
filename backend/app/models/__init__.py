"""
Models package that defines the database schema.
"""
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

# Initialize SQLAlchemy
db = SQLAlchemy()
migrate = Migrate()

# Import models to ensure they are registered by SQLAlchemy
from .user import User
from .system import IFSSystem
from .part import Part
from .relationship import Relationship
from .journal import Journal
from .conversation import GuidedSession, SessionMessage, PartConversation, ConversationMessage, PartPersonalityVector

__all__ = ['db', 'migrate', 'User', 'Part', 'Relationship', 'Journal', 'IFSSystem',
           'GuidedSession', 'SessionMessage', 'PartConversation', 'ConversationMessage', 'PartPersonalityVector'] 