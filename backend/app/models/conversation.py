"""
Models for part conversations and vector embeddings.
"""
import datetime
from uuid import uuid4
from typing import Dict, Any, List, Optional

from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Integer, func
from sqlalchemy.sql import func as sql_func
from sqlalchemy.dialects.postgresql import UUID, ARRAY, FLOAT, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.ext.mutable import MutableList

# Import pgvector extension types
from pgvector.sqlalchemy import Vector

from . import db

class PartConversation(db.Model):
    """Model representing a conversation session with a part."""
    __tablename__ = 'part_conversations'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    title = Column(String(255), nullable=True)
    summary = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    part_id = Column(UUID(as_uuid=True), ForeignKey('parts.id', ondelete='CASCADE'), nullable=False)
    part = relationship('Part', back_populates='conversations')
    
    # Relationship to messages
    messages = relationship('ConversationMessage', back_populates='conversation', 
                          cascade='all, delete-orphan', lazy='dynamic',
                          order_by='ConversationMessage.timestamp')
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert the conversation to a dictionary.
        
        Returns:
            Dictionary representation of the conversation.
        """
        return {
            "id": str(self.id),
            "title": self.title,
            "summary": self.summary,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "part_id": str(self.part_id)
        }

class ConversationMessage(db.Model):
    """Model representing a message in a conversation."""
    __tablename__ = 'conversation_messages'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    role = Column(String(50), nullable=False)  # 'user' or 'part'
    content = Column(Text, nullable=False)
    timestamp = Column(DateTime, server_default=func.now())
    
    # Vector embedding for the message content
    embedding = Column(Vector(384), nullable=True)
    
    # Relationships
    conversation_id = Column(UUID(as_uuid=True), 
                           ForeignKey('part_conversations.id', ondelete='CASCADE'), 
                           nullable=False)
    conversation = relationship('PartConversation', back_populates='messages')
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert the message to a dictionary.
        
        Returns:
            Dictionary representation of the message.
        """
        return {
            "id": str(self.id),
            "role": self.role,
            "content": self.content,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "conversation_id": str(self.conversation_id)
        }

class PartPersonalityVector(db.Model):
    """Model for storing vector embeddings of part personalities."""
    __tablename__ = 'part_personality_vectors'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    aspect = Column(String(50), nullable=False)  # e.g., 'personality', 'role', 'beliefs'
    embedding = Column(Vector(384), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    part_id = Column(UUID(as_uuid=True), ForeignKey('parts.id', ondelete='CASCADE'), nullable=False)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert the vector to a dictionary.
        
        Returns:
            Dictionary representation of the personality vector.
        """
        return {
            "id": str(self.id),
            "aspect": self.aspect,
            "part_id": str(self.part_id),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        } 