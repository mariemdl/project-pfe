from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, Security, Depends, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from . import models 
import logging
import secrets
import string

from . import models
from .database import get_db
from .services.email_service import EmailService

logger = logging.getLogger(__name__)

# Security configuration
SECRET_KEY = "your-secret-key-change-in-production"  # Use environment variable!
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

class AuthService:
    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        return pwd_context.verify(plain_password, hashed_password)

    @staticmethod
    def get_password_hash(password: str) -> str:
        return pwd_context.hash(password)

    @staticmethod
    def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt

    @staticmethod
    def decode_token(token: str) -> Dict[str, Any]:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            return payload
        except JWTError as e:
            logger.error(f"JWT decode error: {e}")
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")

    @staticmethod
    def generate_random_password(length: int = 12) -> str:
        """Generate a random secure password"""
        alphabet = string.ascii_letters + string.digits
        return ''.join(secrets.choice(alphabet) for _ in range(length))


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
    db: Session = Depends(get_db)
) -> models.User:
    """Get current user from JWT token"""
    token = credentials.credentials
    payload = AuthService.decode_token(token)
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    
    return user


async def send_credentials_email_background(
    to_email: str, 
    username: str, 
    password: str, 
    full_name: str = None
):
    """Background task to send credentials email"""
    await EmailService.send_credentials_email(to_email, username, password, full_name)


async def send_password_reset_email_background(to_email: str, reset_link: str):
    """Background task to send password reset email"""
    await EmailService.send_password_reset_email(to_email, reset_link)


# Permission decorators and dependencies
def require_role(required_role: str):
    """Dependency to check if user has required role"""
    def role_checker(current_user: models.User = Depends(get_current_user)):
        if current_user.role != required_role and current_user.role != models.UserRole.ADMIN:
            raise HTTPException(
                status_code=403, 
                detail=f"Role '{required_role}' required. User has '{current_user.role}'"
            )
        return current_user
    return role_checker


def require_permission(resource: str, action: str):
    """Dependency to check if user has specific permission"""
    def permission_checker(current_user: models.User = Depends(get_current_user)):
        # Admin has all permissions
        if current_user.role == models.UserRole.ADMIN:
            return current_user
        
        # Check permissions JSON
        permissions = current_user.permissions_json or {}
        if resource in permissions and action in permissions[resource]:
            return current_user
        
        # Check role-based defaults
        role_permissions = {
            models.UserRole.MANAGER: {"documents": ["view", "create", "edit"], "users": ["view_subordinates"]},
            models.UserRole.OPERATOR: {"documents": ["view", "create"], "users": []},
            models.UserRole.VIEWER: {"documents": ["view"], "users": []},
        }
        
        default_perms = role_permissions.get(current_user.role, {})
        if resource in default_perms and action in default_perms[resource]:
            return current_user
        
        raise HTTPException(
            status_code=403,
            detail=f"Permission '{action}' on '{resource}' required"
        )
    return permission_checker


def check_batch_access(batch, user, db):
    """Check if user has access to a batch"""
    # Admin can access everything
    if user.role == "admin":
        return True
    
    # Owner can access their own batches
    if batch.user_id == user.id:
        return True
    
    # Manager can access subordinates' batches
    if user.role == "manager":
        # Check if batch owner is a subordinate
        owner = db.query(models.User).filter(models.User.id == batch.user_id).first()
        if owner:
            # Traverse up the manager chain
            current = owner
            while current and current.manager_id:
                if current.manager_id == user.id:
                    return True
                current = db.query(models.User).filter(models.User.id == current.manager_id).first()
    
    return False