from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
import os

SECRET_KEY = os.getenv("SECRET_KEY", "supersecret")
ALGORITHM = "HS256"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token")

class User(BaseModel):
    username: str
    disabled: bool = False

class UserInDB(User):
    hashed_password: str

fake_users_db: dict[str, dict[str, str | bool]] = {
    "testuser": {
        "username": "testuser",
        "hashed_password": pwd_context.hash("testpass"),
        "disabled": False,
    }
}

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_user(db: dict[str, dict[str, str | bool]], username: str) -> UserInDB | None:
    if username in db:
        user_dict: dict[str, str | bool] = db[username]
        return UserInDB(
            username=str(user_dict.get("username", "")),
            hashed_password=str(user_dict.get("hashed_password", "")),
            disabled=bool(user_dict.get("disabled", False))
        )
    return None

def authenticate_user(db: dict[str, dict[str, str | bool]], username: str, password: str) -> UserInDB | bool:
    user = get_user(db, username)
    if not isinstance(user, UserInDB) or not verify_password(password, user.hashed_password):
        return False
    return user

def create_access_token(data: dict[str, str]) -> str:
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
                        "token_type": "bearer"
                    }
                }
            }
        },
        400: {
            "description": "Invalid credentials provided",
            "content": {
                "application/json": {
                    "example": {
                        "detail": "Incorrect username or password"
                    }
                }
            }
        }
    }
)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    Authenticate user with username and password to receive access token.
    
    This endpoint validates user credentials against the user database and
    returns a JWT access token that can be used to authenticate subsequent
    API requests. The token should be included in the Authorization header
    as "Bearer <token>".
    
    Args:
        form_data: OAuth2 form data containing username and password
        
    Returns:
        dict: Access token and token type for API authentication
        
    Raises:
        HTTPException: 400 if credentials are invalid
        
    Example:
        ```
        POST /token
        Content-Type: application/x-www-form-urlencoded
        
        username=testuser&password=testpass
        ```
        
        Response:
        ```json
        {
            "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
            "token_type": "bearer"
        }
        ```
    """
    user = authenticate_user(fake_users_db, form_data.username, form_data.password)
    if not isinstance(user, UserInDB):
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
                "application/json": {
                    "example": {
                        "username": "testuser",
                        "disabled": False
                    }
                }
            }
        },
        401: {
            "description": "Invalid or expired token",
            "content": {
                "application/json": {
                    "example": {
                        "detail": "Invalid token"
                    }
                }
            }
        }
    }
)
async def read_users_me(token: str = Depends(oauth2_scheme)):
    """
    Get the current authenticated user's profile information.
    
    This endpoint returns the profile information for the currently authenticated
    user based on the provided JWT token. The token must be valid and not expired.
    
    Args:
        token: JWT access token from Authorization header
        
    Returns:
        User: Current user's profile information including username and status
        
    Raises:
        HTTPException: 401 if token is invalid, expired, or user not found
        
    Example:
        ```
        GET /users/me
        Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
        ```
        
        Response:
        ```json
        {
            "username": "testuser",
            "disabled": false
        }
        ```
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not isinstance(username, str):
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = get_user(fake_users_db, username)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user
