"""
User model module for authentication and user management.
"""
import datetime
from uuid import uuid4
from typing import Dict, Any, Optional

from passlib.hash import bcrypt
from sqlalchemy import Column, String, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from . import db

class User(db.Model):
    """User model for authentication and authorization."""
    __tablename__ = 'users'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    username = Column(String(80), unique=True, nullable=False)
    email = Column(String(120), unique=True, nullable=False)
    password_hash = Column(String(128), nullable=False)
    created_at = Column(DateTime, default=func.now())
    
    systems = relationship('IFSSystem', backref='user', lazy=True, cascade='all, delete-orphan')
    
    def __init__(self, username: str, email: str, password: str):
        """Initialize a new user.
        
        Args:
            username: A unique username.
            email: User's email address.
            password: Plain text password (will be hashed).
        """
        self.username = username
        self.email = email
        self.password_hash = bcrypt.hash(password)
    
    def verify_password(self, password: str) -> bool:
        """Verify a password against the stored hash.
        
        Args:
            password: Plain text password to verify.
            
        Returns:
            True if the password matches, False otherwise.
        """
        return bcrypt.verify(password, self.password_hash)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert user to dictionary representation.
        
        Returns:
            Dictionary representation of user, excluding sensitive fields.
        """
        return {
            "id": str(self.id),
            "username": self.username,
            "email": self.email,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
    
    def __repr__(self) -> str:
        return f"<User {self.username}>" 