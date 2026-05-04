import httpx
import os
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://ai-service:8001")

class AIServiceClient:
    """Client to call the external AI service container"""
    
    def __init__(self):
        self.base_url = AI_SERVICE_URL
        logger.info(f"AI Service client initialized with URL: {self.base_url}")
    
    async def extract_data(self, text: str, document_type: str) -> Dict[str, Any]:
        """Call AI service to extract data"""
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.base_url}/extract",
                json={"text": text, "document_type": document_type}
            )
            response.raise_for_status()
            return response.json()
    
    async def detect_language(self, text: str) -> Dict[str, Any]:
        """Call AI service to detect language"""
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/detect-language",
                json={"text": text}
            )
            response.raise_for_status()
            return response.json()
    
    async def translate(self, text: str, target_language: str, source_language: str = None) -> str:
        """Call AI service to translate text"""
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.base_url}/translate",
                json={
                    "text": text,
                    "target_language": target_language,
                    "source_language": source_language
                }
            )
            response.raise_for_status()
            data = response.json()
            return data["translated_text"]
    
    async def validate_document_type(self, text: str, document_type: str) -> Dict[str, Any]:
        """Call AI service to validate document type"""
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.base_url}/validate",
                json={"text": text, "document_type": document_type}
            )
            response.raise_for_status()
            return response.json()

# Create singleton instance
ai_service_client = AIServiceClient()