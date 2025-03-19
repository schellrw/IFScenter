"""
IFSSystem model to represent a user's internal family system.
"""
from uuid import uuid4
from typing import Dict, Any, List, Optional

from sqlalchemy import Column, String, DateTime, ForeignKey, func, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from . import db

class IFSSystem(db.Model):
    """Model representing a user's internal family system."""
    __tablename__ = 'ifs_systems'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    parts = relationship('Part', backref='system', lazy=True, cascade='all, delete-orphan')
    relationships = relationship('Relationship', backref='system', lazy=True, cascade='all, delete-orphan')
    journals = relationship('Journal', backref='system', lazy=True, cascade='all, delete-orphan')
    
    def __init__(self, user_id: str, name: str = None, description: str = None):
        """Initialize a new IFS system.
        
        Args:
            user_id: UUID of the user who owns this system.
            name: Optional name for the system (ignored, not in db schema).
            description: Optional description of the system (ignored, not in db schema).
        """
        self.user_id = user_id
        # name and description aren't columns in the actual database
        # so we just ignore them here
        
    def to_dict(self) -> Dict[str, Any]:
        """Convert system to dictionary representation.
        
        Returns:
            Dictionary containing all system data, including parts and relationships.
        """
        parts_dict = {}
        for part in self.parts:
            parts_dict[str(part.id)] = part.to_dict()
            
        relationships_dict = {}
        for rel in self.relationships:
            relationships_dict[str(rel.id)] = rel.to_dict()
            
        journals_dict = {}
        for journal in self.journals:
            journals_dict[str(journal.id)] = journal.to_dict()
            
        result = {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "parts": parts_dict,
            "relationships": relationships_dict,
            "journals": journals_dict,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
            
        return result
    
    def __repr__(self) -> str:
        return f"<IFSSystem {self.id}>"