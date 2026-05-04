from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import text, func, desc, and_, Integer
from datetime import datetime, timedelta
from typing import Optional, List
import logging
import os
import subprocess
import httpx
import psutil
from ..database import get_db
from .. import models
from ..auth import get_current_user, require_role

router = APIRouter(prefix="/api/system", tags=["System Admin"])
logger = logging.getLogger(__name__)


# ========== SYSTEM HEALTH DASHBOARD ==========

@router.get("/health")
async def get_system_health(
    current_user: models.User = Depends(require_role("system_admin")),
    db: Session = Depends(get_db)
):
    """Get overall system health status"""
    
    # Check backend status
    backend_status = "running"
    backend_error = None
    try:
        # Simple self-check
        backend_status = "running"
    except Exception as e:
        backend_status = "down"
        backend_error = str(e)
    
    # Check database connection
    db_status = "running"
    db_error = None
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = "down"
        db_error = str(e)
    
    # Check AI Service
    ai_status = "unknown"
    ai_error = None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get("http://ai-service:8001/health")
            if response.status_code == 200:
                ai_status = "running"
            else:
                ai_status = "degraded"
    except Exception as e:
        ai_status = "down"
        ai_error = str(e)
    
    # Check Selenium
    selenium_status = "unknown"
    selenium_error = None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get("http://selenium:4444/wd/hub/status")
            if response.status_code == 200:
                selenium_status = "running"
            else:
                selenium_status = "degraded"
    except Exception as e:
        selenium_status = "down"
        selenium_error = str(e)
    
    # Get statistics
    active_users = db.query(models.User).filter(models.User.is_active == True).count()
    total_users = db.query(models.User).count()
    
    # Get error rate (last 24 hours)
    last_24h = datetime.utcnow() - timedelta(hours=24)
    total_requests = db.query(models.UserActivityLog).filter(
        models.UserActivityLog.created_at >= last_24h
    ).count()
    error_requests = db.query(models.UserActivityLog).filter(
        models.UserActivityLog.created_at >= last_24h,
        models.UserActivityLog.action.like("%error%")
    ).count()
    error_rate = (error_requests / total_requests * 100) if total_requests > 0 else 0
    
    return {
        "status": "healthy" if all([backend_status == "running", db_status == "running"]) else "degraded",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "backend": {"status": backend_status, "error": backend_error},
            "database": {"status": db_status, "error": db_error},
            "ai_service": {"status": ai_status, "error": ai_error},
            "selenium": {"status": selenium_status, "error": selenium_error},
        },
        "statistics": {
            "active_users": active_users,
            "total_users": total_users,
            "error_rate_24h": round(error_rate, 2),
            "total_requests_24h": total_requests,
        }
    }


# ========== SERVICES MONITORING ==========

@router.get("/services")
async def get_services_status(
    current_user: models.User = Depends(require_role("system_admin")),
    db: Session = Depends(get_db)
):
    """Get detailed status of all services"""
    
    services = ["backend", "database", "ai_service", "selenium"]
    results = []
    
    for service in services:
        status = db.query(models.ServiceStatus).filter(
            models.ServiceStatus.service_name == service
        ).first()
        
        if not status:
            status = models.ServiceStatus(service_name=service)
            db.add(status)
            db.commit()
            db.refresh(status)
        
        # Update status on the fly
        if service == "backend":
            status.status = "running"
            status.last_check = datetime.utcnow()
        elif service == "database":
            try:
                db.execute(text("SELECT 1"))
                status.status = "running"
                status.error_count = 0
            except:
                status.status = "down"
                status.error_count += 1
            status.last_check = datetime.utcnow()
        elif service == "ai_service":
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    response = await client.get("http://ai-service:8001/health")
                    if response.status_code == 200:
                        status.status = "running"
                        status.response_time_ms = response.elapsed.total_seconds() * 1000
                        status.error_count = 0
                    else:
                        status.status = "degraded"
                        status.error_count += 1
            except:
                status.status = "down"
                status.error_count += 1
            status.last_check = datetime.utcnow()
        elif service == "selenium":
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    response = await client.get("http://selenium:4444/wd/hub/status")
                    if response.status_code == 200:
                        status.status = "running"
                        status.response_time_ms = response.elapsed.total_seconds() * 1000
                        status.error_count = 0
                    else:
                        status.status = "degraded"
                        status.error_count += 1
            except:
                status.status = "down"
                status.error_count += 1
            status.last_check = datetime.utcnow()
        
        db.commit()
        
        results.append({
            "name": service,
            "status": status.status,
            "last_check": status.last_check.isoformat() if status.last_check else None,
            "response_time_ms": status.response_time_ms,
            "error_count": status.error_count,
        })
    
    return results


# ========== LOGS & ERRORS ==========

@router.get("/logs")
async def get_system_logs(
    level: Optional[str] = Query(None, regex="^(INFO|WARNING|ERROR|CRITICAL)$"),
    source: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    current_user: models.User = Depends(require_role("system_admin")),
    db: Session = Depends(get_db)
):
    """Get system logs with filtering"""
    
    query = db.query(models.SystemLog).order_by(desc(models.SystemLog.timestamp))
    
    if level:
        query = query.filter(models.SystemLog.level == level)
    if source:
        query = query.filter(models.SystemLog.source == source)
    
    total = query.count()
    logs = query.offset(offset).limit(limit).all()
    
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "logs": [
            {
                "id": log.id,
                "timestamp": log.timestamp.isoformat(),
                "level": log.level,
                "source": log.source,
                "message": log.message,
                "details": log.details,
            }
            for log in logs
        ]
    }


@router.get("/logs/errors")
async def get_error_logs(
    hours: int = 24,
    current_user: models.User = Depends(require_role("system_admin")),
    db: Session = Depends(get_db)
):
    """Get error logs summary for the last X hours"""
    
    since = datetime.utcnow() - timedelta(hours=hours)
    
    errors = db.query(models.SystemLog).filter(
        models.SystemLog.level.in_(["ERROR", "CRITICAL"]),
        models.SystemLog.timestamp >= since
    ).order_by(desc(models.SystemLog.timestamp)).all()
    
    # Group by source
    by_source = {}
    for error in errors:
        if error.source not in by_source:
            by_source[error.source] = []
        by_source[error.source].append({
            "timestamp": error.timestamp.isoformat(),
            "message": error.message,
        })
    
    return {
        "period_hours": hours,
        "total_errors": len(errors),
        "by_source": by_source,
        "recent_errors": [
            {
                "timestamp": e.timestamp.isoformat(),
                "source": e.source,
                "message": e.message,
            }
            for e in errors[:20]
        ]
    }


# ========== AI / API MONITORING ==========

@router.get("/ai/stats")
async def get_ai_stats(
    hours: int = 24,
    current_user: models.User = Depends(require_role("system_admin")),
    db: Session = Depends(get_db)
):
    """Get AI service statistics"""
    
    since = datetime.utcnow() - timedelta(hours=hours)
    
    stats = db.query(
        models.AICallLog.call_type,
        func.count(models.AICallLog.id).label("total"),
        func.sum(func.cast(models.AICallLog.success, type_=Integer)).label("success_count"),
        func.avg(models.AICallLog.response_time_ms).label("avg_response_time"),
        func.sum(func.cast(models.AICallLog.mock_used, type_=Integer)).label("mock_count"),
    ).filter(
        models.AICallLog.timestamp >= since
    ).group_by(models.AICallLog.call_type).all()
    
    # Get mock vs real usage
    mock_usage = db.query(
        func.count(models.AICallLog.id).filter(models.AICallLog.mock_used == True).label("mock"),
        func.count(models.AICallLog.id).filter(models.AICallLog.mock_used == False).label("real"),
    ).filter(
        models.AICallLog.timestamp >= since
    ).first()
    
    # Get response time trend (last 10 data points)
    recent_calls = db.query(
        models.AICallLog.timestamp,
        models.AICallLog.response_time_ms,
        models.AICallLog.success,
    ).filter(
        models.AICallLog.timestamp >= since
    ).order_by(desc(models.AICallLog.timestamp)).limit(50).all()
    
    return {
        "period_hours": hours,
        "total_calls": sum(s.total for s in stats),
        "by_type": [
            {
                "type": s.call_type,
                "total": s.total,
                "success": s.success_count or 0,
                "failure": s.total - (s.success_count or 0),
                "success_rate": round((s.success_count or 0) / s.total * 100, 2) if s.total > 0 else 0,
                "avg_response_time_ms": round(s.avg_response_time or 0, 2),
            }
            for s in stats
        ],
        "mock_vs_real": {
            "mock": mock_usage.mock or 0,
            "real": mock_usage.real or 0,
            "mock_percentage": round((mock_usage.mock or 0) / ((mock_usage.mock or 0) + (mock_usage.real or 0)) * 100, 2) if (mock_usage.mock or 0) + (mock_usage.real or 0) > 0 else 0,
        },
        "recent_response_times": [
            {"timestamp": c.timestamp.isoformat(), "ms": c.response_time_ms, "success": c.success}
            for c in recent_calls
        ][::-1]
    }


# ========== DATABASE MONITORING ==========

# ========== ENHANCED DATABASE MONITORING ==========
# Ajoute ces nouvelles routes après la section DATABASE MONITORING existante

@router.get("/database/tables")
async def get_database_tables(
    current_user: models.User = Depends(require_role("system_admin")),
    db: Session = Depends(get_db)
):
    """
    Get all database tables with row counts, sizes, and column information
    Using SQLAlchemy models for accurate data
    """
    
    # Define all models and their display names
    models_list = [
        {"model": models.User, "name": "users", "display": "👥 Users"},
        {"model": models.Batch, "name": "batches", "display": "📦 Batches"},
        {"model": models.Document, "name": "documents", "display": "📄 Documents"},
        {"model": models.ExtractedField, "name": "extracted_fields", "display": "🏷️ Extracted Fields"},
        {"model": models.TranslationRequest, "name": "translations", "display": "🌐 Translations"},
        {"model": models.DocumentAnalysis, "name": "document_analysis", "display": "🔍 Document Analysis"},
        {"model": models.UserDocumentAccess, "name": "user_document_access", "display": "🔐 Access Grants"},
        {"model": models.UserActivityLog, "name": "user_activity_log", "display": "📝 Activity Logs"},
        {"model": models.UserSession, "name": "user_sessions", "display": "🔑 User Sessions"},
        {"model": models.PasswordReset, "name": "password_resets", "display": "🔄 Password Resets"},
        {"model": models.SystemLog, "name": "system_logs", "display": "📋 System Logs"},
        {"model": models.AICallLog, "name": "ai_call_logs", "display": "🤖 AI Calls"},
        {"model": models.ServiceStatus, "name": "service_status", "display": "⚙️ Service Status"},
    ]
    
    tables = []
    
    for item in models_list:
        try:
            # Get row count
            row_count = db.query(item["model"]).count()
            
            # Get column count from model
            column_count = len([c for c in item["model"].__table__.columns])
            
            # Get table size using raw SQL (PostgreSQL)
            try:
                size_result = db.execute(
                    text(f"SELECT pg_total_relation_size('{item['name']}') as size_bytes")
                )
                size_bytes = size_result.first()[0] or 0
                size_mb = round(size_bytes / (1024 * 1024), 2)
            except:
                size_mb = 0
            
            # Get last updated time (if updated_at column exists)
            last_updated = None
            if hasattr(item["model"], 'updated_at'):
                last_record = db.query(item["model"]).order_by(
                    getattr(item["model"], 'updated_at').desc()
                ).first()
                if last_record:
                    last_updated = last_record.updated_at
            
            # If no updated_at, check created_at
            if not last_updated and hasattr(item["model"], 'created_at'):
                last_record = db.query(item["model"]).order_by(
                    getattr(item["model"], 'created_at').desc()
                ).first()
                if last_record:
                    last_updated = last_record.created_at
            
            tables.append({
                "table_name": item["name"],
                "display_name": item["display"],
                "row_count": row_count,
                "size_mb": size_mb,
                "column_count": column_count,
                "last_updated": last_updated.isoformat() if last_updated else None,
            })
            
        except Exception as e:
            logger.error(f"Error getting stats for {item['name']}: {e}")
            tables.append({
                "table_name": item["name"],
                "display_name": item["display"],
                "row_count": 0,
                "size_mb": 0,
                "column_count": 0,
                "last_updated": None,
                "error": str(e)
            })
    
    return tables


@router.get("/database/tables/{table_name}/details")
async def get_table_details(
    table_name: str,
    current_user: models.User = Depends(require_role("system_admin")),
    db: Session = Depends(get_db)
):
    """
    Get detailed information about a specific table including columns and indexes
    """
    
    # Map table name to model
    model_map = {
        "users": models.User,
        "batches": models.Batch,
        "documents": models.Document,
        "extracted_fields": models.ExtractedField,
        "translations": models.TranslationRequest,
        "document_analysis": models.DocumentAnalysis,
        "user_document_access": models.UserDocumentAccess,
        "user_activity_log": models.UserActivityLog,
        "user_sessions": models.UserSession,
        "password_resets": models.PasswordReset,
        "system_logs": models.SystemLog,
        "ai_call_logs": models.AICallLog,
        "service_status": models.ServiceStatus,
    }
    
    if table_name not in model_map:
        raise HTTPException(404, f"Table '{table_name}' not found")
    
    model = model_map[table_name]
    
    # Get column information
    columns = []
    for column in model.__table__.columns:
        columns.append({
            "name": column.name,
            "type": str(column.type),
            "nullable": column.nullable,
            "primary_key": column.primary_key,
            "default": str(column.default) if column.default else None,
        })
    
    # Get indexes using SQL
    indexes = []
    try:
        index_result = db.execute(
            text(f"""
                SELECT
                    indexname,
                    indexdef
                FROM pg_indexes
                WHERE tablename = '{table_name}'
            """)
        )
        for idx in index_result:
            indexes.append({
                "name": idx[0],
                "definition": idx[1]
            })
    except:
        pass
    
    return {
        "table_name": table_name,
        "columns": columns,
        "indexes": indexes,
        "total_columns": len(columns),
        "total_indexes": len(indexes)
    }


@router.get("/database/tables/{table_name}/preview")
async def get_table_preview(
    table_name: str,
    limit: int = Query(10, ge=1, le=100),
    current_user: models.User = Depends(require_role("system_admin")),
    db: Session = Depends(get_db)
):
    """
    Get a preview of the first N rows from a table
    """
    
    # Map table name to model
    model_map = {
        "users": models.User,
        "batches": models.Batch,
        "documents": models.Document,
        "extracted_fields": models.ExtractedField,
        "translations": models.TranslationRequest,
        "system_logs": models.SystemLog,
        "ai_call_logs": models.AICallLog,
    }
    
    if table_name not in model_map:
        raise HTTPException(404, f"Table preview not available for '{table_name}'")
    
    model = model_map[table_name]
    
    # Get recent rows
    rows = db.query(model).order_by(getattr(model, 'id').desc()).limit(limit).all()
    
    # Convert to dict
    result_rows = []
    for row in rows:
        row_dict = {}
        for column in model.__table__.columns:
            value = getattr(row, column.name)
            # Convert datetime to string
            if isinstance(value, datetime):
                value = value.isoformat()
            row_dict[column.name] = value
        result_rows.append(row_dict)
    
    return {
        "table_name": table_name,
        "rows": result_rows,
        "row_count": len(result_rows),
        "columns": [c.name for c in model.__table__.columns]
    }


@router.get("/database/query")
async def execute_database_query(
    sql_query: str = Query(..., description="SELECT query to execute"),
    current_user: models.User = Depends(require_role("system_admin")),
    db: Session = Depends(get_db)
):
    """
    Execute a safe SELECT query on the database (Admin only)
    """
    
    # Security: Only allow SELECT queries
    if not sql_query.strip().upper().startswith("SELECT"):
        raise HTTPException(400, "Only SELECT queries are allowed")
    
    # Block dangerous operations
    dangerous_keywords = ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "CREATE", "TRUNCATE", "EXEC", "EXECUTE"]
    sql_upper = sql_query.upper()
    for keyword in dangerous_keywords:
        if keyword in sql_upper:
            raise HTTPException(400, f"Dangerous keyword '{keyword}' is not allowed")
    
    try:
        result = db.execute(text(sql_query))
        
        # Get column names
        columns = result.keys() if result.returns_rows else []
        
        # Fetch rows
        rows = []
        if result.returns_rows:
            for row in result.fetchall():
                row_dict = {}
                for i, col in enumerate(columns):
                    value = row[i]
                    if isinstance(value, datetime):
                        value = value.isoformat()
                    row_dict[col] = value
                rows.append(row_dict)
        
        # Log the query execution
        system_log = models.SystemLog(
            level="INFO",
            source="database",
            message=f"Admin query executed by {current_user.username}",
            details={"query": sql_query[:200], "rows_returned": len(rows)}
        )
        db.add(system_log)
        db.commit()
        
        return {
            "success": True,
            "columns": list(columns),
            "rows": rows,
            "row_count": len(rows),
            "query": sql_query[:500]  # Truncate for display
        }
        
    except Exception as e:
        logger.error(f"Query execution failed: {e}")
        raise HTTPException(400, detail=str(e))


@router.get("/database/connections")
async def get_active_connections(
    current_user: models.User = Depends(require_role("system_admin")),
    db: Session = Depends(get_db)
):
    """
    Get active database connections
    """
    try:
        result = db.execute(text("""
            SELECT 
                pid,
                usename as username,
                application_name,
                client_addr,
                state,
                query_start,
                state_change,
                left(query, 100) as query_preview
            FROM pg_stat_activity
            WHERE datname = current_database()
            AND state = 'active'
            AND pid != pg_backend_pid()
            ORDER BY query_start DESC
        """))
        
        connections = []
        for row in result:
            connections.append({
                "pid": row[0],
                "username": row[1],
                "application": row[2],
                "client_address": str(row[3]) if row[3] else "local",
                "state": row[4],
                "query_start": row[5].isoformat() if row[5] else None,
                "query_preview": row[7],
            })
        
        return {
            "active_connections": len(connections),
            "connections": connections,
            "max_connections": get_max_connections(db)
        }
        
    except Exception as e:
        logger.error(f"Failed to get connections: {e}")
        return {"active_connections": 0, "connections": [], "error": str(e)}


def get_max_connections(db: Session) -> int:
    """Helper to get max connections setting"""
    try:
        result = db.execute(text("SHOW max_connections"))
        return int(result.first()[0])
    except:
        return 100  # Default fallback


# ========== ENHANCED DATABASE STATS (remplace l'ancienne) ==========

@router.get("/database/stats")
async def get_database_stats_v2(
    current_user: models.User = Depends(require_role("system_admin")),
    db: Session = Depends(get_db)
):
    """
    Get comprehensive database statistics - V2 with real data
    """
    
    # Get real table sizes using SQL
    try:
        table_sizes = db.execute(text("""
            SELECT 
                tablename,
                pg_total_relation_size(schemaname || '.' || tablename) as size_bytes
            FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY size_bytes DESC
        """)).fetchall()
        
        total_size_bytes = sum(row[1] for row in table_sizes)
        
    except Exception as e:
        logger.error(f"Error getting table sizes: {e}")
        table_sizes = []
        total_size_bytes = 0
    
    # Get connection count
    try:
        connection_count = db.execute(text("SELECT COUNT(*) FROM pg_stat_activity")).scalar()
    except:
        connection_count = 0
    
    # Get database size
    try:
        db_size_result = db.execute(text("SELECT pg_database_size(current_database())"))
        db_size_bytes = db_size_result.scalar()
    except:
        db_size_bytes = total_size_bytes
    
    # Get cache hit ratio
    try:
        cache_result = db.execute(text("""
            SELECT 
                sum(heap_blks_hit)::float / (sum(heap_blks_hit) + sum(heap_blks_read)) as cache_hit_ratio
            FROM pg_statio_user_tables
        """))
        cache_hit_ratio = round(cache_result.scalar() * 100, 2) if cache_result.scalar() else 0
    except:
        cache_hit_ratio = 0
    
    # Get transaction statistics
    try:
        tx_result = db.execute(text("""
            SELECT 
                xact_commit,
                xact_rollback
            FROM pg_stat_database
            WHERE datname = current_database()
        """))
        tx_data = tx_result.first()
        tx_commit = tx_data[0] if tx_data else 0
        tx_rollback = tx_data[1] if tx_data else 0
    except:
        tx_commit = 0
        tx_rollback = 0
    
    return {
        "connection_status": "connected",
        "active_connections": connection_count,
        "database_size_mb": round(db_size_bytes / (1024 * 1024), 2),
        "database_size_gb": round(db_size_bytes / (1024 * 1024 * 1024), 2),
        "total_tables": len(table_sizes),
        "cache_hit_ratio": cache_hit_ratio,
        "transactions": {
            "committed": tx_commit,
            "rolled_back": tx_rollback,
            "total": tx_commit + tx_rollback
        },
        "table_sizes": [
            {
                "table_name": row[0],
                "size_mb": round(row[1] / (1024 * 1024), 2),
                "size_bytes": row[1]
            }
            for row in table_sizes[:20]
        ],
        "last_analyze": get_last_maintenance_time(db, "ANALYZE"),
        "last_vacuum": get_last_maintenance_time(db, "VACUUM")
    }


def get_last_maintenance_time(db: Session, operation: str) -> str | None:
    """Get last ANALYZE or VACUUM time"""
    try:
        result = db.execute(text(f"""
            SELECT last_{operation.lower()}
            FROM pg_stat_user_tables
            WHERE schemaname = 'public'
            AND last_{operation.lower()} IS NOT NULL
            ORDER BY last_{operation.lower()} DESC
            LIMIT 1
        """))
        last_time = result.first()
        return last_time[0].isoformat() if last_time and last_time[0] else None
    except:
        return None
# ========== CONTROL ACTIONS ==========

@router.post("/control/restart-service")
async def restart_service(
    service_name: str,
    current_user: models.User = Depends(require_role("system_admin")),
    db: Session = Depends(get_db)
):
    """Restart a service (simulated for now)"""
    
    valid_services = ["backend", "ai_service", "selenium"]
    if service_name not in valid_services:
        raise HTTPException(400, f"Invalid service. Choose from: {valid_services}")
    
    # Log the action
    system_log = models.SystemLog(
        level="INFO",
        source="system_admin",
        message=f"Service '{service_name}' restart requested by {current_user.username}",
        details={"service": service_name, "action": "restart"}
    )
    db.add(system_log)
    db.commit()
    
    # In a real implementation, you would actually restart the service
    # For now, simulate and update status
    service_status = db.query(models.ServiceStatus).filter(
        models.ServiceStatus.service_name == service_name
    ).first()
    
    if service_status:
        service_status.status = "restarting"
        db.commit()
    
    return {
        "message": f"Service '{service_name}' restart initiated",
        "simulated": True,
        "note": "In production, this would actually restart the container"
    }


@router.post("/control/toggle-mock-ai")
async def toggle_mock_ai(
    current_user: models.User = Depends(require_role("system_admin")),
    db: Session = Depends(get_db)
):
    """Toggle USE_MOCK_AI setting (requires .env update and restart)"""
    
    current_value = os.getenv("USE_MOCK_AI", "true").lower() == "true"
    new_value = not current_value
    
    # Log the action
    system_log = models.SystemLog(
        level="INFO",
        source="system_admin",
        message=f"USE_MOCK_AI toggled from {current_value} to {new_value} by {current_user.username}",
        details={"old_value": current_value, "new_value": new_value}
    )
    db.add(system_log)
    db.commit()
    
    # Note: Changing .env requires a restart to take effect
    return {
        "message": f"USE_MOCK_AI would be set to {new_value}",
        "current_value": current_value,
        "new_value": new_value,
        "warning": "Change requires backend restart to take effect"
    }


# ========== LOG CREATION HELPER ==========

def log_system_event(db: Session, level: str, source: str, message: str, details: dict = None):
    """Helper to create system logs"""
    log = models.SystemLog(
        level=level,
        source=source,
        message=message,
        details=details or {}
    )
    db.add(log)
    db.commit()