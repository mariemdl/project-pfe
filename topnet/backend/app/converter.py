import os
import subprocess
from pathlib import Path
import aiofiles
import tempfile
from typing import Optional, List
import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

class FileConverter:
    """Convert various file formats to PDF"""
    
    SUPPORTED_IMAGES = {'.jpg', '.jpeg', '.jfif', '.png', '.tiff', '.bmp', '.gif', '.webp'}
    SUPPORTED_DOCUMENTS = {'.doc', '.docx', '.txt', '.rtf', '.odt'}
    
    def __init__(self, max_workers: int = 3):
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
    
    async def to_pdf(self, input_path: Path) -> Optional[Path]:
        """Convert file to PDF based on extension"""
        ext = input_path.suffix.lower()
        
        if ext == '.pdf':
            return input_path  # Already PDF
        
        try:
            if ext in self.SUPPORTED_IMAGES:
                return await self._image_to_pdf(input_path)
            elif ext in self.SUPPORTED_DOCUMENTS:
                return await self._document_to_pdf(input_path)
            else:
                raise ValueError(f"Unsupported file format: {ext}")
        except Exception as e:
            logger.error(f"Conversion failed for {input_path}: {e}")
            raise
    
    async def _image_to_pdf(self, image_path: Path) -> Path:
        """Convert image to PDF"""
        output_path = image_path.with_suffix('.pdf')
        
        def convert():
            try:
                # Try img2pdf first (better quality), but not for webp
                if image_path.suffix.lower() != '.webp':
                    import img2pdf
                    with open(image_path, 'rb') as f:
                        image_data = f.read()
                    pdf_data = img2pdf.convert(image_data)
                    with open(output_path, 'wb') as f:
                        f.write(pdf_data)
                    return
            except Exception:
                pass
            # Fallback to Pillow (handles webp and any img2pdf failures)
            from PIL import Image
            image = Image.open(image_path)
            if image.mode != 'RGB':
                image = image.convert('RGB')
            image.save(output_path, 'PDF')
        
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(self.executor, convert)
        
        logger.info(f"Converted image to PDF: {output_path}")
        return output_path
    
    async def _document_to_pdf(self, doc_path: Path) -> Path:
        """Convert document to PDF using LibreOffice"""
        output_path = doc_path.with_suffix('.pdf')
        
        def convert():
            # Use libreoffice in headless mode
            cmd = [
                'libreoffice',
                '--headless',
                '--convert-to', 'pdf',
                '--outdir', str(doc_path.parent),
                str(doc_path)
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                raise Exception(f"LibreOffice conversion failed: {result.stderr}")
        
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(self.executor, convert)
        
        logger.info(f"Converted document to PDF: {output_path}")
        return output_path
    
    async def get_pdf_page_count(self, pdf_path: Path) -> int:
        """Get number of pages in PDF"""
        def count_pages():
            try:
                import PyPDF2
                with open(pdf_path, 'rb') as f:
                    pdf = PyPDF2.PdfReader(f)
                    return len(pdf.pages)
            except ImportError:
                # Fallback to pdfinfo
                cmd = ['pdfinfo', str(pdf_path)]
                result = subprocess.run(cmd, capture_output=True, text=True)
                for line in result.stdout.split('\n'):
                    if 'Pages:' in line:
                        return int(line.split(':')[1].strip())
                return 1
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, count_pages)