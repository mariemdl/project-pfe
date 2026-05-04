import asyncio
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from datetime import datetime
import logging
from pathlib import Path

from . import models, schemas
from .storage import StorageManager
from .converter import FileConverter
from .ai_client import ai_client  # Import the configured client (mock or real)

logger = logging.getLogger(__name__)

class DocumentProcessor:
    def __init__(self, db: Session, storage: StorageManager):
        self.db = db
        self.storage = storage
        self.ai = ai_client  # Use the pre-configured client
        self.converter = FileConverter()
    
    async def process_batch(self, batch_id: int):
        """Process all documents in a batch sequentially"""
        logger.info(f"Starting processing for batch {batch_id}")
        
        # Get batch and its documents
        batch = self.db.query(models.Batch).filter(models.Batch.id == batch_id).first()
        if not batch:
            logger.error(f"Batch {batch_id} not found")
            return
        
        documents = self.db.query(models.Document).filter(
            models.Document.batch_id == batch_id
        ).order_by(models.Document.sequence_number).all()
        
        # Process each document in order
        for doc in documents:
            try:
                await self._process_document(doc, batch.document_type)
                
                # Update batch progress
                batch.processed_documents += 1
                self.db.commit()
                
                logger.info(f"Processed document {doc.sequence_number}/{batch.total_documents}")
                
            except Exception as e:
                logger.error(f"Failed to process document {doc.id}: {e}")
                doc.status = "failed"
                doc.error_message = str(e)
                self.db.commit()
        
        # Mark batch as completed
        batch.status = "completed" if batch.processed_documents == batch.total_documents else "failed"
        batch.completed_at = datetime.now()
        self.db.commit()
        
        logger.info(f"Batch {batch_id} processing completed")
    
    async def _process_document(self, doc: models.Document, doc_type: str):
        """Process a single document"""
        logger.info(f"Processing document {doc.id}")
        
        doc.status = "processing"
        doc.processing_started_at = datetime.now()
        self.db.commit()
        
        # Step 1: Convert to PDF if needed
        original_path = Path(doc.original_file_path)
        pdf_path = await self.converter.to_pdf(original_path)
        
        if pdf_path != original_path:
            doc.converted_pdf_path = str(pdf_path)
            self.db.commit()
        
        # Step 2: Validate document type
        validation = await self.ai.validate_type(pdf_path, doc_type)
        
        # Store validation result
        analysis = models.DocumentAnalysis(
            document_id=doc.id,
            analysis_type="validation",
            result=validation,
            confidence=validation.get('confidence', 0.0)
        )
        self.db.add(analysis)
        self.db.commit()
        
        if not validation.get('is_type', False):
            raise ValueError(f"Document is not a valid {doc_type}")
        
        # Step 3: For ID cards, verify front/back pair
        if doc_type == 'id_card' and 'front' in doc.original_filename.lower():
            # This would need to be handled at batch level
            pass
        
        # Step 4: Check if PDF contains multiple documents
        split_info = await self.ai.split_documents(pdf_path)
        
        if split_info.get('document_count', 1) > 1:
            logger.info(f"Document contains {split_info['document_count']} sub-documents")
            # For now, we'll just extract the first one
            # In a real implementation, you'd split and process each
        
        # Step 5: Extract data
        extraction = await self.ai.extract_data(pdf_path, doc_type)
        
        # Save extracted fields
        fields = extraction.get('fields', [])
        if fields:
            for field in fields:
                field_value = field.get('value', '')
                if field_value is None:
                    field_value = ''
                    
                extracted = models.ExtractedField(
                    document_id=doc.id,
                    field_name=field.get('name', 'unknown'),
                    original_value=field.get('value', ''),
                    confidence=field.get('confidence', 0.0),
                    field_type=field.get('type', 'text'),
                    field_metadata=extraction.get('metadata')
                )
                self.db.add(extracted)
        else:
            logger.warning(f"No fields extracted for document {doc.id}")
        
        # Store extraction metadata
        analysis = models.DocumentAnalysis(
            document_id=doc.id,
            analysis_type="extraction",
            result={"language": extraction.get('language')},
            confidence=1.0
        )
        self.db.add(analysis)
        
        doc.status = "completed"
        doc.processing_completed_at = datetime.now()
        self.db.commit()
        
        logger.info(f"Document {doc.id} processing completed")
    
    async def translate_document_fields(self, doc_id: int, target_language: str):
        """Translate extracted fields for a document"""
        fields = self.db.query(models.ExtractedField).filter(
            models.ExtractedField.document_id == doc_id
        ).all()
        
        for field in fields:
            if field.original_value:
                translated = await self.ai.translate_text(
                    field.original_value,
                    target_language
                )
                field.translated_value = translated
        
        self.db.commit()
        logger.info(f"Translated {len(fields)} fields for document {doc_id}")