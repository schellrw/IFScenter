"""
Journal model for user reflections and notes.
"""
from uuid import uuid4
from typing import Dict, Any, Optional

from sqlalchemy import Column, String, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func as sql_func

from . import db

class Journal(db.Model):
    """Model for journal entries in an IFS system."""
    __tablename__ = 'journals'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    title = Column(String(200), nullable=False)
    content = Column(Text)
    date = Column(DateTime, server_default=sql_func.now())
    created_at = Column(DateTime, server_default=sql_func.now())
    updated_at = Column(DateTime, server_default=sql_func.now(), onupdate=sql_func.now())
    journal_metadata = Column(Text)  # For storing emotions, parts_present, and other flexible data
    
    # Relationships
    part_id = Column(UUID(as_uuid=True), ForeignKey('parts.id'), nullable=True)
    system_id = Column(UUID(as_uuid=True), ForeignKey('ifs_systems.id'), nullable=False)
    
    # Relationship to part (optional)
    part = relationship('Part', back_populates='journals', lazy=True)
    
    def __init__(self, title: str, system_id: str, content: str = "", 
                 part_id: Optional[str] = None, journal_metadata: str = ""):
        """Initialize a journal entry.
        
        Args:
            title: Title of the journal entry.
            system_id: UUID of the system this journal belongs to.
            content: Content of the journal entry.
            part_id: Optional UUID of the part this journal is associated with.
            journal_metadata: Optional JSON string with additional data (emotions, parts_present, etc.)
        """
        self.title = title
        self.content = content
        self.part_id = part_id
        self.system_id = system_id
        self.journal_metadata = journal_metadata
        
    def to_dict(self) -> Dict[str, Any]:
        """Convert journal to dictionary representation.
        
        Returns:
            Dictionary representation of the journal.
        """
        return {
            "id": str(self.id),
            "title": self.title,
            "content": self.content,
            "date": self.date.isoformat() if self.date else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "part_id": str(self.part_id) if self.part_id else None,
            "metadata": self.journal_metadata  # Keep API response field name as "metadata" for consistency
        }
    
    def __repr__(self) -> str:
        return f"<Journal {self.title}>" 