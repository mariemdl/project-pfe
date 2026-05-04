import os
import logging
import re
from typing import Dict, Any, List
from pdf2image import convert_from_path
import pytesseract
from PIL import Image

logger = logging.getLogger(__name__)

class EasyOCRClient:
    """Document extraction using Tesseract OCR for all document types"""
    
    def __init__(self):
        self.initialized = True
        # Support multiple languages for different document types
        self.languages = 'ara+fra+eng'  # Arabic, French, English
        logger.info(f"Tesseract OCR client initialized with languages: {self.languages}")
    
    async def extract_data(self, file_path: str, doc_type: str) -> Dict[str, Any]:
        """Extract text from document (Image or PDF) using Tesseract OCR"""
        
        fields = []
        all_text = []
        
        try:
            file_ext = os.path.splitext(file_path)[1].lower()
            logger.info(f"Processing file: {file_path}, type: {file_ext}, doc_type: {doc_type}")
            
            # Handle PDF files
            if file_ext == '.pdf':
                logger.info(f"Converting PDF to images: {file_path}")
                images = convert_from_path(file_path, dpi=300)
                
                for page_num, image in enumerate(images):
                    # Use Tesseract OCR on each page
                    text = pytesseract.image_to_string(image, lang=self.languages)
                    all_text.append(text)
                    fields.append({
                        "name": f"page_{page_num + 1}",
                        "value": text[:1000] if text else "",
                        "confidence": 0.85,
                        "type": "text"
                    })
                    logger.info(f"Page {page_num + 1}: extracted {len(text)} characters")
            
            # Handle Image files
            elif file_ext in ['.jpg', '.jpeg', '.png', '.tiff', '.bmp']:
                logger.info(f"Processing image directly: {file_path}")
                image = Image.open(file_path)
                # Convert to RGB if needed
                if image.mode != 'RGB':
                    image = image.convert('RGB')
                text = pytesseract.image_to_string(image, lang=self.languages)
                all_text.append(text)
                fields.append({
                    "name": "extracted_text",
                    "value": text[:1000] if text else "",
                    "confidence": 0.85,
                    "type": "text"
                })
                logger.info(f"Image: extracted {len(text)} characters")
            
            # Handle text files (already converted to PDF by backend, but just in case)
            else:
                logger.info(f"Reading text file: {file_path}")
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    text = f.read()
                all_text.append(text)
                fields.append({
                    "name": "extracted_text",
                    "value": text[:1000],
                    "confidence": 0.95,
                    "type": "text"
                })
            
            # Combine all text for structured extraction
            full_text = " ".join(all_text)
            
            # Extract document-specific fields based on doc_type
            if doc_type == 'id-card':
                structured_fields = self._extract_id_card_fields(full_text)
            elif doc_type == 'invoice':
                structured_fields = self._extract_invoice_fields(full_text)
            elif doc_type == 'passport':
                structured_fields = self._extract_passport_fields(full_text)
            elif doc_type == 'contract':
                structured_fields = self._extract_contract_fields(full_text)
            else:
                structured_fields = []
            
            fields.extend(structured_fields)
            
            logger.info(f"Tesseract extracted {len(fields)} fields for {doc_type}")
            
            return {
                "fields": fields,
                "language": "multilingual",
                "metadata": {"source": "tesseract", "doc_type": doc_type}
            }
            
        except Exception as e:
            logger.error(f"OCR extraction failed: {e}")
            raise
    
    def _extract_id_card_fields(self, text: str) -> List[Dict]:
        """Extract common ID card fields"""
        fields = []
        
        # Common patterns for ID cards
        patterns = [
            (r'Nom\s*:\s*([A-Za-z\s]+)', 'last_name'),
            (r'Pr[ée]nom\s*:\s*([A-Za-z\s]+)', 'first_name'),
            (r'\b[0-9]{8}\b', 'id_number'),
            (r'\b\d{2}[/.-]\d{2}[/.-]\d{4}\b', 'date_of_birth'),
            (r'CIN\s*:\s*([0-9]{8})', 'cin_number'),
            (r'Nationalit[ée]\s*:\s*([A-Za-z\s]+)', 'nationality'),
        ]
        
        for pattern, field_name in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                value = match.group(1).strip() if match.lastindex else match.group()
                fields.append({
                    "name": field_name,
                    "value": value,
                    "confidence": 0.85,
                    "type": "text"
                })
        
        return fields
    
    def _extract_invoice_fields(self, text: str) -> List[Dict]:
        """Extract common invoice fields"""
        fields = []

        patterns = [
            # Invoice number: INV-123, NO: INV-123, Invoice #123, Facture N°123
            (r'(?:invoice\s*#?|no\s*[:\-]?\s*inv[-\s]?|facture\s*n[°o]?\s*[:\-]?\s*)([A-Z0-9][-A-Z0-9]+)', 'invoice_number'),
            # Date: 26/06/2022, 26-06-2022, 26 June 2022, June 26 2022, 2022-06-26
            (r'date\s*[:\-]?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4}|\d{4}[/.\-]\d{2}[/.\-]\d{2})', 'date'),
            # Total / Sub Total / Montant total
            (r'(?:sub\s*total|total\s*ttc|total\s*amount|montant\s*total|total)\s*[:\-]?\s*[\$€£S]?\s*([0-9][0-9,. ]+)', 'total_amount'),
            # Due date
            (r'(?:due\s*date|échéance)\s*[:\-]?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|\d{1,2}\s+\w+\s+\d{4})', 'due_date'),
            # Bill to name
            (r'bill\s*to\s*[:\-]?\s*\n?\s*([A-Za-z][A-Za-z\s]{2,40})', 'bill_to'),
            # From / vendor name
            (r'from\s*[:\-]?\s*\n?\s*([A-Za-z][A-Za-z\s]{2,40})', 'vendor_name'),
        ]

        for pattern, field_name in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                fields.append({
                    "name": field_name,
                    "value": match.group(1).strip(),
                    "confidence": 0.85,
                    "type": "text"
                })

        return fields
    
    def _extract_passport_fields(self, text: str) -> List[Dict]:
        """Extract common passport fields"""
        fields = []
        
        patterns = [
            (r'Passport\s*#?\s*[:]?\s*([A-Z0-9]+)', 'passport_number'),
            (r'Surname\s*[:]?\s*([A-Za-z\s]+)', 'surname'),
            (r'Given\s*names?\s*[:]?\s*([A-Za-z\s]+)', 'given_names'),
            (r'Nationality\s*[:]?\s*([A-Za-z\s]+)', 'nationality'),
            (r'Date\s*of\s*birth\s*[:]?\s*(\d{2}[/.-]\d{2}[/.-]\d{4})', 'date_of_birth'),
        ]
        
        for pattern, field_name in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                fields.append({
                    "name": field_name,
                    "value": match.group(1).strip(),
                    "confidence": 0.85,
                    "type": "text"
                })
        
        return fields
    
    def _extract_contract_fields(self, text: str) -> List[Dict]:
        """Extract common contract fields"""
        fields = []
        
        patterns = [
            (r'Contract\s*#?\s*[:]?\s*([A-Z0-9-]+)', 'contract_number'),
            (r'Date\s*[:]?\s*(\d{2}[/.-]\d{2}[/.-]\d{4})', 'date'),
            (r'Between\s*([A-Za-z\s]+)\s*and\s*([A-Za-z\s]+)', 'parties'),
            (r'Effective\s*Date\s*[:]?\s*(\d{2}[/.-]\d{2}[/.-]\d{4})', 'effective_date'),
        ]
        
        for pattern, field_name in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                value = match.group(1).strip() if match.lastindex else match.group()
                fields.append({
                    "name": field_name,
                    "value": value,
                    "confidence": 0.85,
                    "type": "text"
                })
        
        return fields
    
    async def validate_document_type(self, file_path: str, claimed_type: str) -> Dict[str, Any]:
        return {"is_valid": True, "confidence": 0.7, "detected_type": claimed_type, "message": ""}
    
    async def detect_language(self, file_path: str) -> Dict[str, Any]:
        return {"language": "multilingual", "confidence": 0.85}
    
    async def extract_with_translation(self, file_path: str, doc_type: str, target_language: str) -> Dict[str, Any]:
        result = await self.extract_data(file_path, doc_type)
        for field in result.get("fields", []):
            field["original_value"] = field["value"]
            field["needs_translation"] = True
        return result
    
    async def translate_text(self, text: str, target_language: str, source_language: str = None) -> str:
        return text