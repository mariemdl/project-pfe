import os
import shutil
from pathlib import Path
import aiofiles
import uuid
import mimetypes
from typing import Optional, Tuple
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class StorageManager:
    def __init__(self, base_path: str = "/app/storage"):
        self.base_path = Path(base_path)
        self.uploads_path = self.base_path / "uploads"
        self.reports_path = self.base_path / "reports"
        self._ensure_directories()
    
    def _ensure_directories(self):
        """Create required directories if they don't exist"""
        self.uploads_path.mkdir(parents=True, exist_ok=True)
        self.reports_path.mkdir(parents=True, exist_ok=True)
        (self.uploads_path / "batches").mkdir(exist_ok=True)
        (self.reports_path / "batches").mkdir(exist_ok=True)
    
    def get_batch_path(self, batch_id: int) -> Path:
        """Get path for batch storage"""
        batch_path = self.uploads_path / "batches" / str(batch_id)
        batch_path.mkdir(parents=True, exist_ok=True)
        return batch_path
    
    async def save_original_file(
        self, 
        file_content: bytes, 
        batch_id: int, 
        sequence: int, 
        original_filename: str,
        mime_type: str
    ) -> Tuple[Path, str]:
        """Save original uploaded file"""
        batch_path = self.get_batch_path(batch_id)
        originals_path = batch_path / "originals"
        originals_path.mkdir(exist_ok=True)
        
        # Generate safe filename
        ext = Path(original_filename).suffix.lower()
        if not ext:
            ext = mimetypes.guess_extension(mime_type) or '.bin'
        
        safe_filename = f"{sequence:03d}_{uuid.uuid4().hex}{ext}"
        file_path = originals_path / safe_filename
        
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(file_content)
        
        logger.info(f"Saved original file: {file_path}")
        return file_path, safe_filename
    
    async def save_converted_pdf(
        self,
        pdf_content: bytes,
        batch_id: int,
        sequence: int
    ) -> Path:
        """Save converted PDF file"""
        batch_path = self.get_batch_path(batch_id)
        converted_path = batch_path / "converted"
        converted_path.mkdir(exist_ok=True)
        
        pdf_filename = f"{sequence:03d}_converted.pdf"
        pdf_path = converted_path / pdf_filename
        
        async with aiofiles.open(pdf_path, 'wb') as f:
            await f.write(pdf_content)
        
        logger.info(f"Saved converted PDF: {pdf_path}")
        return pdf_path
    
    def get_report_path(self, batch_id: int) -> Path:
        """Get path for batch report PDF"""
        return self.reports_path / "batches" / f"batch_{batch_id}.pdf"
    
    def cleanup_temp_files(self, batch_id: int):
        """Clean up temporary processing files"""
        batch_path = self.get_batch_path(batch_id)
        temp_path = batch_path / "temp"
        if temp_path.exists():
            shutil.rmtree(temp_path)
            logger.info(f"Cleaned temp files for batch {batch_id}")
    
    def get_file_size(self, file_path: Path) -> int:
        """Get file size in bytes"""
        return file_path.stat().st_size
    
    async def delete_batch_files(self, batch_id: int):
        """Delete all files for a batch"""
        batch_path = self.uploads_path / "batches" / str(batch_id)
        if batch_path.exists():
            shutil.rmtree(batch_path)
            logger.info(f"Deleted batch files: {batch_id}")
        
        # Delete report
        report_path = self.get_report_path(batch_id)
        if report_path.exists():
            report_path.unlink()
    
    def get_file_info(self, file_path: Path) -> dict:
        """Get file metadata"""
        stat = file_path.stat()
        return {
            "size": stat.st_size,
            "created": datetime.fromtimestamp(stat.st_ctime),
            "modified": datetime.fromtimestamp(stat.st_mtime),
            "extension": file_path.suffix,
            "filename": file_path.name
        }