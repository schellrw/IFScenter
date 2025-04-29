"""
User model module for authentication and user management.
"""
import datetime
from uuid import uuid4
from typing import Dict, Any, Optional
from datetime import date # Import date for Date type hint

from passlib.hash import bcrypt
# Import Integer and Date
from sqlalchemy import Column, String, DateTime, func, Integer, Date 
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
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Rename full_name to first_name
    first_name = Column(String(100), nullable=True) # Renamed from full_name, adjusted length potentially
    avatar_url = Column(String, nullable=True) # URL from Supabase Storage

    # New Subscription Fields
    subscription_tier = Column(String, nullable=False, default='free') # 'free', 'pro', 'unlimited'
    stripe_customer_id = Column(String, unique=True, nullable=True, index=True)
    stripe_subscription_id = Column(String, unique=True, nullable=True, index=True)
    subscription_status = Column(String, nullable=True) # 'active', 'canceled', 'past_due', etc.

    # New Usage Tracking Fields
    daily_messages_used = Column(Integer, nullable=False, default=0)
    last_message_date = Column(Date, nullable=True)
    daily_journals_used = Column(Integer, nullable=False, default=0)
    last_journal_date = Column(Date, nullable=True)

    systems = relationship('IFSSystem', backref='user', lazy=True, cascade='all, delete-orphan')
    
    def __init__(self, username: str, email: str, password: str, first_name: Optional[str] = None):
        """Initialize a new user.
        
        Args:
            username: A unique username.
            email: User's email address.
            password: Plain text password (will be hashed).
            first_name: Optional user's first name.
        """
        self.username = username
        self.email = email
        self.password_hash = bcrypt.hash(password)
        self.first_name = first_name # Changed from full_name
    
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
        created_at_iso = None
        if isinstance(self.created_at, datetime.datetime):
             created_at_iso = self.created_at.isoformat()

        return {
            "id": str(self.id) if self.id else None,
            "username": self.username,
            "email": self.email,
            "first_name": self.first_name, # Changed from full_name
            "avatar_url": self.avatar_url,
            "subscription_tier": self.subscription_tier,
            "created_at": created_at_iso
        }
    
    def __repr__(self) -> str:
        return f"<User {self.username}>" 