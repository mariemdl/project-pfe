import smtplib
import logging
import asyncio
from email.mime.text import MIMEText
from .config import settings

logger = logging.getLogger(__name__)

class EmailService:
    
    @staticmethod
    async def send_password_reset_email(to_email: str, reset_link: str):
        """Send password reset email - PLAIN TEXT ONLY"""
        subject = "Reset Your Password - Topnet Data Extraction"
        
        text_content = f"""
Reset Your Password - Topnet Data Extraction

You requested to reset your password. Click the link below to create a new password:

{reset_link}

This link will expire in 24 hours.

If you didn't request this, please ignore this email.

---
Topnet Data Extraction
"""
        
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            EmailService._send_sync_email,
            to_email,
            subject,
            text_content
        )
        return result
    
    @staticmethod
    async def send_credentials_email(to_email: str, username: str, password: str, full_name: str = None):
        """Send login credentials to new user - PLAIN TEXT ONLY"""
        subject = "Welcome to Document Extraction Platform"
        display_name = full_name or username
        
        text_content = f"""
Welcome to Document Extraction Platform

Hello {display_name},

Your account has been created successfully. Here are your login credentials:

Username: {username}
Password: {password}

Login URL: {settings.APP_URL}/login

Important Security Notes:
- Please change your password after first login
- Do not share your credentials with anyone
- Contact your administrator if you didn't request this account

This is an automated message, please do not reply.

---
Topnet Data Extraction
"""
        
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            EmailService._send_sync_email,
            to_email,
            subject,
            text_content
        )
        return result
    
    @staticmethod
    def _send_sync_email(to_email: str, subject: str, content: str):
        """Synchronous email sending (runs in thread pool to avoid blocking)"""
        try:
            msg = MIMEText(content, 'plain')
            msg['From'] = settings.SMTP_FROM_EMAIL
            msg['To'] = to_email
            msg['Subject'] = subject
            
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                server.send_message(msg)
            
            logger.info(f"✅ Email sent successfully to {to_email}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to send email to {to_email}: {e}")
            return False