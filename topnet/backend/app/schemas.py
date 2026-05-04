from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Union
from datetime import datetime

# Field schemas
class ExtractedFieldBase(BaseModel):
    name: str
    value: str
    confidence: float = Field(ge=0.0, le=1.0)

class ExtractedFieldWithTranslation(ExtractedFieldBase):
    translated_value: Optional[str] = None

# Document schemas
class DocumentBase(BaseModel):
    sequence_number: int
    status: str
    original_filename: str

class DocumentProgress(DocumentBase):
    id: int
    fields: Optional[List[ExtractedFieldBase]] = None
    translated_fields: Optional[List[ExtractedFieldBase]] = None
    error_message: Optional[str] = None
    processing_completed_at: Optional[datetime] = None

# Batch schemas
class BatchCreate(BaseModel):
    document_type: str
    total_documents: int

class BatchProgress(BaseModel):
    batch_id: int
    status: str
    document_type: str
    total_documents: int
    processed_documents: int
    documents: List[DocumentProgress]

class BatchResult(BatchProgress):
    created_at: datetime = None
    completed_at: Optional[datetime] = None

# AI Detection schemas
class LanguageDetectionResponse(BaseModel):
    language: str
    confidence: float

class ValidationResponse(BaseModel):
    is_type: bool
    confidence: float

class PairVerificationResponse(BaseModel):
    same_card: bool
    confidence: float

class SplitResponse(BaseModel):
    document_count: int
    pages: List[List[int]]

class ExtractionResponse(BaseModel):
    fields: List[ExtractedFieldBase]
    language: str
    metadata: Optional[Dict[str, Any]] = None

# Translation schemas
class TranslationRequest(BaseModel):
    text: str
    target_language: str

class TranslationResponse(BaseModel):
    translated_text: str
    detected_source_language: Optional[str] = None

# Upload response
class UploadResponse(BaseModel):
    batch_id: int
    status: str
    total_documents: int
    message: str