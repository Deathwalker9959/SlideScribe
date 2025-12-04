"""
Enhanced Authentication Service with Driver Support
Supports multiple authentication drivers including 'none' for anonymous access
"""

import secrets
import uuid
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, Optional, Union

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from database import get_db
from models.user import User as DBUser
from shared.utils import config, setup_logging
from services.auth import verify_password, create_access_token

logger = setup_logging("auth-service")

class AuthDriver(str, Enum):
    """Supported authentication drivers"""
    NONE = "none"          # No authentication required
    DATABASE = "database"  # Database-based authentication
    OAUTH = "oauth"       # OAuth authentication (future)
    LDAP = "ldap"         # LDAP authentication (future)

class RegisterRequest(BaseModel):
    """User registration request"""
    username: str
    email: EmailStr
    password: str
    full_name: Optional[str] = None

class LoginResponse(BaseModel):
    """Login response"""
    access_token: str
    token_type: str
    expires_in: int
    user: Dict[str, Any]
    session_id: str
    auth_driver: str

class AnonymousSessionResponse(BaseModel):
    """Anonymous session creation response"""
    access_token: str
    session_id: str
    token_type: str
    expires_in: int
    auth_driver: str

class UserResponse(BaseModel):
    """User information response"""
    id: str
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    session_id: str
    auth_driver: str
    is_authenticated: bool
    created_at: datetime

class AuthService:
    """Enhanced authentication service with driver support"""

    def __init__(self):
        self.auth_driver = AuthDriver(config.get("auth_driver", "database"))
        self.session_expire_minutes = config.get("auth_session_expire_minutes", 1440)
        self.anonymous_session_expire_minutes = config.get("auth_anonymous_session_expire_minutes", 480)
        self.sessions: Dict[str, Dict[str, Any]] = {}  # In-memory session store (use Redis in production)

        logger.info(f"Authentication service initialized with driver: {self.auth_driver}")

    def is_none_driver(self) -> bool:
        """Check if using 'none' authentication driver"""
        return self.auth_driver == AuthDriver.NONE

    def create_session(self, user_data: Optional[Dict[str, Any]] = None, is_authenticated: bool = False) -> str:
        """Create a new session with unique ID"""
        session_id = secrets.token_urlsafe(32)

        # Calculate expiration time
        if is_authenticated:
            expires_at = datetime.utcnow() + timedelta(minutes=self.session_expire_minutes)
        else:
            expires_at = datetime.utcnow() + timedelta(minutes=self.anonymous_session_expire_minutes)

        # Store session data
        session_data = {
            "session_id": session_id,
            "is_authenticated": is_authenticated,
            "created_at": datetime.utcnow().isoformat(),
            "expires_at": expires_at.isoformat(),
            "auth_driver": self.auth_driver,
        }

        if user_data:
            session_data.update(user_data)

        self.sessions[session_id] = session_data
        logger.info(f"Created {'authenticated' if is_authenticated else 'anonymous'} session: {session_id[:8]}...")

        return session_id

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session data by ID"""
        session = self.sessions.get(session_id)
        if not session:
            return None

        # Check if session has expired
        try:
            expires_at = datetime.fromisoformat(session["expires_at"])
            if datetime.utcnow() > expires_at:
                self.cleanup_session(session_id)
                return None
        except (ValueError, KeyError):
            # Invalid expiration time, remove session
            self.cleanup_session(session_id)
            return None

        return session

    def cleanup_session(self, session_id: str) -> None:
        """Clean up expired or invalid session"""
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"Cleaned up session: {session_id[:8]}...")

    def create_jwt_token(self, session_id: str, user_data: Optional[Dict[str, Any]] = None) -> str:
        """Create JWT token for the session"""
        token_data = {
            "sub": session_id,
            "session_id": session_id,
            "auth_driver": self.auth_driver,
        }

        if user_data:
            token_data.update(user_data)

        return create_access_token(token_data)

    def register_user(self, db: Session, register_data: RegisterRequest) -> Dict[str, Any]:
        """Register a new user (database driver only)"""
        if self.auth_driver != AuthDriver.DATABASE:
            raise HTTPException(status_code=400, detail="Registration not supported with current authentication driver")

        # Check if user already exists
        existing_user = db.query(DBUser).filter(
            (DBUser.username == register_data.username) | (DBUser.email == register_data.email)
        ).first()

        if existing_user:
            if existing_user.username == register_data.username:
                raise HTTPException(status_code=400, detail="Username already exists")
            else:
                raise HTTPException(status_code=400, detail="Email already exists")

        # Create new user
        from services.auth import get_user
        # Import bcrypt for password hashing
        import bcrypt

        hashed_password = bcrypt.hashpw(register_data.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        new_user = DBUser(
            username=register_data.username,
            email=register_data.email,
            hashed_password=hashed_password,
            full_name=register_data.full_name or register_data.username,
            is_active=True,
        )

        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        logger.info(f"Registered new user: {new_user.username}")

        return {
            "id": str(new_user.id),
            "username": new_user.username,
            "email": new_user.email,
            "full_name": new_user.full_name,
            "created_at": new_user.created_at,
        }

    def authenticate_user(self, db: Session, username: str, password: str) -> Optional[Dict[str, Any]]:
        """Authenticate user credentials (database driver)"""
        if self.auth_driver != AuthDriver.DATABASE:
            return None

        from services.auth import authenticate_user as auth_user
        user = auth_user(db, username, password)

        if not user:
            return None

        return {
            "id": str(user.id),
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
        }

    def get_auth_config(self) -> Dict[str, Any]:
        """Get authentication configuration for frontend"""
        return {
            "auth_driver": self.auth_driver,
            "requires_auth": not self.is_none_driver(),
            "supports_registration": self.auth_driver == AuthDriver.DATABASE,
            "session_expire_minutes": self.session_expire_minutes if not self.is_none_driver() else self.anonymous_session_expire_minutes,
            "anonymous_session_expire_minutes": self.anonymous_session_expire_minutes,
        }

# Create global authentication service instance
auth_service = AuthService()

# Create API router
router = APIRouter()

@router.get("/config", tags=["Authentication"])
async def get_auth_config():
    """Get authentication configuration"""
    return auth_service.get_auth_config()

@router.post("/register", response_model=LoginResponse, tags=["Authentication"])
async def register(register_data: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user"""
    if not auth_service.get_auth_config()["supports_registration"]:
        raise HTTPException(status_code=400, detail="Registration not supported")

    user_data = auth_service.register_user(db, register_data)
    session_id = auth_service.create_session(user_data, is_authenticated=True)
    token = auth_service.create_jwt_token(session_id, user_data)

    return LoginResponse(
        access_token=token,
        token_type="bearer",
        expires_in=auth_service.session_expire_minutes * 60,
        user=user_data,
        session_id=session_id,
        auth_driver=auth_service.auth_driver,
    )

@router.post("/login", response_model=LoginResponse, tags=["Authentication"])
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Authenticate user and return session token"""
    auth_config = auth_service.get_auth_config()

    if auth_config["requires_auth"]:
        user_data = auth_service.authenticate_user(db, form_data.username, form_data.password)
        if not user_data:
            raise HTTPException(status_code=400, detail="Incorrect username or password")

        session_id = auth_service.create_session(user_data, is_authenticated=True)
        token = auth_service.create_jwt_token(session_id, user_data)

        return LoginResponse(
            access_token=token,
            token_type="bearer",
            expires_in=auth_service.session_expire_minutes * 60,
            user=user_data,
            session_id=session_id,
            auth_driver=auth_service.auth_driver,
        )
    else:
        # For 'none' driver, create anonymous session
        session_id = auth_service.create_session(
            {"username": form_data.username or "anonymous"},
            is_authenticated=False
        )
        token = auth_service.create_jwt_token(session_id)

        user_data = {
            "id": session_id,
            "username": form_data.username or "anonymous",
            "email": None,
            "full_name": None,
        }

        return LoginResponse(
            access_token=token,
            token_type="bearer",
            expires_in=auth_service.anonymous_session_expire_minutes * 60,
            user=user_data,
            session_id=session_id,
            auth_driver=auth_service.auth_driver,
        )

@router.post("/anonymous-session", response_model=AnonymousSessionResponse, tags=["Authentication"])
async def create_anonymous_session():
    """Create an anonymous session (no authentication required)"""
    session_id = auth_service.create_session(is_authenticated=False)
    token = auth_service.create_jwt_token(session_id)

    return AnonymousSessionResponse(
        access_token=token,
        session_id=session_id,
        token_type="bearer",
        expires_in=auth_service.anonymous_session_expire_minutes * 60,
        auth_driver=auth_service.auth_driver,
    )

@router.get("/me", response_model=UserResponse, tags=["Authentication"])
async def get_current_user(token: str = Depends(OAuth2PasswordBearer(tokenUrl="/token"))):
    """Get current user/session information"""
    try:
        from jose import jwt
        from shared.config import SECRET_KEY, ALGORITHM

        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        session_id = payload.get("sub") or payload.get("session_id")

        if not session_id:
            raise HTTPException(status_code=401, detail="Invalid token")

        session = auth_service.get_session(session_id)
        if not session:
            raise HTTPException(status_code=401, detail="Session expired or invalid")

        return UserResponse(
            id=session.get("id", session_id),
            username=session.get("username", "anonymous"),
            email=session.get("email"),
            full_name=session.get("full_name"),
            session_id=session_id,
            auth_driver=session.get("auth_driver", "unknown"),
            is_authenticated=session.get("is_authenticated", False),
            created_at=datetime.fromisoformat(session.get("created_at", datetime.utcnow().isoformat())),
        )

    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}") from e

@router.post("/logout", tags=["Authentication"])
async def logout(token: str = Depends(OAuth2PasswordBearer(tokenUrl="/token"))):
    """Logout and invalidate session"""
    try:
        from jose import jwt
        from shared.config import SECRET_KEY, ALGORITHM

        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        session_id = payload.get("sub") or payload.get("session_id")

        if session_id:
            auth_service.cleanup_session(session_id)
            logger.info(f"Logged out session: {session_id[:8]}...")

        return {"message": "Logged out successfully"}

    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}") from e

@router.get("/health", tags=["Authentication"])
async def auth_health():
    """Authentication service health check"""
    return {
        "status": "healthy",
        "auth_driver": auth_service.auth_driver,
        "active_sessions": len(auth_service.sessions),
        "requires_auth": not auth_service.is_none_driver(),
    }