"""
Models for guided IFS sessions, messages, and related vector embeddings.
Includes deprecated models for old part conversations.
"""
import datetime
from uuid import uuid4
from typing import Dict, Any, List, Optional

from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Integer, func, CheckConstraint
from sqlalchemy.sql import func as sql_func
from sqlalchemy.dialects.postgresql import UUID, ARRAY, FLOAT, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.ext.mutable import MutableList

# Import pgvector extension types
from pgvector.sqlalchemy import Vector

from . import db

# --- New Models for Guided Sessions ---

class GuidedSession(db.Model):
    """Model representing a guided IFS exploration session."""
    __tablename__ = 'guided_sessions'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False) # Assuming direct user link, adjust if needed
    system_id = Column(UUID(as_uuid=True), ForeignKey('ifs_systems.id', ondelete='CASCADE'), nullable=False)
    title = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    topic = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=sql_func.now())
    updated_at = Column(DateTime(timezone=True), server_default=sql_func.now(), onupdate=sql_func.now())
    status = Column(String, default='active') # e.g., 'active', 'archived'
    current_focus_part_id = Column(UUID(as_uuid=True), ForeignKey('parts.id', ondelete='SET NULL'), nullable=True)

    # Relationships
    # Link to User (adjust if user model is different or relationship defined elsewhere)
    # user = relationship('User') # Example if User model exists
    system = relationship('IFSSystem') # Assuming IFSSystem model exists
    current_focus_part = relationship('Part') # Assuming Part model exists

    messages = relationship('SessionMessage', back_populates='session',
                          cascade='all, delete-orphan', lazy='dynamic',
                          order_by='SessionMessage.timestamp')

    def to_dict(self) -> Dict[str, Any]:
        """Convert the guided session to a dictionary."""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "system_id": str(self.system_id),
            "title": self.title,
            "summary": self.summary,
            "topic": self.topic,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "status": self.status,
            "current_focus_part_id": str(self.current_focus_part_id) if self.current_focus_part_id else None
        }

class SessionMessage(db.Model):
    """Model representing a message within a guided session."""
    __tablename__ = 'session_messages'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey('guided_sessions.id', ondelete='CASCADE'), nullable=False)
    role = Column(String(50), nullable=False)  # 'user' or 'guide'
    content = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=sql_func.now())

    # Vector embedding for the message content
    embedding = Column(Vector(384), nullable=True) # Ensure dimension matches model

    # Relationships
    session = relationship('GuidedSession', back_populates='messages')

    # Add check constraint for role
    __table_args__ = (
        CheckConstraint(role.in_(['user', 'guide']), name='session_message_role_check'),
    )

    def to_dict(self) -> Dict[str, Any]:
        """Convert the session message to a dictionary."""
        return {
            "id": str(self.id),
            "session_id": str(self.session_id),
            "role": self.role,
            "content": self.content,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            # Embedding is usually not included in basic dict representation
        }

# --- Deprecated Models (Keep for reference or potential data migration) ---

class PartConversation(db.Model):
    """Model representing a conversation session with a part. (DEPRECATED)"""
    __tablename__ = 'part_conversations'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    system_id = Column(UUID(as_uuid=True), ForeignKey('ifs_systems.id', ondelete='CASCADE'), nullable=False) # Added FK for consistency
    title = Column(String(255), nullable=True)
    summary = Column(Text, nullable=True) # Added summary field
    created_at = Column(DateTime(timezone=True), server_default=sql_func.now()) # Corrected
    updated_at = Column(DateTime(timezone=True), server_default=sql_func.now(), onupdate=sql_func.now()) # Corrected
    status = Column(String, default='active') # Added status field

    # Relationships
    part_id = Column(UUID(as_uuid=True), ForeignKey('parts.id', ondelete='CASCADE'), nullable=False)
    part = relationship('Part') # Removed back_populates as Part model doesn't define it

    # Relationship to messages
    messages = relationship('ConversationMessage', back_populates='conversation',
                          cascade='all, delete-orphan', lazy='dynamic',
                          order_by='ConversationMessage.timestamp') # Changed alias

    def to_dict(self) -> Dict[str, Any]:
        """Convert the conversation to a dictionary."""
        return {
            "id": str(self.id),
            "system_id": str(self.system_id), # Added system_id
            "title": self.title,
            "summary": self.summary, # Added summary
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "part_id": str(self.part_id),
            "status": self.status # Added status
        }

class ConversationMessage(db.Model):
    """Model representing a message in a conversation. (DEPRECATED)"""
    __tablename__ = 'conversation_messages'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    role = Column(String(50), nullable=False)  # 'user' or 'part'/'assistant'
    content = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=sql_func.now()) # Corrected

    # Vector embedding for the message content
    embedding = Column(Vector(384), nullable=True)

    # Relationships
    conversation_id = Column(UUID(as_uuid=True),
                           ForeignKey('part_conversations.id', ondelete='CASCADE'),
                           nullable=False)
    conversation = relationship('PartConversation', back_populates='messages')

    def to_dict(self) -> Dict[str, Any]:
        """Convert the message to a dictionary."""
        return {
            "id": str(self.id),
            "role": self.role,
            "content": self.content,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "conversation_id": str(self.conversation_id)
        }


class PartPersonalityVector(db.Model):
    """Model for storing vector embeddings of part personalities. (DEPRECATED - Replaced by embedding on Part model)"""
    __tablename__ = 'part_personality_vectors'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    attribute = Column(String(100), nullable=False) # Renamed from aspect, increased length
    description = Column(Text, nullable=True) # Added description field
    embedding = Column(Vector(384), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=sql_func.now()) # Corrected
    updated_at = Column(DateTime(timezone=True), server_default=sql_func.now(), onupdate=sql_func.now()) # Corrected

    # Relationships
    part_id = Column(UUID(as_uuid=True), ForeignKey('parts.id', ondelete='CASCADE'), nullable=False)
    # part = relationship('Part') # Define relationship if needed, maybe back_populates='personality_vectors'

    def to_dict(self) -> Dict[str, Any]:
        """Convert the vector to a dictionary."""
        return {
            "id": str(self.id),
            "attribute": self.attribute, # Renamed
            "description": self.description, # Added
            "part_id": str(self.part_id),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        } 