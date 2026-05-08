from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Form, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, date
from typing import List, Optional
import aiofiles
import os
import uuid
import logging
import secrets  # token generation
from pathlib import Path
from pydantic import BaseModel, EmailStr

import app.dashboard as dashboard

from . import models, schemas, ai_client, auth
from .database import engine, get_db

from .config import settings
from .storage import StorageManager
from .converter import FileConverter
from .processor import DocumentProcessor
from .selenium_map import SeleniumMapGenerator

from .password_reset import PasswordResetService
from .auth import send_credentials_email_background, send_password_reset_email_background

from .routes import admin, system_admin, manager

from PIL import Image
import pytesseract
import pdf2image

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create database tables
models.Base.metadata.create_all(bind=engine)

# Initialize FastAPI
app = FastAPI(title="Topnet Document Extraction API")

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4200",
        "http://localhost",
        "http://127.0.0.1:4200",
        "http://127.0.0.1",
        "http://frontend",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Initialize services
storage = StorageManager(
    base_path=settings.UPLOAD_BASE_PATH.replace('/uploads', '')
)
ai_client_instance = ai_client.ai_client
converter = FileConverter()
selenium_map = SeleniumMapGenerator(selenium_host="selenium", selenium_port=4444)

# Include routers
app.include_router(dashboard.router)
app.include_router(admin.router)
app.include_router(system_admin.router)
app.include_router(manager.router)


# ========== Pydantic Models for Auth ==========

class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    full_name: Optional[str] = None
    role: str = "viewer"
    manager_id: Optional[int] = None

class UserLogin(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    username: str
    role: str

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    manager_id: Optional[int] = None
    is_active: Optional[bool] = None

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

class TranslationRequest(BaseModel):
    text: str
    target_language: str
    source_language: Optional[str] = None

class TranslationResponse(BaseModel):
    translated_text: str
    source_language: str
    target_language: str

# ========== AUTHENTICATION ENDPOINTS ==========

@app.post("/api/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a new user"""
    # Check if user exists
    existing = db.query(models.User).filter(
        (models.User.email == user_data.email) | (models.User.username == user_data.username)
    ).first()
    if existing:
        raise HTTPException(400, "User with this email or username already exists")

    # Validate role — only non-privileged roles allowed via self-registration
    allowed_self_register_roles = {models.UserRole.VIEWER, models.UserRole.OPERATOR, models.UserRole.MANAGER}
    try:
        requested_role = models.UserRole(user_data.role)
    except ValueError:
        raise HTTPException(400, f"Invalid role '{user_data.role}'")
    if requested_role not in allowed_self_register_roles:
        raise HTTPException(403, "Cannot self-register with a privileged role")

    # Hash password
    hashed_password = auth.AuthService.get_password_hash(user_data.password)

    # Create user
    user = models.User(
        email=user_data.email,
        username=user_data.username,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        role=requested_role,
        manager_id=user_data.manager_id
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Log activity
    activity = models.UserActivityLog(
        user_id=user.id,
        action="register",
        resource_type="user",
        resource_id=user.id,
        details={"username": user.username}
    )
    db.add(activity)
    db.commit()
    
    # Create access token
    access_token = auth.AuthService.create_access_token(
        data={"sub": str(user.id), "username": user.username, "role": user.role}
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": user.id,
        "username": user.username,
        "role": user.role
    }

@app.post("/api/auth/login", response_model=TokenResponse)
async def login(login_data: UserLogin, db: Session = Depends(get_db)):
    """Login and get access token"""
    user = db.query(models.User).filter(
        (models.User.username == login_data.username) | (models.User.email == login_data.username)
    ).first()
    
    if not user or not auth.AuthService.verify_password(login_data.password, user.hashed_password):
        raise HTTPException(401, "Invalid username or password")
    
    if not user.is_active:
        raise HTTPException(401, "User account is inactive")
    
    # Create session
    import secrets
    token_jti = secrets.token_urlsafe(32)
    session = models.UserSession(
        user_id=user.id,
        token_jti=token_jti,
        expires_at=datetime.utcnow() + timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    db.add(session)
    
    # Log activity
    activity = models.UserActivityLog(
        user_id=user.id,
        action="login",
        resource_type="user",
        resource_id=user.id
    )
    db.add(activity)
    db.commit()
    
    access_token = auth.AuthService.create_access_token(
        data={"sub": str(user.id), "username": user.username, "role": user.role, "jti": token_jti}
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": user.id,
        "username": user.username,
        "role": user.role
    }

@app.post("/api/auth/logout")
async def logout(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Logout current user"""
    # Invalidate all sessions for this user
    db.query(models.UserSession).filter(
        models.UserSession.user_id == current_user.id,
        models.UserSession.is_active == True
    ).update({"is_active": False})
    
    # Log activity
    activity = models.UserActivityLog(
        user_id=current_user.id,
        action="logout",
        resource_type="user",
        resource_id=current_user.id
    )
    db.add(activity)
    db.commit()
    
    return {"message": "Successfully logged out"}

@app.get("/api/auth/me")
async def get_current_user_info(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user information"""
    # Get subordinate count
    subordinate_count = db.query(models.User).filter(
        models.User.manager_id == current_user.id
    ).count()
    
    # Get recent activity
    recent_activity = db.query(models.UserActivityLog).filter(
        models.UserActivityLog.user_id == current_user.id
    ).order_by(models.UserActivityLog.created_at.desc()).limit(5).all()
    
    # Get user's permission names
    user_perms = (
        db.query(models.Permission)
        .join(models.UserPermission, models.UserPermission.permission_id == models.Permission.id)
        .filter(models.UserPermission.user_id == current_user.id)
        .all()
    )
    permission_names = [p.name for p in user_perms]

    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "manager_id": current_user.manager_id,
        "is_active": current_user.is_active,
        "created_at": current_user.created_at,
        "subordinate_count": subordinate_count,
        "permissions": permission_names,
        "recent_activity": [
            {
                "action": a.action,
                "resource_type": a.resource_type,
                "created_at": a.created_at
            }
            for a in recent_activity
        ]
    }

@app.post("/api/auth/change-password")
async def change_password(
    password_data: ChangePasswordRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Change user password"""
    # Verify old password
    if not auth.AuthService.verify_password(password_data.old_password, current_user.hashed_password):
        raise HTTPException(400, "Incorrect current password")
    
    # Set new password
    current_user.hashed_password = auth.AuthService.get_password_hash(password_data.new_password)
    db.commit()
    
    # Log activity
    activity = models.UserActivityLog(
        user_id=current_user.id,
        action="change_password",
        resource_type="user",
        resource_id=current_user.id
    )
    db.add(activity)
    db.commit()
    
    return {"message": "Password changed successfully"}

# ========== USER MANAGEMENT (Admin/Manager) ==========

@app.get("/api/users", dependencies=[Depends(auth.require_role("admin"))])
async def get_all_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get all users (admin only)"""
    users = db.query(models.User).offset(skip).limit(limit).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "manager_id": u.manager_id,
            "is_active": u.is_active,
            "created_at": u.created_at,
            "subordinate_count": db.query(models.User).filter(models.User.manager_id == u.id).count()
        }
        for u in users
    ]

@app.get("/api/users/team")
async def get_my_team(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Get all team members under current user (self + subordinates recursively)"""
    if current_user.role == "admin":
        # Admin sees everyone
        users = db.query(models.User).all()
    else:
        # Get subordinates recursively
        def get_subordinates(manager_id):
            direct = db.query(models.User).filter(models.User.manager_id == manager_id).all()
            result = list(direct)
            for sub in direct:
                result.extend(get_subordinates(sub.id))
            return result
        
        subordinates = get_subordinates(current_user.id)
        users = [current_user] + subordinates
    
    return [
        {
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "role": u.role,
            "manager_id": u.manager_id,
            "is_active": u.is_active
        }
        for u in users
    ]

@app.get("/api/users/{user_id}")
async def get_user(
    user_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Get specific user details (if accessible)"""
    target_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not target_user:
        raise HTTPException(404, "User not found")
    
    # Check access: admin, self, or manager of this user
    has_access = (
        current_user.role == "admin" or
        current_user.id == user_id or
        (current_user.role == "manager" and target_user.manager_id == current_user.id)
    )
    
    if not has_access:
        raise HTTPException(403, "Not authorized to view this user")
    
    # Get user's batches
    batches = db.query(models.Batch).filter(models.Batch.user_id == user_id).all()
    
    return {
        "id": target_user.id,
        "username": target_user.username,
        "email": target_user.email,
        "full_name": target_user.full_name,
        "role": target_user.role,
        "manager_id": target_user.manager_id,
        "is_active": target_user.is_active,
        "created_at": target_user.created_at,
        "batch_count": len(batches),
        "document_count": db.query(models.Document).join(models.Batch).filter(
            models.Batch.user_id == user_id
        ).count()
    }

@app.put("/api/users/{user_id}")
async def update_user(
    user_id: int,
    user_update: UserUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Update user (admin only or self for limited fields)"""
    target_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not target_user:
        raise HTTPException(404, "User not found")
    
    # Check permissions
    is_self = current_user.id == user_id
    is_admin = current_user.role == "admin"
    
    if not is_admin and not is_self:
        raise HTTPException(403, "Not authorized to update this user")
    
    # Self can only update limited fields
    if is_self and not is_admin:
        # Self can only update full_name and password (separate endpoint)
        if user_update.role is not None or user_update.manager_id is not None or user_update.is_active is not None:
            raise HTTPException(403, "Cannot change role, manager, or active status")
        target_user.full_name = user_update.full_name or target_user.full_name
        target_user.email = user_update.email or target_user.email
    else:
        # Admin can update everything
        if user_update.email:
            target_user.email = user_update.email
        if user_update.full_name:
            target_user.full_name = user_update.full_name
        if user_update.role:
            target_user.role = user_update.role
        if user_update.manager_id is not None:
            target_user.manager_id = user_update.manager_id
        if user_update.is_active is not None:
            target_user.is_active = user_update.is_active
    
    db.commit()
    
    # Log activity
    activity = models.UserActivityLog(
        user_id=current_user.id,
        action="update_user",
        resource_type="user",
        resource_id=user_id,
        details={"updated_by": current_user.id}
    )
    db.add(activity)
    db.commit()
    
    return {"message": "User updated successfully"}

# ========== ACTIVITY LOGS ==========

@app.get("/api/activity/logs")
async def get_activity_logs(
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Get activity logs (admin only)"""
    if current_user.role != "admin":
        raise HTTPException(403, "Admin access required")
    
    query = db.query(models.UserActivityLog).order_by(models.UserActivityLog.created_at.desc())
    
    if user_id:
        query = query.filter(models.UserActivityLog.user_id == user_id)
    if action:
        query = query.filter(models.UserActivityLog.action == action)
    
    logs = query.offset(skip).limit(limit).all()
    
    return [
        {
            "id": log.id,
            "user_id": log.user_id,
            "username": log.user.username if log.user else "Unknown",
            "action": log.action,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "details": log.details,
            "created_at": log.created_at
        }
        for log in logs
    ]

# ========== UPDATE EXISTING ENDPOINTS WITH AUTH ==========

@app.get("/")
async def root():
    return {"message": "Topnet Document Extraction API", "status": "running"}

@app.options("/api/extract/id-card")
async def options_id_card():
    return JSONResponse(content={"message": "OK"}, headers={
        "Access-Control-Allow-Origin": "http://localhost:4200",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true"
    })

@app.post("/api/detect-language", response_model=schemas.LanguageDetectionResponse)
async def detect_language(
    request: dict,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Detect document language from extracted text"""
    try:
        # Get text from request body
        text = request.get("text", "")
        
        if not text or len(text.strip()) < 20:
            return {"language": "english", "confidence": 0.5}
        
        # Simple language detection
        text_lower = text.lower()
        
        # French indicators
        if any(c in "éèêëàâçîïôûùüÿ" for c in text_lower):
            language = "french"
            confidence = 0.85
        # Arabic indicators
        elif any('\u0600' <= c <= '\u06FF' for c in text):
            language = "arabic"
            confidence = 0.85
        # German indicators
        elif 'ß' in text_lower or 'ä' in text_lower or 'ö' in text_lower or 'ü' in text_lower:
            language = "german"
            confidence = 0.85
        # Spanish indicators
        elif any(c in "áéíóúñ" for c in text_lower):
            language = "spanish"
            confidence = 0.85
        else:
            language = "english"
            confidence = 0.85
        
        # Log activity
        activity = models.UserActivityLog(
            user_id=current_user.id,
            action="detect_language",
            resource_type="text",
            details={"language": language}
        )
        db.add(activity)
        db.commit()
        
        return {"language": language, "confidence": confidence}
        
    except Exception as e:
        logger.error(f"Language detection failed: {e}")
        return {"language": "english", "confidence": 0.5}
    
    
@app.post("/api/extract/{document_type}", response_model=schemas.UploadResponse)
async def extract_document(
    document_type: str,
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    translate_to: Optional[str] = Form(None),
    translate_all: bool = Form(True),
    current_user: models.User = Depends(auth.get_current_user),  # Add auth
    db: Session = Depends(get_db)
):
    valid_types = ['id-card', 'invoice', 'passport', 'contract']
    if document_type not in valid_types:
        raise HTTPException(400, f"Invalid document type. Must be one of: {valid_types}")
    
    # Use actual user ID
    batch = models.Batch(
        user_id=current_user.id,
        document_type=document_type,
        status="processing",
        total_documents=len(files),
        storage_path=str(storage.get_batch_path(0)).replace(str(storage.uploads_path), '')
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    
    for idx, file in enumerate(files):
        content = await file.read()
        if len(content) > settings.MAX_FILE_SIZE:
            raise HTTPException(400, f"File {file.filename} exceeds maximum size of 10MB")
        
        file_path, safe_filename = await storage.save_original_file(
            file_content=content,
            batch_id=batch.id,
            sequence=idx,
            original_filename=file.filename,
            mime_type=file.content_type or 'application/octet-stream'
        )
        
        doc = models.Document(
            batch_id=batch.id,
            sequence_number=idx,
            original_filename=file.filename,
            original_file_path=str(file_path),
            file_size=len(content),
            mime_type=file.content_type,
            status="pending",
            owner_id=current_user.id  # Set owner
        )
        db.add(doc)
    
    db.commit()
    processor = DocumentProcessor(db, storage)
    background_tasks.add_task(processor.process_batch, batch.id)
    
    if translate_to and translate_to != 'none':
        trans_req = models.TranslationRequest(
            batch_id=batch.id,
            target_language=translate_to,
            translate_all_fields=translate_all
        )
        db.add(trans_req)
        db.commit()
    
    # Log activity
    activity = models.UserActivityLog(
        user_id=current_user.id,
        action="upload",
        resource_type="batch",
        resource_id=batch.id,
        details={"document_type": document_type, "file_count": len(files)}
    )
    db.add(activity)
    db.commit()
    
    return {
        "batch_id": batch.id,
        "status": "processing",
        "total_documents": len(files),
        "message": f"Processing {len(files)} document(s)"
    }

@app.post("/api/translate", response_model=TranslationResponse)
async def translate_text(
    request: TranslationRequest,
    current_user: models.User = Depends(auth.get_current_user)
):
    """Translate text via AI service"""
    try:
        translated = await ai_client_instance.translate_text(
            request.text,
            request.target_language,
            request.source_language
        )
        return TranslationResponse(
            translated_text=translated,
            source_language=request.source_language or "auto",
            target_language=request.target_language
        )
    except Exception as e:
        logger.error(f"Translation failed: {e}")
        return TranslationResponse(
            translated_text=request.text,
            source_language="unknown",
            target_language=request.target_language
        )

@app.get("/api/batch/{batch_id}/progress", response_model=schemas.BatchProgress)
async def get_batch_progress(
    batch_id: int, 
    current_user: models.User = Depends(auth.get_current_user),  # Add auth
    db: Session = Depends(get_db)
):
    batch = db.query(models.Batch).filter(models.Batch.id == batch_id).first()
    if not batch: 
        raise HTTPException(404, "Batch not found")
    
    # Check access: admin, owner, or manager of owner
    has_access = auth.check_batch_access(batch, current_user, db)
    if not has_access:
        raise HTTPException(403, "Not authorized to access this batch")
    
    documents = db.query(models.Document).filter(models.Document.batch_id == batch_id).order_by(models.Document.sequence_number).all()
    docs_progress = []
    for doc in documents:
        doc_data = {
            "id": doc.id,
            "sequence_number": doc.sequence_number,
            "status": doc.status,
            "original_filename": doc.original_filename,
            "error_message": doc.error_message,
            "processing_completed_at": doc.processing_completed_at,
        }
        if doc.status == "completed":
            fields = db.query(models.ExtractedField).filter(models.ExtractedField.document_id == doc.id).all()
            doc_data["fields"] = [{"name": f.field_name, "value": f.original_value, "confidence": f.confidence} for f in fields]
        docs_progress.append(doc_data)
    
    return {
        "batch_id": batch.id, 
        "status": batch.status, 
        "document_type": batch.document_type, 
        "total_documents": batch.total_documents, 
        "processed_documents": batch.processed_documents, 
        "documents": docs_progress
    }

@app.get("/api/batch/{batch_id}/results", response_model=schemas.BatchResult)
async def get_batch_results(
    batch_id: int, 
    current_user: models.User = Depends(auth.get_current_user),  # Add auth
    db: Session = Depends(get_db)
):
    batch = db.query(models.Batch).filter(models.Batch.id == batch_id).first()
    if not batch: 
        raise HTTPException(404, "Batch not found")
    if batch.status != "completed": 
        raise HTTPException(400, "Batch not yet completed")
    
    # Check access: admin, owner, or manager of owner
    has_access = auth.check_batch_access(batch, current_user, db)
    if not has_access:
        raise HTTPException(403, "Not authorized to access this batch")
    
    documents = db.query(models.Document).filter(models.Document.batch_id == batch_id).order_by(models.Document.sequence_number).all()
    docs_result = []
    for doc in documents:
        fields = db.query(models.ExtractedField).filter(models.ExtractedField.document_id == doc.id).all()
        doc_data = {
            "id": doc.id, 
            "sequence_number": doc.sequence_number, 
            "status": doc.status, 
            "original_filename": doc.original_filename,
            "fields": [{"name": f.field_name, "value": f.original_value, "confidence": f.confidence} for f in fields]
        }
        docs_result.append(doc_data)
    
    return {
        "batch_id": batch.id, 
        "status": batch.status, 
        "document_type": batch.document_type, 
        "total_documents": batch.total_documents, 
        "processed_documents": batch.processed_documents, 
        "documents": docs_result,
        "created_at": getattr(batch, 'created_at', None),
        "completed_at": getattr(batch, 'completed_at', None)
    }

"""@app.get("/api/batch/{batch_id}/pdf")
async def download_batch_pdf(
    batch_id: int, 
    current_user: models.User = Depends(auth.get_current_user),  # Add auth
    db: Session = Depends(get_db)
):
    """"""genrate and download PDF report for a batch"""""""
    from app.pdf_generator import generate_pdf

    batch = db.query(models.Batch).filter(models.Batch.id == batch_id).first()
    if not batch or batch.status != "completed": 
        raise HTTPException(400, "Invalid batch status")
    
    # Check access: admin, owner, or manager of owner
    has_access = auth.check_batch_access(batch, current_user, db)
    if not has_access:
        raise HTTPException(403, "Not authorized to access this batch")

    pdf_path = storage.get_report_path(batch_id)
    
    # Log activity
    activity = models.UserActivityLog(
        user_id=current_user.id,
        action="download_pdf",
        resource_type="batch",
        resource_id=batch_id
    )
    db.add(activity)
    db.commit()
    
    return FileResponse(pdf_path, media_type='application/pdf', filename=f"batch_{batch_id}_report.pdf")

@app.get("/api/batch/{batch_id}/pdf")
async def download_batch_pdf(
    batch_id: int, 
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """"""Generate and download PDF report for a batch""""""
    from app.pdf_generator import generate_pdf
    from pathlib import Path
    
    batch = db.query(models.Batch).filter(models.Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(404, "Batch not found")
    
    if batch.status != "completed":
        raise HTTPException(400, f"Batch not yet completed. Current status: {batch.status}")
    
    # Check access: admin, owner, or manager of owner
    has_access = auth.check_batch_access(batch, current_user, db)
    if not has_access:
        raise HTTPException(403, "Not authorized to access this batch")
    
    try:
        # Get all documents for this batch
        documents = db.query(models.Document).filter(
            models.Document.batch_id == batch_id
        ).order_by(models.Document.sequence_number).all()
        
        if not documents:
            raise HTTPException(404, "No documents found for this batch")
        
        # Prepare cards_data for PDF generator
        cards_data = []
        for idx, doc in enumerate(documents):
            # Get extracted fields
            fields = db.query(models.ExtractedField).filter(
                models.ExtractedField.document_id == doc.id
            ).all()

            # ========== bech nchouf win el censoring 9a3d ysir ==========
            logger.info(f"BEFORE PDF - Document {doc.id} fields:")
            for f in fields[:3]:  # Show first 3 fields
                logger.info(f"  {f.field_name}: {f.original_value}")
            # ========== END DEBUG ==========
            
            # Format fields for PDF
            formatted_fields = []
            for f in fields:
                formatted_fields.append({
                    'name': f.field_name,
                    'value': f.original_value,
                    'confidence': getattr(f, 'confidence', 0.9)
                })
            
            cards_data.append({
                'index': idx,
                'fields': formatted_fields,
                'translated_fields': translated_fields
            })
        
        # Create output directory
        pdf_dir = Path("C:/temp/pfe_reports")
        pdf_dir.mkdir(parents=True, exist_ok=True)
        pdf_path = pdf_dir / f"batch_{batch_id}_report.pdf"
        
        # Generate the PDF
        await generate_pdf(
            batch_id=batch_id,
            doc_type=batch.document_type,
            cards_data=cards_data,
            output_path=pdf_path
        )
        
        logger.info(f"PDF generated for batch {batch_id}")
        
        # Log activity
        activity = models.UserActivityLog(
            user_id=current_user.id,
            action="download_pdf",
            resource_type="batch",
            resource_id=batch_id
        )
        db.add(activity)
        db.commit()
        
        return FileResponse(
            pdf_path, 
            media_type='application/pdf', 
            filename=f"batch_{batch_id}_report.pdf"
        )
        
    except Exception as e:
        logger.error(f"PDF generation failed for batch {batch_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"PDF generation error: {str(e)}")
""" 
"""@app.get("/api/batch/{batch_id}/pdf")
async def download_batch_pdf(
    batch_id: int, 
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """"""Generate and download PDF report for a batch with translations""""""
    from app.pdf_generator_weasyprint import generate_pdf
    from pathlib import Path
    
    batch = db.query(models.Batch).filter(models.Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(404, "Batch not found")
    
    if batch.status != "completed":
        raise HTTPException(400, f"Batch not yet completed. Current status: {batch.status}")
    
    # Check access: admin, owner, or manager of owner
    has_access = auth.check_batch_access(batch, current_user, db)
    if not has_access:
        raise HTTPException(403, "Not authorized to access this batch")
    
    try:
        # Check if translation was requested for this batch
        translation_req = db.query(models.TranslationRequest).filter(
            models.TranslationRequest.batch_id == batch_id
        ).first()
        
        # Get all documents for this batch
        documents = db.query(models.Document).filter(
            models.Document.batch_id == batch_id
        ).order_by(models.Document.sequence_number).all()
        
        if not documents:
            raise HTTPException(404, "No documents found for this batch")
        
        # Prepare cards_data for PDF generator
        cards_data = []
        for idx, doc in enumerate(documents):
            # Get extracted fields
            fields = db.query(models.ExtractedField).filter(
                models.ExtractedField.document_id == doc.id
            ).all()
            
            # Format fields for PDF
            formatted_fields = []
            for f in fields:
                formatted_fields.append({
                    'name': f.field_name,
                    'value': f.original_value,
                    'confidence': getattr(f, 'confidence', 0.9)
                })
            
            # Get translated fields if translation was requested
            translated_fields = None
            if translation_req:
                # Check if there are translated fields stored
                # Assuming you have a TranslatedField model
                translated_list = db.query(models.TranslatedField).filter(
                    models.TranslatedField.document_id == doc.id,
                    models.TranslatedField.language == translation_req.target_language
                ).all()
                
                if translated_list:
                    translated_fields = []
                    for tf in translated_list:
                        translated_fields.append({
                            'name': tf.field_name,
                            'value': tf.translated_value
                        })
            
            cards_data.append({
                'index': idx,
                'fields': formatted_fields,
                'translated_fields': translated_fields
            })
        
        # Create output directory (use /tmp for Linux/Docker)
        pdf_dir = Path("/tmp/pfe_reports")
        pdf_dir.mkdir(parents=True, exist_ok=True)
        pdf_path = pdf_dir / f"batch_{batch_id}_report.pdf"
        
        # Generate the PDF
        await generate_pdf(
            batch_id=batch_id,
            doc_type=batch.document_type,
            cards_data=cards_data,
            output_path=pdf_path
        )
        
        logger.info(f"PDF generated for batch {batch_id}")
        
        # Log activity
        activity = models.UserActivityLog(
            user_id=current_user.id,
            action="download_pdf",
            resource_type="batch",
            resource_id=batch_id
        )
        db.add(activity)
        db.commit()
        
        return FileResponse(
            pdf_path, 
            media_type='application/pdf', 
            filename=f"batch_{batch_id}_report.pdf"
        )
        
    except Exception as e:
        logger.error(f"PDF generation failed for batch {batch_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"PDF generation error: {str(e)}")

"""
@app.post("/api/batch/{batch_id}/pdf")
async def download_batch_pdf(
    batch_id: int,
    request: Request,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Generate PDF with translations from frontend"""
    from app.pdf_generator_weasyprint import generate_pdf
    from pathlib import Path
    import json
    
    # Get data from frontend request body
    try:
        body = await request.json()
    except:
        body = {}
    
    documents_data = body.get('documents', [])
    target_language = body.get('target_language', None)
    
    batch = db.query(models.Batch).filter(models.Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(404, "Batch not found")
    
    if batch.status != "completed":
        raise HTTPException(400, f"Batch not yet completed")
    
    # Check access
    has_access = auth.check_batch_access(batch, current_user, db)
    if not has_access:
        raise HTTPException(403, "Not authorized")
    
    try:
        # Prepare cards_data for PDF generator using data from frontend
        cards_data = []
        for idx, doc_data in enumerate(documents_data):
            formatted_fields = []
            for f in doc_data.get('fields', []):
                formatted_fields.append({
                    'name': f.get('name'),
                    'value': f.get('value'),
                    'confidence': f.get('confidence', 0.9)
                })
            
            # Get translated fields from frontend data
            translated_fields = doc_data.get('translated_fields', None)
            
            cards_data.append({
                'index': idx,
                'fields': formatted_fields,
                'translated_fields': translated_fields  # Now using frontend translations!
            })
        
        # Create output directory
        import sys
        if sys.platform == "win32":
            pdf_dir = Path("C:/temp/pfe_reports")
        else:
            pdf_dir = Path("/tmp/pfe_reports")
        
        pdf_dir.mkdir(parents=True, exist_ok=True)
        pdf_path = pdf_dir / f"batch_{batch_id}_report.pdf"
        
        # Generate PDF
        await generate_pdf(
            batch_id=batch_id,
            doc_type=batch.document_type,
            cards_data=cards_data,
            output_path=pdf_path
        )
        
        # Log activity
        activity = models.UserActivityLog(
            user_id=current_user.id,
            action="download_pdf",
            resource_type="batch",
            resource_id=batch_id,
            details={"target_language": target_language} if target_language else {}
        )
        db.add(activity)
        db.commit()
        
        return FileResponse(
            pdf_path,
            media_type='application/pdf',
            filename=f"batch_{batch_id}_report.pdf"
        )
        
    except Exception as e:
        logger.error(f"PDF generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"PDF generation error: {str(e)}")
    
    
# ==== delete batch====
@app.delete("/api/batch/{batch_id}")
async def delete_batch(
    batch_id: int, 
    current_user: models.User = Depends(auth.get_current_user),  # Add auth
    db: Session = Depends(get_db)
):
    batch = db.query(models.Batch).filter(models.Batch.id == batch_id).first()
    if not batch: 
        raise HTTPException(404, "Batch not found")
    
    # Only admin or owner can delete
    if current_user.role != "admin" and batch.user_id != current_user.id:
        raise HTTPException(403, "Not authorized to delete this batch")
    
    await storage.delete_batch_files(batch_id)
    db.delete(batch)
    db.commit()
    
    # Log activity
    activity = models.UserActivityLog(
        user_id=current_user.id,
        action="delete_batch",
        resource_type="batch",
        resource_id=batch_id
    )
    db.add(activity)
    db.commit()
    
    return {"message": f"Batch {batch_id} deleted successfully"}

#=====text extraction=====
@app.post("/api/extract-text")
async def extract_text_from_file(
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Extract text from uploaded file (for language detection)"""
    import tempfile
    import aiofiles
    from PIL import Image
    import pytesseract
    import pdf2image
    
    temp_path = f"/tmp/{uuid.uuid4()}_{file.filename}"
    async with aiofiles.open(temp_path, 'wb') as f:
        content = await file.read()
        await f.write(content)
    
    try:
        file_path = Path(temp_path)
        file_ext = file_path.suffix.lower()
        extracted_text = ""
        
        # Handle images
        if file_ext in ['.jpg', '.jpeg', '.png', '.tiff', '.bmp']:
            image = Image.open(file_path)
            extracted_text = pytesseract.image_to_string(image)
        
        # Handle PDF files
        elif file_ext == '.pdf':
            images = pdf2image.convert_from_path(file_path, dpi=300)
            for image in images:
                page_text = pytesseract.image_to_string(image)
                extracted_text += page_text + "\n"
        
        # Handle text files
        else:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                extracted_text = f.read()
        
        return {"text": extracted_text[:5000]}
    except Exception as e:
        logger.error(f"Text extraction failed: {e}")
        return {"text": ""}
    finally:
        os.unlink(temp_path)


# ========== DASHBOARD ENDPOINT WITH FILTERING ==========

class DashboardFilter(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    user_id: Optional[int] = None
    document_type: Optional[str] = None
    status: Optional[str] = None
    search: Optional[str] = None

@app.post("/api/dashboard/filtered")
async def get_filtered_dashboard(
    filters: DashboardFilter,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Get dashboard data with advanced filtering"""
    # Base query - users can only see their own and subordinates' documents
    visible_user_ids = [current_user.id]
    
    if current_user.role == "admin":
        # Admin sees all users
        user_query = db.query(models.User)
    elif current_user.role == "manager":
        # Manager sees themselves + subordinates
        def get_team_ids(manager_id):
            team = [manager_id]
            subordinates = db.query(models.User).filter(models.User.manager_id == manager_id).all()
            for sub in subordinates:
                team.extend(get_team_ids(sub.id))
            return team
        visible_user_ids = get_team_ids(current_user.id)
        user_query = db.query(models.User).filter(models.User.id.in_(visible_user_ids))
    else:
        # Regular user sees only themselves
        user_query = db.query(models.User).filter(models.User.id == current_user.id)
    
    # Get all batches for visible users
    batch_query = db.query(models.Batch).filter(models.Batch.user_id.in_(visible_user_ids))
    
    # Apply filters
    if filters.start_date:
        batch_query = batch_query.filter(models.Batch.created_at >= filters.start_date)
    if filters.end_date:
        # Add one day to include the end date
        end = datetime.combine(filters.end_date, datetime.max.time())
        batch_query = batch_query.filter(models.Batch.created_at <= end)
    if filters.document_type:
        batch_query = batch_query.filter(models.Batch.document_type == filters.document_type)
    if filters.status:
        batch_query = batch_query.filter(models.Batch.status == filters.status)
    
    batches = batch_query.order_by(models.Batch.created_at.desc()).all()
    
    # Get statistics
    total_documents = db.query(models.Document).join(models.Batch).filter(
        models.Batch.user_id.in_(visible_user_ids)
    ).count()
    
    completed_documents = db.query(models.Document).join(models.Batch).filter(
        models.Batch.user_id.in_(visible_user_ids),
        models.Document.status == "completed"
    ).count()
    
    # Get documents per user
    user_stats = []
    for user in user_query.all():
        user_batches = db.query(models.Batch).filter(models.Batch.user_id == user.id)
        if filters.start_date:
            user_batches = user_batches.filter(models.Batch.created_at >= filters.start_date)
        if filters.end_date:
            end = datetime.combine(filters.end_date, datetime.max.time())
            user_batches = user_batches.filter(models.Batch.created_at <= end)
        
        batch_count = user_batches.count()
        doc_count = db.query(models.Document).join(models.Batch).filter(
            models.Batch.user_id == user.id
        ).count()
        
        user_stats.append({
            "user_id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role,
            "batch_count": batch_count,
            "document_count": doc_count
        })
    
    return {
        "summary": {
            "total_users": user_query.count(),
            "total_batches": len(batches),
            "total_documents": total_documents,
            "completed_documents": completed_documents,
            "completion_rate": (completed_documents / total_documents * 100) if total_documents > 0 else 0
        },
        "user_stats": user_stats,
        "batches": [
            {
                "id": b.id,
                "user_id": b.user_id,
                "document_type": b.document_type,
                "status": b.status,
                "total_documents": b.total_documents,
                "processed_documents": b.processed_documents,
                "created_at": b.created_at,
                "completed_at": b.completed_at,
                "user": {
                    "username": next((u.username for u in user_query.all() if u.id == b.user_id), "Unknown"),
                    "full_name": next((u.full_name for u in user_query.all() if u.id == b.user_id), "Unknown")
                }
            }
            for b in batches
        ]
    }

# ========== SELENIUM MAP ENDPOINT ==========
@app.get("/api/map/{batch_id}/{document_index}")
async def get_selenium_map(
    batch_id: int, 
    document_index: int, 
    current_user: models.User = Depends(auth.get_current_user),  # Add auth
    db: Session = Depends(get_db)
):
    logger.info(f"🚀 SELENIUM MAP ENDPOINT CALLED - batch_id: {batch_id}, document_index: {document_index}")
    
    try:
        # Check batch access first
        batch = db.query(models.Batch).filter(models.Batch.id == batch_id).first()
        if not batch:
            raise HTTPException(404, "Batch not found")
        
        has_access = auth.check_batch_access(batch, current_user, db)
        if not has_access:
            raise HTTPException(403, "Not authorized to access this batch")
        
        doc = db.query(models.Document).filter(
            models.Document.batch_id == batch_id,
            models.Document.sequence_number == document_index
        ).first()

        if not doc:
            raise HTTPException(404, "Document not found")
    
        address_field = db.query(models.ExtractedField).filter(
            models.ExtractedField.document_id == doc.id,
            models.ExtractedField.field_name.ilike('%address%')
        ).first()
    
        if not address_field or not address_field.original_value:
            return HTMLResponse(content="<div style='font-family:sans-serif;padding:20px;color:#666;'>📍 No address extracted for this document.</div>")
    
        map_html = selenium_map.get_map_as_html(address_field.original_value)
        
        # Log activity
        activity = models.UserActivityLog(
            user_id=current_user.id,
            action="view_map",
            resource_type="document",
            resource_id=doc.id
        )
        db.add(activity)
        db.commit()
        
        return HTMLResponse(content=map_html, status_code=200)
        
    except Exception as e:
        logger.error(f"❌ Selenium map endpoint error: {e}", exc_info=True)
        return HTMLResponse(
            content=f'<div style="font-family:sans-serif;padding:20px;color:#d32f2f;">Error loading map: {str(e)}</div>',
            status_code=500
        )

@app.get("/api/test-selenium")
async def test_selenium():
    try:
        result = selenium_map.get_map_as_html("Tunis, Tunisia")
        return HTMLResponse(content=result, status_code=200)
    except Exception as e:
        logger.error(f"❌ Selenium test failed: {e}", exc_info=True)
        return JSONResponse(content={"error": str(e)}, status_code=500)
    


#----Pass Reset-----
class ForgotPasswordRequest(BaseModel):
    email: EmailStr 

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class ValidateTokenRequest(BaseModel):
    token: str


@app.post("/api/auth/forgot-password")
async def forgot_password(
    request: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Request a password reset email.
    Sends a reset link to the user's email if it exists.
    """
    # Find user by email
    user = db.query(models.User).filter(models.User.email == request.email).first()
    
    # Always return same message for security (don't reveal if email exists)
    if not user:
        return {"message": "If your email is registered, you will receive a reset link"}
    
    # Create password reset token
    reset_request = models.PasswordReset(
        user_id=user.id,
        token=secrets.token_urlsafe(32),
        expires_at=datetime.utcnow() + timedelta(hours=24),
        is_used=False
    )
    db.add(reset_request)
    db.commit()
    
    # Generate reset link
    reset_link = f"{settings.APP_URL}/reset-password?token={reset_request.token}"
    
    # Send email in background
    background_tasks.add_task(
        send_password_reset_email_background,
        to_email=user.email,
        reset_link=reset_link
    )
    
    logger.info(f"Password reset email queued for {user.email}")
    
    return {"message": "If your email is registered, you will receive a reset link"}


@app.post("/api/auth/reset-password")
async def reset_password(
    request: ResetPasswordRequest,
    db: Session = Depends(get_db)
):
    """
    Reset password using a valid token.
    """
    result = PasswordResetService.reset_password(db, request.token, request.new_password)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    
    return result


@app.post("/api/auth/validate-reset-token")
async def validate_reset_token(
    request: ValidateTokenRequest,
    db: Session = Depends(get_db)
):
    """
    Validate if a reset token is valid.
    Used to check before showing the reset form.
    """
    result = PasswordResetService.validate_token(db, request.token)
    
    if not result["valid"]:
        raise HTTPException(status_code=400, detail=result["message"])
    
    return result
