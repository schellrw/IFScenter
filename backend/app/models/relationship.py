"""
Relationship model for connections between IFS parts.
"""
from uuid import uuid4
from typing import Dict, Any

from sqlalchemy import Column, String, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func as sql_func

from . import db

class Relationship(db.Model):
    """Model representing a relationship between IFS parts."""
    __tablename__ = 'relationships'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    # Use part1_id and part2_id as they exist in Supabase
    part1_id = Column(UUID(as_uuid=True), ForeignKey('parts.id'), nullable=False)
    part2_id = Column(UUID(as_uuid=True), ForeignKey('parts.id'), nullable=False)
    relationship_type = Column(String(100), nullable=False)
    description = Column(Text)
    created_at = Column(DateTime, server_default=sql_func.now())
    updated_at = Column(DateTime, server_default=sql_func.now(), onupdate=sql_func.now())
    
    # The system this relationship belongs to
    system_id = Column(UUID(as_uuid=True), ForeignKey('ifs_systems.id'), nullable=False)
    
    def __init__(self, source_id: str, target_id: str, relationship_type: str, 
                 system_id: str, description: str = ""):
        """Initialize a relationship between parts.
        
        Args:
            source_id: UUID of the source part.
            target_id: UUID of the target part.
            relationship_type: Type of relationship (e.g., "protects", "conflicts").
            system_id: UUID of the system this relationship belongs to.
            description: Optional description of the relationship.
        """
        # Map source_id to part1_id and target_id to part2_id
        self.part1_id = source_id
        self.part2_id = target_id
        self.relationship_type = relationship_type
        self.description = description
        self.system_id = system_id
        
    def to_dict(self) -> Dict[str, Any]:
        """Convert relationship to dictionary representation.
        
        Returns:
            Dictionary representation of the relationship.
        """
        return {
            "id": str(self.id),
            # Return as source_id and target_id for frontend compatibility
            "source_id": str(self.part1_id),
            "target_id": str(self.part2_id),
            "relationship_type": self.relationship_type,
            "description": self.description,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
    
    def __repr__(self) -> str:
        return f"<Relationship {self.relationship_type}: {self.part1_id} -> {self.part2_id}>" 