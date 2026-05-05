from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from datetime import datetime
import logging
import secrets
import string

from ..database import get_db
from .. import models
from ..auth import get_current_user, require_role, send_credentials_email_background
from ..services.email_service import email_service

router = APIRouter(prefix="/api/admin", tags=["Admin"])
logger = logging.getLogger(__name__)


# ========== PERMISSIONS ==========

@router.get("/permissions")
async def get_permissions(
    current_user: models.User = Depends(require_role("profile_admin")),
    db: Session = Depends(get_db)
):
    """Get all available permissions (for the checklist)"""
    perms = db.query(models.Permission).all()
    return [{"id": p.id, "name": p.name, "description": p.description} for p in perms]


@router.post("/permissions/seed")
async def seed_permissions(
    current_user: models.User = Depends(require_role("profile_admin")),
    db: Session = Depends(get_db)
):
    """Add default permissions (run once)"""
    defaults = [
        {"name": "idcard", "description": "ID Card data extraction"},
        {"name": "invoice", "description": "Invoice data extraction"},
        {"name": "contract", "description": "Contract data extraction"},
        {"name": "passport", "description": "Passport data extraction"},
        {"name": "view_subordinates", "description": "View subordinates and their documents (CRUD)"},
    ]
    
    created = []
    for perm in defaults:
        exists = db.query(models.Permission).filter(models.Permission.name == perm["name"]).first()
        if not exists:
            db.add(models.Permission(**perm))
            created.append(perm["name"])
    
    db.commit()
    return {"message": f"Created permissions: {created}"}


@router.get("/users/active")
async def get_active_users(
    current_user: models.User = Depends(require_role("profile_admin")),
    db: Session = Depends(get_db)
):
    """Get all active users (for subordinate selection)"""
    users = db.query(models.User).filter(
        models.User.is_active == True,
        models.User.id != current_user.id
    ).all()
    
    return [
        {
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "email": u.email
        }
        for u in users
    ]


@router.get("/available-managers")
async def get_available_managers(
    current_user: models.User = Depends(require_role("profile_admin")),
    db: Session = Depends(get_db)
):
    """Get all users who can be managers (have view_subordinates permission)"""
    view_perm = db.query(models.Permission).filter(models.Permission.name == "view_subordinates").first()
    
    if not view_perm:
        return []
    
    users_with_perm = db.query(models.UserPermission).filter(
        models.UserPermission.permission_id == view_perm.id
    ).all()
    
    user_ids = [up.user_id for up in users_with_perm]
    users = db.query(models.User).filter(
        models.User.id.in_(user_ids),
        models.User.is_active == True
    ).all()
    
    return [
        {
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "email": u.email
        }
        for u in users
    ]


# ========== USER MANAGEMENT ==========

@router.get("/users")
async def get_users(
    status: Optional[str] = Query(None, regex="^(active|inactive|all)$"),
    search: Optional[str] = None,
    current_user: models.User = Depends(require_role("profile_admin")),
    db: Session = Depends(get_db)
):
    """Get all users with filters"""
    query = db.query(models.User)
    
    if status == "active":
        query = query.filter(models.User.is_active == True)
    elif status == "inactive":
        query = query.filter(models.User.is_active == False)
    
    if search:
        query = query.filter(
            or_(
                models.User.username.ilike(f"%{search}%"),
                models.User.email.ilike(f"%{search}%"),
                models.User.full_name.ilike(f"%{search}%")
            )
        )
    
    users = query.order_by(models.User.created_at.desc()).all()
    
    result = []
    for user in users:
        user_perms = db.query(models.UserPermission).filter(
            models.UserPermission.user_id == user.id
        ).all()
        
        # Get subordinates if user is manager
        subordinates = []
        if user.role == "manager":
            subs = db.query(models.User).filter(
                models.User.manager_id == user.id,
                models.User.is_active == True
            ).all()
            subordinates = [{"id": s.id, "username": s.username, "full_name": s.full_name} for s in subs]
        
        result.append({
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value if hasattr(user.role, 'value') else user.role,
            "is_active": user.is_active,
            "created_at": user.created_at,
            "manager_id": user.manager_id,
            "permissions": [p.permission_id for p in user_perms],
            "subordinates": subordinates
        })
    
    return result


@router.post("/users")
async def create_user(
    data: dict,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(require_role("profile_admin")),
    db: Session = Depends(get_db)
):
    """Create a new user with permissions and send email"""
    from ..auth import AuthService
    
    # Check if user exists
    exists = db.query(models.User).filter(
        (models.User.email == data.get("email")) |
        (models.User.username == data.get("username"))
    ).first()
    
    if exists:
        raise HTTPException(400, "User already exists")
    
    # Generate password if not provided
    password = data.get("password")
    if not password:
        alphabet = string.ascii_letters + string.digits
        password = ''.join(secrets.choice(alphabet) for _ in range(12))
    
    # Determine role — use explicit flag sent by the frontend
    permission_ids = data.get("permission_ids", [])
    role = "manager" if data.get("is_manager", False) else "viewer"

    # Create user
    new_user = models.User(
        email=data.get("email"),
        username=data.get("username"),
        hashed_password=AuthService.get_password_hash(password),
        full_name=data.get("full_name"),
        role=role,
        is_active=True,
        created_by=current_user.id,
        manager_id=data.get("manager_id") if role == "manager" else None
    )

    db.add(new_user)
    db.flush()

    # Assign permissions
    for perm_id in permission_ids:
        perm = db.query(models.Permission).filter(models.Permission.id == perm_id).first()
        if perm:
            db.add(models.UserPermission(
                user_id=new_user.id,
                permission_id=perm_id,
                granted_by=current_user.id
            ))

    # Assign subordinates — always process if any IDs provided and user is a manager
    subordinate_ids = data.get("subordinate_ids", [])
    if subordinate_ids and role == "manager":
        for sub_id in subordinate_ids:
            subordinate = db.query(models.User).filter(models.User.id == sub_id).first()
            if subordinate:
                subordinate.manager_id = new_user.id

    db.commit()
    
    # Send email
    background_tasks.add_task(
        send_credentials_email_background,
        to_email=new_user.email,
        username=new_user.username,
        password=password,
        full_name=new_user.full_name
    )
    
    return {
        "message": f"User {data.get('username')} created",
        "user_id": new_user.id,
        "role": role,
        "email_sent": True
    }


@router.patch("/users/{user_id}/status")
async def toggle_status(
    user_id: int,
    current_user: models.User = Depends(require_role("profile_admin")),
    db: Session = Depends(get_db)
):
    """Activate or deactivate a user"""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    
    if user.id == current_user.id:
        raise HTTPException(400, "Cannot change your own status")
    
    user.is_active = not user.is_active
    db.commit()
    
    status = "activated" if user.is_active else "deactivated"
    return {"message": f"User {status}", "is_active": user.is_active}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: models.User = Depends(require_role("profile_admin")),
    db: Session = Depends(get_db)
):
    """Delete a user"""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    
    if user.id == current_user.id:
        raise HTTPException(400, "Cannot delete yourself")
    
    db.delete(user)
    db.commit()
    
    return {"message": f"User {user.username} deleted"}

# ========== profile editing ==========

@router.get("/users/{user_id}")
async def get_user_by_id(
    user_id: int,
    current_user: models.User = Depends(require_role("profile_admin")),
    db: Session = Depends(get_db)
):
    """Get a specific user by ID (for profile admin editing)"""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    
    # Get user permissions as IDs
    user_perms = db.query(models.UserPermission).filter(
        models.UserPermission.user_id == user.id
    ).all()
    
    # Get subordinates if user is manager
    subordinates = []
    if user.role == "manager":
        subs = db.query(models.User).filter(
            models.User.manager_id == user.id,
            models.User.is_active == True
        ).all()
        subordinates = [{"id": s.id, "username": s.username, "full_name": s.full_name} for s in subs]
    
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role.value if hasattr(user.role, 'value') else user.role,
        "is_active": user.is_active,
        "created_at": user.created_at,
        "manager_id": user.manager_id,
        "permissions": [p.permission_id for p in user_perms],  # This is key
        "subordinates": subordinates
    }


@router.put("/users/{user_id}")
async def update_user_by_id(
    user_id: int,
    user_update: dict,
    current_user: models.User = Depends(require_role("profile_admin")),
    db: Session = Depends(get_db)
):
    """Update a specific user by ID (for profile admin editing)"""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    
    # Update basic fields
    if "full_name" in user_update:
        user.full_name = user_update["full_name"]
    if "email" in user_update:
        user.email = user_update["email"]
    
    db.commit()
    db.refresh(user)
    
    return {
        "message": "User updated successfully",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value if hasattr(user.role, 'value') else user.role,
            "is_active": user.is_active
        }
    }

@router.put("/users/{user_id}/full")
async def update_user_full(
    user_id: int,
    user_update: dict,
    current_user: models.User = Depends(require_role("profile_admin")),
    db: Session = Depends(get_db)
):
    """FULL update a user (for profile admin) - can update all fields"""
    from ..auth import AuthService
    
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    
    # Update basic fields
    if "username" in user_update:
        # Check if username is taken
        existing = db.query(models.User).filter(
            models.User.username == user_update["username"],
            models.User.id != user_id
        ).first()
        if existing:
            raise HTTPException(400, "Username already taken")
        user.username = user_update["username"]
    
    if "email" in user_update:
        # Check if email is taken
        existing = db.query(models.User).filter(
            models.User.email == user_update["email"],
            models.User.id != user_id
        ).first()
        if existing:
            raise HTTPException(400, "Email already taken")
        user.email = user_update["email"]
    
    if "full_name" in user_update:
        user.full_name = user_update["full_name"]
    
    if "role" in user_update:
        user.role = user_update["role"]
    
    if "is_active" in user_update:
        user.is_active = user_update["is_active"]
    
    if "manager_id" in user_update:
        user.manager_id = user_update["manager_id"]
    
    # Update password if provided
    if "password" in user_update and user_update["password"]:
        if len(user_update["password"]) < 6:
            raise HTTPException(400, "Password must be at least 6 characters")
        user.hashed_password = AuthService.get_password_hash(user_update["password"])
    
    # Update permissions
    if "permission_ids" in user_update:
        db.query(models.UserPermission).filter(
            models.UserPermission.user_id == user_id
        ).delete()

        for perm_id in user_update["permission_ids"]:
            perm = db.query(models.Permission).filter(models.Permission.id == perm_id).first()
            if perm:
                db.add(models.UserPermission(
                    user_id=user_id,
                    permission_id=perm_id,
                    granted_by=current_user.id
                ))

    # Update subordinates — clear old ones and set new ones
    if "subordinate_ids" in user_update:
        # Remove any users that currently report to this manager
        db.query(models.User).filter(
            models.User.manager_id == user_id
        ).update({"manager_id": None})

        for sub_id in user_update["subordinate_ids"]:
            sub = db.query(models.User).filter(models.User.id == sub_id).first()
            if sub:
                sub.manager_id = user_id

    db.commit()
    
    return {
        "message": "User updated successfully",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value if hasattr(user.role, 'value') else user.role,
            "is_active": user.is_active,
            "manager_id": user.manager_id
        }
    }



# ========== DOCUMENT MANAGEMENT ==========

@router.get("/documents")
async def get_documents(
    status: Optional[str] = None,
    user_id: Optional[int] = None,
    current_user: models.User = Depends(require_role("profile_admin")),
    db: Session = Depends(get_db)
):
    """Get all documents with filters"""
    query = db.query(models.Document).join(models.Batch)
    
    if status:
        query = query.filter(models.Document.status == status)
    if user_id:
        query = query.filter(models.Batch.user_id == user_id)
    
    docs = query.order_by(models.Document.created_at.desc()).all()
    
    result = []
    for doc in docs:
        batch = db.query(models.Batch).filter(models.Batch.id == doc.batch_id).first()
        owner = db.query(models.User).filter(models.User.id == batch.user_id).first() if batch else None
        
        result.append({
            "id": doc.id,
            "filename": doc.original_filename,
            "status": doc.status,
            "owner": owner.username if owner else "Unknown",
            "owner_id": batch.user_id if batch else None,
            "created_at": doc.created_at
        })
    
    return result


@router.patch("/documents/{doc_id}/status")
async def update_document_status(
    doc_id: int,
    data: dict,
    current_user: models.User = Depends(require_role("profile_admin")),
    db: Session = Depends(get_db)
):
    """Change document status"""
    doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    
    doc.status = data.get("status")
    db.commit()
    
    return {"message": "Status updated", "new_status": doc.status}


@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: int,
    current_user: models.User = Depends(require_role("profile_admin")),
    db: Session = Depends(get_db)
):
    """Delete a document"""
    doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    
    db.delete(doc)
    db.commit()
    
    return {"message": "Document deleted"}


@router.get("/documents/{doc_id}/view")
async def view_document(
    doc_id: int,
    current_user: models.User = Depends(require_role("profile_admin")),
    db: Session = Depends(get_db)
):
    """View document file"""
    from fastapi.responses import FileResponse
    import os
    
    doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    
    if not os.path.exists(doc.original_file_path):
        raise HTTPException(404, "File not found on server")
    
    return FileResponse(
        path=doc.original_file_path,
        filename=doc.original_filename,
        media_type="application/octet-stream"
    )