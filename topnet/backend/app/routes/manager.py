from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from datetime import datetime, timedelta

from ..database import get_db
from .. import models
from ..auth import get_current_user, require_role

router = APIRouter(prefix="/api/manager", tags=["Manager"])


def get_team_user_ids(manager_id: int, db: Session) -> list[int]:
    """Return manager's id + all subordinate ids recursively."""
    ids = [manager_id]
    direct = db.query(models.User).filter(models.User.manager_id == manager_id).all()
    for sub in direct:
        ids.extend(get_team_user_ids(sub.id, db))
    return ids


@router.get("/subordinates")
async def get_subordinates(
    current_user: models.User = Depends(require_role("manager")),
    db: Session = Depends(get_db)
):
    subs = db.query(models.User).filter(
        models.User.manager_id == current_user.id,
        models.User.is_active == True
    ).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role.value if hasattr(u.role, "value") else u.role,
            "created_at": u.created_at,
        }
        for u in subs
    ]


@router.get("/documents")
async def get_team_documents(
    skip: int = 0,
    limit: int = 20,
    user_id: Optional[int] = None,
    search: Optional[str] = None,
    period: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: models.User = Depends(require_role("manager")),
    db: Session = Depends(get_db)
):
    """Return documents for the manager and all their subordinates."""
    team_ids = get_team_user_ids(current_user.id, db)

    # Scope to team; optionally narrow to a single team member
    if user_id:
        if user_id not in team_ids:
            raise HTTPException(403, "User is not in your team")
        visible_ids = [user_id]
    else:
        visible_ids = team_ids

    query = (
        db.query(models.Document)
        .join(models.Batch, models.Document.batch_id == models.Batch.id)
        .filter(models.Batch.user_id.in_(visible_ids))
    )

    # Search by filename
    if search:
        query = query.filter(models.Document.original_filename.ilike(f"%{search}%"))

    # Period filter
    now = datetime.utcnow()
    if period == "day":
        query = query.filter(models.Document.created_at >= now - timedelta(days=1))
    elif period == "week":
        query = query.filter(models.Document.created_at >= now - timedelta(weeks=1))
    elif period == "month":
        query = query.filter(models.Document.created_at >= now - timedelta(days=30))
    elif period == "year":
        query = query.filter(models.Document.created_at >= now - timedelta(days=365))
    elif period == "custom":
        if date_from:
            query = query.filter(models.Document.created_at >= datetime.fromisoformat(date_from))
        if date_to:
            query = query.filter(models.Document.created_at <= datetime.fromisoformat(date_to))

    total = query.count()
    docs = query.order_by(models.Document.created_at.desc()).offset(skip).limit(limit).all()

    result = []
    for doc in docs:
        owner = db.query(models.User).filter(models.User.id == doc.batch.user_id).first()
        result.append({
            "id": doc.id,
            "filename": doc.original_filename,
            "status": doc.status,
            "created_at": doc.created_at,
            "owner_id": doc.batch.user_id,
            "owner_name": owner.full_name or owner.username if owner else "Unknown",
            "batch_id": doc.batch_id,
            "document_type": doc.batch.document_type,
        })

    return {"documents": result, "total": total}


@router.get("/documents/{document_id}")
async def get_document_detail(
    document_id: int,
    current_user: models.User = Depends(require_role("manager")),
    db: Session = Depends(get_db)
):
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")

    team_ids = get_team_user_ids(current_user.id, db)
    if doc.batch.user_id not in team_ids:
        raise HTTPException(403, "Not authorized to view this document")

    fields = db.query(models.ExtractedField).filter(
        models.ExtractedField.document_id == document_id
    ).all()

    return {
        "id": doc.id,
        "filename": doc.original_filename,
        "status": doc.status,
        "created_at": doc.created_at,
        "batch_id": doc.batch_id,
        "extracted_fields": [
            {"name": f.field_name, "value": f.original_value, "confidence": f.confidence}
            for f in fields
        ],
    }


@router.get("/documents/{document_id}/download")
async def download_document(
    document_id: int,
    current_user: models.User = Depends(require_role("manager")),
    db: Session = Depends(get_db)
):
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")

    team_ids = get_team_user_ids(current_user.id, db)
    if doc.batch.user_id not in team_ids:
        raise HTTPException(403, "Not authorized to download this document")

    import os
    if not os.path.exists(doc.original_file_path):
        raise HTTPException(404, "File not found on disk")

    return FileResponse(
        doc.original_file_path,
        filename=doc.original_filename,
        media_type=doc.mime_type or "application/octet-stream"
    )
