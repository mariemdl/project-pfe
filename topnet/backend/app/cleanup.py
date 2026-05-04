import asyncio
import shutil
from pathlib import Path
from datetime import datetime, timedelta
import logging
from sqlalchemy.orm import Session
from . import models
from .storage import StorageManager

logger = logging.getLogger(__name__)

class CleanupService:
    def __init__(self, db_session: Session, storage: StorageManager):
        self.db = db_session
        self.storage = storage
    
    async def cleanup_old_batches(self, days: int = 30):
        """Delete batches older than specified days"""
        cutoff_date = datetime.now() - timedelta(days=days)
        
        old_batches = self.db.query(models.Batch).filter(
            models.Batch.created_at < cutoff_date
        ).all()
        
        for batch in old_batches:
            try:
                # Delete files
                await self.storage.delete_batch_files(batch.id)
                
                # Database records will cascade delete
                self.db.delete(batch)
                logger.info(f"Cleaned up batch {batch.id}")
            except Exception as e:
                logger.error(f"Failed to clean batch {batch.id}: {e}")
        
        self.db.commit()
    
    async def cleanup_temp_files(self, hours: int = 24):
        """Clean up temporary processing files"""
        temp_dirs = Path("/app/storage/uploads").glob("*/temp")
        cutoff = datetime.now() - timedelta(hours=hours)
        
        for temp_dir in temp_dirs:
            try:
                # Check if directory is old enough
                mtime = datetime.fromtimestamp(temp_dir.stat().st_mtime)
                if mtime < cutoff:
                    shutil.rmtree(temp_dir)
                    logger.info(f"Cleaned temp dir: {temp_dir}")
            except Exception as e:
                logger.error(f"Failed to clean temp dir {temp_dir}: {e}")