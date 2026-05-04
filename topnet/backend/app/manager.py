from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from typing import Optional
from datetime import datetime, timedelta
import logging

from ..database import get_db
from .. import models
from ..auth import get_current_user

router = APIRouter(prefix="/api/manager", tags=["Manager"])
logger = logging.getLogger(__name__)


def get_team_ids(manager_id: int, db: Session) -> list:
    """Get all subordinate IDs recursively"""
    team = [manager_id]
    subordinates = db.query(models.User).filter(
        models.User.manager_id == manager_id,
        models.User.is_active == True
    ).all()
    
    for sub in subordinates:
        team.extend(get_team_ids(sub.id, db))
    
    return list(set(team))


@router.get("/subordinates")
async def get_subordinates(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of subordinates (view only)"""
    if current_user.role != "manager":
        raise HTTPException(403, "Manager access required")
    
    # Get all subordinates recursively
    user_ids = get_team_ids(current_user.id, db)
    user_ids = [uid for uid in user_ids if uid != current_user.id]  # Exclude self
    
    subordinates = db.query(models.User).filter(
        models.User.id.in_(user_ids),
        models.User.is_active == True
    ).all()
    
    return [
        {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role.value if hasattr(u.role, 'value') else u.role,
            "created_at": u.created_at
        }
        for u in subordinates
    ]


@router.get("/documents")
async def get_manager_documents(
    user_id: Optional[int] = Query(None, description="Filter by specific subordinate"),
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    period: Optional[str] = Query(None, regex="^(day|week|month|year)$", description="Preset period"),
    search: Optional[str] = Query(None, description="Search by filename"),
    skip: int = 0,
    limit: int = 100,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get documents for manager and their subordinates with filters"""
    
    if current_user.role != "manager":
        raise HTTPException(403, "Manager access required")
    
    # Get all team member IDs (including self)
    user_ids = get_team_ids(current_user.id, db)
    
    # Filter by specific subordinate if provided
    if user_id:
        if user_id not in user_ids:
            raise HTTPException(403, "You don't have access to this user's documents")
        user_ids = [user_id]
    
    # Query documents
    query = db.query(models.Document).join(
        models.Batch, models.Batch.id == models.Document.batch_id
    ).filter(
        models.Batch.user_id.in_(user_ids)
    )
    
    # Date filters
    if date_from:
        try:
            from_date = datetime.strptime(date_from, "%Y-%m-%d")
            query = query.filter(models.Document.created_at >= from_date)
        except ValueError:
            pass
    
    if date_to:
        try:
            to_date = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
            query = query.filter(models.Document.created_at <= to_date)
        except ValueError:
            pass
    
    # Preset period filter
    if period and not date_from and not date_to:
        now = datetime.utcnow()
        if period == "day":
            query = query.filter(models.Document.created_at >= now - timedelta(days=1))
        elif period == "week":
            query = query.filter(models.Document.created_at >= now - timedelta(days=7))
        elif period == "month":
            query = query.filter(models.Document.created_at >= now - timedelta(days=30))
        elif period == "year":
            query = query.filter(models.Document.created_at >= now - timedelta(days=365))
    
    # Search by filename
    if search:
        query = query.filter(models.Document.original_filename.ilike(f"%{search}%"))
    
    # Get total count
    total = query.count()
    
    # Get paginated results
    documents = query.order_by(models.Document.created_at.desc()).offset(skip).limit(limit).all()
    
    # Build response with user info
    result = []
    for doc in documents:
        batch = db.query(models.Batch).filter(models.Batch.id == doc.batch_id).first()
        owner = db.query(models.User).filter(models.User.id == batch.user_id).first() if batch else None
        
        result.append({
            "id": doc.id,
            "filename": doc.original_filename,
            "status": doc.status,
            "created_at": doc.created_at,
            "owner_id": batch.user_id if batch else None,
            "owner_name": owner.full_name or owner.username if owner else "Unknown",
            "batch_id": doc.batch_id
        })
    
    return {
        "total": total,
        "documents": result,
        "filters": {
            "user_id": user_id,
            "date_from": date_from,
            "date_to": date_to,
            "period": period,
            "search": search
        }
    }


@router.get("/documents/{doc_id}")
async def get_document_details(
    doc_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get document details (for viewing)"""
    
    if current_user.role != "manager":
        raise HTTPException(403, "Manager access required")
    
    # Get document with batch info
    doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    
    batch = db.query(models.Batch).filter(models.Batch.id == doc.batch_id).first()
    
    # Check access
    user_ids = get_team_ids(current_user.id, db)
    if batch.user_id not in user_ids:
        raise HTTPException(403, "You don't have access to this document")
    
    # Get extracted fields
    fields = db.query(models.ExtractedField).filter(
        models.ExtractedField.document_id == doc_id
    ).all()
    
    return {
        "id": doc.id,
        "filename": doc.original_filename,
        "status": doc.status,
        "created_at": doc.created_at,
        "owner_id": batch.user_id,
        "extracted_fields": [
            {
                "name": f.field_name,
                "value": f.original_value,
                "confidence": f.confidence
            }
            for f in fields
        ]
    }


@router.get("/documents/{doc_id}/download")
async def download_document(
    doc_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download document file"""
    from fastapi.responses import FileResponse
    import os
    
    if current_user.role != "manager":
        raise HTTPException(403, "Manager access required")
    
    doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    
    batch = db.query(models.Batch).filter(models.Batch.id == doc.batch_id).first()
    
    # Check access
    user_ids = get_team_ids(current_user.id, db)
    if batch.user_id not in user_ids:
        raise HTTPException(403, "You don't have access to this document")
    
    if not os.path.exists(doc.original_file_path):
        raise HTTPException(404, "File not found")
    
    return FileResponse(
        path=doc.original_file_path,
        filename=doc.original_filename,
        media_type="application/octet-stream"
    )