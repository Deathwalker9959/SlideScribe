import os

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.user import User as DBUser

SECRET_KEY = os.getenv("SECRET_KEY", "supersecret")
ALGORITHM = "HS256"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token")
# Optional auth scheme that allows anonymous sessions
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/token", auto_error=False)


class User(BaseModel):
    username: str
    disabled: bool = False


class UserInDB(User):
    hashed_password: str


class LoginRequest(BaseModel):
    username: str
    password: str


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a bcrypt hash."""
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def get_user(db: Session, username: str) -> DBUser | None:
    """Get user from database by username."""
    return db.query(DBUser).filter(DBUser.username == username).first()


def authenticate_user(db: Session, username: str, password: str) -> DBUser | bool:
    """Authenticate user credentials."""
    user = get_user(db, username)
    if not user or not verify_password(password, user.hashed_password):
        return False
    return user


def create_access_token(data: dict[str, str]) -> str:
    """Create JWT access token."""
    return jwt.encode(data, SECRET_KEY, algorithm=ALGORITHM)


router = APIRouter()


@router.post(
    "/token",
    tags=["Authentication"],
    summary="User Login",
    description="Authenticate user credentials and receive JWT access token",
    response_description="JWT access token for API authentication",
    responses={
        200: {
            "description": "Successfully authenticated user",
            "content": {
                "application/json": {
                    "example": {
                        "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
                        "token_type": "bearer",
                    }
                }
            },
        },
        400: {
            "description": "Invalid credentials provided",
            "content": {
                "application/json": {"example": {"detail": "Incorrect username or password"}}
            },
        },
    },
)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Authenticate user and return JWT access token."""
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    token = create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer"}


@router.post(
    "/token-json",
    tags=["Authentication"],
    summary="User Login (JSON)",
    description="Authenticate user credentials via JSON and receive JWT access token",
    response_description="JWT access token for API authentication",
)
async def login_json(login_request: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user and return JWT access token via JSON."""
    user = authenticate_user(db, login_request.username, login_request.password)
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    token = create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer"}


@router.get(
    "/users/me",
    tags=["Authentication"],
    summary="Get Current User",
    description="Retrieve current authenticated user information",
    response_description="Current user profile and account details",
    responses={
        200: {
            "description": "Successfully retrieved user information",
            "content": {
                "application/json": {"example": {"username": "testuser", "disabled": False}}
            },
        },
        401: {
            "description": "Invalid or expired token",
            "content": {"application/json": {"example": {"detail": "Invalid token"}}},
        },
    },
)
async def read_users_me(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Get current authenticated user profile."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not isinstance(username, str):
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError as e:
        raise HTTPException(status_code=401, detail="Invalid token") from e
    user = get_user(db, username)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user
