from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey, Float, BigInteger, Index, Text, Boolean, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB
import enum
from datetime import datetime
from .database import Base

# Enums for role management
class UserRole(str, enum.Enum):
    ADMIN = "admin"
    PROFILE_ADMIN = "profile_admin"
    SYSTEM_ADMIN = "system_admin"
    MANAGER = "manager"
    OPERATOR = "operator"
    VIEWER = "viewer"


class Permission(Base):
    __tablename__ = "permissions"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    description = Column(String)
    
    # Relationships
    users = relationship("UserPermission", back_populates="permission")


# User-Permission association table
class UserPermission(Base):
    __tablename__ = "user_permissions"
    
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    permission_id = Column(Integer, ForeignKey("permissions.id"), primary_key=True)
    granted_at = Column(DateTime, default=datetime.utcnow)
    granted_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="user_permissions", foreign_keys=[user_id])
    permission = relationship("Permission", back_populates="users")
    granter = relationship("User", foreign_keys=[granted_by])



#-----------------------------------
class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, nullable=False)
    username = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255))
    role = Column(Enum(UserRole), default=UserRole.VIEWER, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Hierarchy relationship (manager-subordinate)
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    subordinates = relationship("User", backref="manager", remote_side=[id], foreign_keys=[manager_id])
    
    # User permissions (additional fine-grained control beyond roles)
    permissions_json = Column(JSONB, default={})
    
    # Relationships to other tables
    batches = relationship("Batch", back_populates="user", cascade="all, delete-orphan")
    creator = relationship("User", remote_side=[id], foreign_keys=[created_by])
    
    # Relationship to UserPermission table
    user_permissions = relationship("UserPermission", back_populates="user", cascade="all, delete-orphan", foreign_keys=[UserPermission.user_id])

    # Document access relationships
    document_access = relationship("UserDocumentAccess", 
                                   foreign_keys="UserDocumentAccess.user_id",
                                   back_populates="user", 
                                   cascade="all, delete-orphan")
    
    granted_access = relationship("UserDocumentAccess",
                                  foreign_keys="UserDocumentAccess.granted_by",
                                  back_populates="granter",
                                  cascade="all, delete-orphan")
    
    activity_logs = relationship("UserActivityLog", back_populates="user", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index('idx_users_email', 'email'),
        Index('idx_users_username', 'username'),
        Index('idx_users_role', 'role'),
        Index('idx_users_manager', 'manager_id'),
        Index('idx_users_active', 'is_active'),
    )
    

#------------------------------
class Batch(Base):
    __tablename__ = "batches"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    document_type = Column(String(50), nullable=False)
    status = Column(String(20), default='processing')
    total_documents = Column(Integer, nullable=False)
    processed_documents = Column(Integer, default=0)
    storage_path = Column(String(500))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True))
    
    user = relationship("User", back_populates="batches")
    documents = relationship("Document", back_populates="batch", cascade="all, delete-orphan")
    translation_requests = relationship("TranslationRequest", back_populates="batch", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index('idx_batches_status', 'status'),
        Index('idx_batches_user', 'user_id'),
        Index('idx_batches_created', 'created_at'),
        Index('idx_batches_type', 'document_type'),
    )


#----------------------------
class Document(Base):
    __tablename__ = "documents"
    
    id = Column(Integer, primary_key=True)
    batch_id = Column(Integer, ForeignKey("batches.id", ondelete='CASCADE'), nullable=False)
    sequence_number = Column(Integer, nullable=False)
    original_filename = Column(String(255), nullable=False)
    original_file_path = Column(String(500), nullable=False)
    converted_pdf_path = Column(String(500))
    file_size = Column(BigInteger)
    mime_type = Column(String(100))
    status = Column(String(20), default='pending')
    error_message = Column(Text)
    processing_started_at = Column(DateTime(timezone=True))
    processing_completed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    batch = relationship("Batch", back_populates="documents")
    extracted_fields = relationship("ExtractedField", back_populates="document", cascade="all, delete-orphan")
    analyses = relationship("DocumentAnalysis", back_populates="document", cascade="all, delete-orphan")
    access_grants = relationship("UserDocumentAccess", back_populates="document", cascade="all, delete-orphan")
    owner = relationship("User", foreign_keys=[owner_id])
    
    __table_args__ = (
        Index('idx_documents_batch', 'batch_id'),
        Index('idx_documents_status', 'status'),
        Index('idx_documents_owner', 'owner_id'),
        Index('idx_documents_created', 'created_at'),
    )


#------------------------------
class ExtractedField(Base):
    __tablename__ = "extracted_fields"
    
    id = Column(Integer, primary_key=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete='CASCADE'), nullable=False)
    field_name = Column(String(100), nullable=False)
    field_type = Column(String(50))
    original_value = Column(Text)
    translated_value = Column(Text)
    confidence = Column(Float)
    field_metadata = Column(JSONB) 
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    document = relationship("Document", back_populates="extracted_fields")
    
    __table_args__ = (
        Index('idx_fields_document', 'document_id'),
        Index('idx_fields_name', 'field_name'),
    )


#-------------------------------------
class TranslationRequest(Base):
    __tablename__ = "translation_requests"
    
    id = Column(Integer, primary_key=True)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=False)
    target_language = Column(String(10), nullable=False)
    translate_all_fields = Column(Boolean, default=True)
    requested_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True))
    
    batch = relationship("Batch", back_populates="translation_requests")
    
    __table_args__ = (
        Index('idx_translation_batch', 'batch_id'),
    )


class DocumentAnalysis(Base):
    __tablename__ = "document_analysis"
    
    id = Column(Integer, primary_key=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete='CASCADE'), nullable=False)
    analysis_type = Column(String(50))
    result = Column(JSONB)
    confidence = Column(Float)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    document = relationship("Document", back_populates="analyses")
    
    __table_args__ = (
        Index('idx_analysis_document', 'document_id'),
        Index('idx_analysis_type', 'analysis_type'),
    )


#-----------------------------------
class UserDocumentAccess(Base):
    __tablename__ = "user_document_access"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete='CASCADE'), nullable=False)
    access_type = Column(String(50))
    granted_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    granted_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)
    
    user = relationship("User", foreign_keys=[user_id], back_populates="document_access")
    document = relationship("Document", foreign_keys=[document_id], back_populates="access_grants")
    granter = relationship("User", foreign_keys=[granted_by])
    
    __table_args__ = (
        Index('idx_user_document', 'user_id', 'document_id', unique=True),
        Index('idx_access_expires', 'expires_at'),
    )


#--------------------------------------
class UserActivityLog(Base):
    __tablename__ = "user_activity_log"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String(100), nullable=False)
    resource_type = Column(String(50))
    resource_id = Column(Integer, nullable=True)
    details = Column(JSONB, default={})
    ip_address = Column(String(50))
    user_agent = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    user = relationship("User", back_populates="activity_logs")
    
    __table_args__ = (
        Index('idx_activity_user', 'user_id'),
        Index('idx_activity_action', 'action'),
        Index('idx_activity_created', 'created_at'),
    )


#--------------------------------------
class UserSession(Base):
    __tablename__ = "user_sessions"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token_jti = Column(String(255), unique=True, nullable=False, index=True)
    device_name = Column(String(100))
    ip_address = Column(String(50))
    user_agent = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_active = Column(Boolean, default=True)
    
    user = relationship("User")
    
    __table_args__ = (
        Index('idx_session_token', 'token_jti'),
        Index('idx_session_expires', 'expires_at'),
    )


#-------------------------------------------------
class PasswordReset(Base):
    __tablename__ = "password_resets"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String(255), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    user = relationship("User", backref="password_resets")
    
    __table_args__ = (
        Index('idx_password_resets_token', 'token'),
        Index('idx_password_resets_expires', 'expires_at'),
    )

#---------------------------------------
# hdha lel sys admin

class SystemLog(Base):
    __tablename__ = "system_logs"
    
    id = Column(Integer, primary_key=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    level = Column(String(20))  # INFO, WARNING, ERROR, CRITICAL
    source = Column(String(100))  # backend, ai-service, db, selenium
    message = Column(Text)
    details = Column(JSONB, default={})
    
    __table_args__ = (
        Index('idx_system_logs_timestamp', 'timestamp'),
        Index('idx_system_logs_level', 'level'),
        Index('idx_system_logs_source', 'source'),
    )


class AICallLog(Base):
    __tablename__ = "ai_call_logs"
    
    id = Column(Integer, primary_key=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    call_type = Column(String(50))  # extract, detect_language, translate
    success = Column(Boolean, default=True)
    response_time_ms = Column(Integer)
    mock_used = Column(Boolean, default=False)
    error_message = Column(Text)
    extra_data = Column(JSONB, default={})
    
    __table_args__ = (
        Index('idx_ai_calls_timestamp', 'timestamp'),
        Index('idx_ai_calls_success', 'success'),
    )


class ServiceStatus(Base):
    __tablename__ = "service_status"
    
    id = Column(Integer, primary_key=True)
    service_name = Column(String(50), unique=True)
    service_status = Column(String(20), default="unknown")  # running, down, degraded
    last_check = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    response_time_ms = Column(Integer)
    error_count = Column(Integer, default=0)
    
    __table_args__ = (
        Index('idx_service_status_name', 'service_name'),
    )