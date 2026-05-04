from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, desc
from datetime import datetime, timedelta
from typing import List, Optional
from app.database import get_db
from app.models import Batch, Document
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["dashboard"])

# Pydantic models
class DashboardStats(BaseModel):
    total_batches: int
    total_documents: int
    success_rate: float
    avg_processing_time: float  # in seconds
    documents_by_type: dict
    recent_activity: List[dict]
    processing_trend: List[dict]

class BatchSummary(BaseModel):
    batch_id: int
    document_type: str
    status: str
    created_at: datetime
    completed_at: Optional[datetime]
    total_documents: int
    processed_documents: int
    processing_time: Optional[float]  # in seconds

    class Config:
        from_attributes = True

class DailyStats(BaseModel):
    date: str
    count: int
    success_count: int
    avg_time: float

@router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(db: Session = Depends(get_db)):
    """Get overall dashboard statistics"""
    
    # Total batches and documents
    total_batches = db.query(Batch).count()
    total_documents = db.query(Document).count()
    
    # Success rate (completed without errors)
    successful_batches = db.query(Batch).filter(Batch.status == 'completed').count()
    success_rate = (successful_batches / total_batches * 100) if total_batches > 0 else 0
    
    # Average processing time for completed batches
    completed_batches = db.query(Batch).filter(
        Batch.status == 'completed',
        Batch.completed_at.isnot(None)
    ).all()
    
    avg_time = 0
    if completed_batches:
        total_time = sum(
            (b.completed_at - b.created_at).total_seconds() 
            for b in completed_batches
        )
        avg_time = total_time / len(completed_batches)
    
    # Documents by type - FIXED: Use Batch.id instead of Batch.batch_id
    doc_types = db.query(
        Batch.document_type, 
        func.count(Batch.id)  # Changed from Batch.batch_id to Batch.id
    ).group_by(Batch.document_type).all()
    
    documents_by_type = {doc_type: count for doc_type, count in doc_types}
    
    # Recent activity (last 10 batches) - FIXED: Use batch.id instead of batch.batch_id
    recent_batches = db.query(Batch).order_by(desc(Batch.created_at)).limit(10).all()
    recent_activity = []
    
    for batch in recent_batches:
        recent_activity.append({
            "batch_id": batch.id,  # Changed from batch.batch_id to batch.id
            "document_type": batch.document_type,
            "status": batch.status,
            "created_at": batch.created_at.isoformat() if batch.created_at else None,
            "documents": batch.total_documents
        })
    
    # Processing trend (last 7 days)
    last_7_days = []
    for i in range(6, -1, -1):
        date = datetime.now() - timedelta(days=i)
        next_date = date + timedelta(days=1)
        
        day_batches = db.query(Batch).filter(
            and_(
                Batch.created_at >= date,
                Batch.created_at < next_date
            )
        ).all()
        
        success_count = sum(1 for b in day_batches if b.status == 'completed')
        day_avg_time = 0
        if day_batches:
            completed = [b for b in day_batches if b.completed_at]
            if completed:
                day_avg_time = sum(
                    (b.completed_at - b.created_at).total_seconds()
                    for b in completed
                ) / len(completed)
        
        last_7_days.append({
            "date": date.strftime("%Y-%m-%d"),
            "count": len(day_batches),
            "success_count": success_count,
            "avg_time": round(day_avg_time, 1)
        })
    
    return DashboardStats(
        total_batches=total_batches,
        total_documents=total_documents,
        success_rate=round(success_rate, 1),
        avg_processing_time=round(avg_time, 1),
        documents_by_type=documents_by_type,
        recent_activity=recent_activity,
        processing_trend=last_7_days
    )

@router.get("/dashboard/batches/recent", response_model=List[BatchSummary])
async def get_recent_batches(
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """Get recent batches with details"""
    batches = db.query(Batch).order_by(desc(Batch.created_at)).limit(limit).all()
    
    result = []
    for batch in batches:
        processing_time = None
        if batch.completed_at:
            processing_time = (batch.completed_at - batch.created_at).total_seconds()
        
        result.append(BatchSummary(
            batch_id=batch.id,  # Changed from batch.batch_id to batch.id
            document_type=batch.document_type,
            status=batch.status,
            created_at=batch.created_at,
            completed_at=batch.completed_at,
            total_documents=batch.total_documents,
            processed_documents=batch.processed_documents,
            processing_time=processing_time
        ))
    
    return result

@router.get("/dashboard/batches/{batch_id}/details")
async def get_batch_details(
    batch_id: int,
    db: Session = Depends(get_db)
):
    """Get detailed information about a specific batch"""
    # FIXED: Use Batch.id instead of Batch.batch_id
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    documents = db.query(Document).filter(Document.batch_id == batch_id).all()
    
    return {
        "batch": {
            "batch_id": batch.id,  # Changed from batch.batch_id to batch.id
            "document_type": batch.document_type,
            "status": batch.status,
            "created_at": batch.created_at,
            "completed_at": batch.completed_at,
            "total_documents": batch.total_documents,
            "processed_documents": batch.processed_documents
        },
        "documents": [
            {
                "id": doc.id,
                "sequence_number": doc.sequence_number,
                "status": doc.status,
                "error_message": doc.error_message
            }
            for doc in documents
        ]
    }