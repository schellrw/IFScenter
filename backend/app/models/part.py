"""
Part model for IFS parts.
"""
import datetime
from uuid import uuid4
from typing import Dict, Any, List, Optional

from sqlalchemy import Column, String, Text, DateTime, ForeignKey, func
from sqlalchemy.sql import func as sql_func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from . import db

class Part(db.Model):
    """Model representing an IFS part."""
    __tablename__ = 'parts'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(100), nullable=False)
    role = Column(String(50))
    description = Column(Text)
    
    # Using JSONB for better performance and querying capabilities
    feelings = Column(JSONB, default=list)
    beliefs = Column(JSONB, default=list)
    triggers = Column(JSONB, default=list)
    needs = Column(JSONB, default=list)
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    system_id = Column(UUID(as_uuid=True), ForeignKey('ifs_systems.id'), nullable=False)
    
    # Set up relationships for easier querying
    journals = relationship('Journal', back_populates='part', lazy=True)
    
    # Conversation relationships
    conversations = relationship('PartConversation', back_populates='part', lazy=True,
                               cascade='all, delete-orphan')
    
    # Relationship to other parts (defined via Relationship model)
    source_relationships = relationship(
        'Relationship', 
        foreign_keys='Relationship.part1_id',
        backref='source',
        lazy=True,
        cascade='all, delete-orphan'
    )
    
    target_relationships = relationship(
        'Relationship', 
        foreign_keys='Relationship.part2_id',
        backref='target',
        lazy=True,
        cascade='all, delete-orphan'
    )
    
    def __init__(self, name: str, system_id: str, role: Optional[str] = None, 
                 description: str = "", feelings: Optional[List[str]] = None,
                 beliefs: Optional[List[str]] = None, triggers: Optional[List[str]] = None,
                 needs: Optional[List[str]] = None):
        """Initialize a part.
        
        Args:
            name: Name of the part.
            system_id: UUID of the IFS system this part belongs to.
            role: Optional role or function of this part.
            description: Longer description of the part.
            feelings: List of feelings associated with this part.
            beliefs: List of beliefs held by this part.
            triggers: List of things that activate this part.
            needs: List of needs this part has.
        """
        self.name = name
        self.system_id = system_id
        self.role = role
        self.description = description
        self.feelings = feelings or []
        self.beliefs = beliefs or []
        self.triggers = triggers or []
        self.needs = needs or []
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert part to dictionary representation.
        
        Returns:
            Dictionary representation of part.
        """
        return {
            "id": str(self.id),
            "name": self.name,
            "system_id": str(self.system_id),
            "role": self.role,
            "description": self.description,
            "feelings": self.feelings,
            "beliefs": self.beliefs,
            "triggers": self.triggers,
            "needs": self.needs,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any], system_id: str) -> 'Part':
        """Create a Part from a dictionary.
        
        Args:
            data: Dictionary containing part data.
            system_id: UUID of the system this part belongs to.
            
        Returns:
            Newly created Part instance.
        """
        part = cls(
            name=data["name"], 
            system_id=system_id,
            role=data.get("role"), 
            description=data.get("description", "")
        )
        
        # Set JSON fields
        if "feelings" in data:
            part.feelings = data["feelings"]
        if "beliefs" in data:
            part.beliefs = data["beliefs"]
        if "triggers" in data:
            part.triggers = data["triggers"]
        if "needs" in data:
            part.needs = data["needs"]
            
        return part
    
    def __repr__(self) -> str:
        return f"<Part {self.name}>" 