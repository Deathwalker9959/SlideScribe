"""
User model - Authentication and user management
"""

from datetime import datetime

from sqlalchemy import JSON, Boolean, Column, DateTime, Integer, String
from sqlalchemy.orm import relationship

from database import Base


class User(Base):
    """User account model"""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    disabled = Column(Boolean, default=False)
    is_admin = Column(Boolean, default=False)
    preferences = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    presentations = relationship(
        "Presentation", back_populates="user", cascade="all, delete-orphan"
    )
    refinement_cache = relationship(
        "RefinementCache", back_populates="user", cascade="all, delete-orphan"
    )
