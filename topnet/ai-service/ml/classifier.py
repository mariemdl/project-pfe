import logging
from typing import Dict, Any, Tuple

logger = logging.getLogger(__name__)


class DocumentClassifier:
    """
    Keyword-based document classifier.
    Works offline with no API calls — covers French, Arabic, and English documents.
    """

    LABELS = ["id_card", "invoice", "passport", "contract"]

    # Each keyword list is ordered by discriminative power
    KEYWORDS: Dict[str, list] = {
        "id_card": [
            # French
            "carte d'identité", "carte nationale", "cin", "carte d'identite",
            "date de naissance", "lieu de naissance", "nationalité",
            "nom:", "prénom:", "nom :", "prénom :",
            # Arabic
            "بطاقة الهوية", "بطاقة هوية", "رقم البطاقة", "تاريخ الميلاد", "مكان الميلاد",
            # English
            "national id", "identity card", "id number", "id card",
        ],
        "invoice": [
            # French
            "facture", "numéro de facture", "montant ttc", "montant ht",
            "tva", "total ttc", "date d'échéance", "bon de commande",
            "référence facture",
            # Arabic
            "فاتورة", "المبلغ الإجمالي", "رقم الفاتورة", "تاريخ الاستحقاق",
            # English
            "invoice", "invoice number", "amount due", "subtotal", "vat",
            "bill to", "due date",
        ],
        "passport": [
            # French
            "passeport", "numéro de passeport", "date d'expiration",
            "autorité de délivrance",
            # Arabic
            "جواز سفر", "رقم جواز السفر", "تاريخ الانتهاء",
            # English
            "passport", "passport no", "place of birth", "date of expiry",
            "nationality", "mrz", "travel document",
        ],
        "contract": [
            # French
            "contrat", "accord", "entre les soussignés", "les parties",
            "clause", "résiliation", "durée du contrat", "objet du contrat",
            "signataire",
            # Arabic
            "عقد", "اتفاقية", "الطرف الأول", "الطرف الثاني", "بنود العقد",
            # English
            "contract", "agreement", "hereby agree", "terms and conditions",
            "parties", "obligations", "termination", "effective date",
        ],
    }

    def __init__(self):
        self.is_loaded = True
        logger.info("Keyword DocumentClassifier initialized (offline, free)")

    def classify(self, text: str) -> Dict[str, Any]:
        if not text or len(text.strip()) < 10:
            return {
                "detected_type": "unknown",
                "confidence": 0.0,
                "is_valid": False,
                "message": "Text too short to classify",
            }
        return self._keyword_classify(text)

    def predict(self, text: str) -> Tuple[str, float]:
        result = self.classify(text)
        return result["detected_type"], result["confidence"]

    def _keyword_classify(self, text: str) -> Dict[str, Any]:
        text_lower = text.lower()

        scores: Dict[str, int] = {}
        for doc_type, keywords in self.KEYWORDS.items():
            # Weight longer / more specific keywords higher
            score = sum(len(kw.split()) for kw in keywords if kw in text_lower)
            scores[doc_type] = score

        best = max(scores, key=scores.get)
        best_score = scores[best]

        if best_score == 0:
            return {
                "detected_type": "unknown",
                "confidence": 0.0,
                "is_valid": False,
                "message": "No document keywords found",
            }

        # Normalize: cap at 0.95, min at 0.60 when any keyword hit
        confidence = min(0.95, 0.60 + best_score * 0.025)
        return {
            "detected_type": best,
            "confidence": round(confidence, 4),
            "is_valid": confidence >= 0.60,
            "message": f"Detected as {best} with {confidence * 100:.1f}% confidence",
        }


# Singleton instance
classifier = DocumentClassifier()
