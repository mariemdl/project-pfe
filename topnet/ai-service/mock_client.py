import random
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

class MockAIClient:
    """Mock AI client for testing"""
    
    async def extract_data(self, text: str, doc_type: str) -> Dict[str, Any]:
        logger.info(f"Mock extract_data for {doc_type}")
        
        mock_responses = {
            'id-card': {
                "fields": [
                    {"name": "cin_number", "value": "123456789", "confidence": 0.98},
                    {"name": "full_name", "value": "Jean Dupont", "confidence": 0.95},
                    {"name": "date_of_birth", "value": "15/03/1985", "confidence": 0.99},
                    {"name": "address", "value": "123 Rue de la Paix, Paris", "confidence": 0.85}
                ],
                "language": "fr"
            },
            'invoice': {
                "fields": [
                    {"name": "invoice_number", "value": "INV-2024-001", "confidence": 0.99},
                    {"name": "date", "value": "2024-03-15", "confidence": 0.98},
                    {"name": "vendor_name", "value": "Company SARL", "confidence": 0.95},
                    {"name": "total", "value": "1250.00", "confidence": 0.99}
                ],
                "language": "fr",
                "metadata": {
                    "line_items": [
                        {"description": "Service A", "quantity": 2, "unit_price": 500, "total": 1000}
                    ]
                }
            },
            'passport': {
                "fields": [
                    {"name": "passport_number", "value": "AB123456", "confidence": 0.99},
                    {"name": "surname", "value": "DUPONT", "confidence": 0.98},
                    {"name": "given_names", "value": "Jean Pierre", "confidence": 0.98},
                    {"name": "nationality", "value": "FRANÇAISE", "confidence": 0.99}
                ],
                "language": "fr"
            },
            'contract': {
                "fields": [
                    {"name": "contract_number", "value": "CTR-2024-001", "confidence": 0.97},
                    {"name": "contract_date", "value": "2024-03-01", "confidence": 0.96},
                    {"name": "title", "value": "Service Agreement", "confidence": 0.95}
                ],
                "language": "fr"
            }
        }
        
        return mock_responses.get(doc_type, mock_responses['id-card'])
    
    async def detect_language(self, text: str) -> Dict[str, Any]:
        languages = ['fr', 'en', 'ar']
        return {
            "language": random.choice(languages),
            "confidence": random.uniform(0.85, 0.99)
        }
    
    async def translate(self, text: str, target_language: str) -> str:
        return f"[{target_language}] {text}"