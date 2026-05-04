from datetime import datetime, timedelta
import secrets
import logging
from sqlalchemy.orm import Session
from . import models, auth
from .config import settings

logger = logging.getLogger(__name__)

class PasswordResetService:
    
    @staticmethod
    def generate_reset_token() -> str:
        """Generate a secure random token for password reset"""
        return secrets.token_urlsafe(32)
    
    @staticmethod
    def create_reset_request(db: Session, email: str) -> dict:
        """
        Create a password reset request for the given email.
        Returns dict with success status and reset link (if email exists).
        """
        # Find user by email
        user = db.query(models.User).filter(models.User.email == email).first()
        
        # Always return success to prevent email enumeration
        if not user:
            logger.info(f"Password reset requested for non-existent email: {email}")
            return {
                "success": True,
                "message": "If an account exists with this email, you will receive a reset link."
            }
        
        # Check if there's already an unused token for this user
        existing = db.query(models.PasswordReset).filter(
            models.PasswordReset.user_id == user.id,
            models.PasswordReset.is_used == False,
            models.PasswordReset.expires_at > datetime.utcnow()
        ).first()
        
        if existing:
            # Optionally invalidate old token
            existing.is_used = True
            db.commit()
        
        # Create new reset token
        token = PasswordResetService.generate_reset_token()
        expires_at = datetime.utcnow() + timedelta(hours=24)
        
        reset_request = models.PasswordReset(
            user_id=user.id,
            token=token,
            expires_at=expires_at,
            is_used=False
        )
        db.add(reset_request)
        db.commit()
        
        # Generate reset link (frontend URL)
        reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        
        # In production, send email here
        # For now, log the link
        logger.info(f"Password reset link for {user.email}: {reset_link}")
        
        # TODO: Send email with reset link
        # await EmailService.send_password_reset_email(user.email, reset_link)
        
        return {
            "success": True,
            "message": "If an account exists with this email, you will receive a reset link.",
            "reset_link": reset_link  # Only for development, remove in production
        }
    
    @staticmethod
    def reset_password(db: Session, token: str, new_password: str) -> dict:
        """
        Reset password using a valid token.
        Returns dict with success status and message.
        """
        # Find valid reset request
        reset = db.query(models.PasswordReset).filter(
            models.PasswordReset.token == token,
            models.PasswordReset.is_used == False,
            models.PasswordReset.expires_at > datetime.utcnow()
        ).first()
        
        if not reset:
            return {
                "success": False,
                "message": "Invalid or expired reset token. Please request a new password reset."
            }
        
        # Validate password strength
        if len(new_password) < 6:
            return {
                "success": False,
                "message": "Password must be at least 6 characters long."
            }
        
        # Update user's password
        user = reset.user
        user.hashed_password = auth.AuthService.get_password_hash(new_password)
        
        # Mark token as used
        reset.is_used = True
        reset.used_at = datetime.utcnow()
        
        db.commit()
        
        logger.info(f"Password reset successful for user: {user.email}")
        
        return {
            "success": True,
            "message": "Password has been reset successfully. You can now log in with your new password."
        }
    
    @staticmethod
    def validate_token(db: Session, token: str) -> dict:
        """
        Validate if a reset token is valid (without consuming it).
        Used to check token validity before showing reset form.
        """
        reset = db.query(models.PasswordReset).filter(
            models.PasswordReset.token == token,
            models.PasswordReset.is_used == False,
            models.PasswordReset.expires_at > datetime.utcnow()
        ).first()
        
        if not reset:
            return {
                "valid": False,
                "message": "Invalid or expired reset token."
            }
        
        return {
            "valid": True,
            "message": "Token is valid."
        }