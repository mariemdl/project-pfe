import os
import logging
import tempfile
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
from dotenv import load_dotenv
import httpx

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from easy_ocr import EasyOCRClient
ai_client = EasyOCRClient()
mode = "TESSERACT (free/offline)"

from ml.classifier import classifier

logger.info(f"AI Service started — mode: {mode}")

app = FastAPI(title="AI Extraction Service")


# -------------------------------------------------------------------
# Request / Response models
# -------------------------------------------------------------------
class ExtractRequest(BaseModel):
    text: str
    document_type: str

class ExtractResponse(BaseModel):
    fields: list
    language: str
    metadata: Optional[Dict] = None

class ValidateRequest(BaseModel):
    text: str
    document_type: str

class ValidateResponse(BaseModel):
    is_type: bool
    confidence: float
    detected_type: str
    message: str

class LanguageDetectRequest(BaseModel):
    text: str

class LanguageDetectResponse(BaseModel):
    language: str
    confidence: float

class ExtractAndTranslateRequest(BaseModel):
    text: str
    document_type: str
    target_language: str

class TranslateRequest(BaseModel):
    text: str
    target_language: str
    source_language: Optional[str] = None

class TranslateResponse(BaseModel):
    translated_text: str
    source_language: str
    target_language: str


# -------------------------------------------------------------------
# Endpoints
# -------------------------------------------------------------------
@app.get("/health")
async def health_check():
    return {"status": "healthy", "mode": mode, "classification_ready": True}


@app.post("/validate", response_model=ValidateResponse)
async def validate_document(request: ValidateRequest):
    """Classify document text and check it matches the claimed type"""
    logger.info(f"Validating document type: {request.document_type}")
    try:
        result = classifier.classify(request.text)
        claimed = request.document_type.lower().replace("-", "_")
        detected = result.get("detected_type", "unknown")
        confidence = result.get("confidence", 0.0)
        is_match = (detected == claimed) or (detected == "unknown")
        return ValidateResponse(
            is_type=is_match,
            confidence=confidence,
            detected_type=detected,
            message=result.get("message", ""),
        )
    except Exception as e:
        logger.error(f"Validation failed: {e}")
        return ValidateResponse(
            is_type=True, confidence=0.5,
            detected_type=request.document_type, message=str(e),
        )


@app.post("/detect-language", response_model=LanguageDetectResponse)
async def detect_language(request: LanguageDetectRequest):
    """Detect the language of the provided text"""
    if not request.text or len(request.text.strip()) < 10:
        return LanguageDetectResponse(language="english", confidence=0.5)

    text = request.text.lower()

    lang_keywords = {
        "french":  ["le", "la", "les", "un", "une", "de", "et", "à", "est", "pour", "dans", "avec"],
        "arabic":  [],  # detected via Unicode range below
        "german":  ["der", "die", "das", "und", "von", "mit", "für", "auf", "bei", "nach"],
        "spanish": ["el", "la", "los", "las", "y", "de", "en", "por", "para", "con"],
        "italian": ["il", "la", "le", "gli", "e", "di", "a", "per", "con", "su"],
    }

    scores: Dict[str, float] = {}
    for lang, keywords in lang_keywords.items():
        if lang == "arabic":
            scores[lang] = sum(1 for c in request.text if "؀" <= c <= "ۿ") / 10
        else:
            scores[lang] = sum(1 for w in keywords if f" {w} " in f" {text} ")

    best_lang = max(scores, key=scores.get)
    best_score = scores[best_lang]

    if best_score == 0:
        return LanguageDetectResponse(language="english", confidence=0.6)

    confidence = min(0.95, best_score / 10)
    return LanguageDetectResponse(language=best_lang, confidence=confidence)


@app.post("/extract", response_model=ExtractResponse)
async def extract_data(request: ExtractRequest):
    """Extract structured fields from document text"""
    logger.info(f"Extracting data for document type: {request.document_type}")

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".txt", delete=False, encoding="utf-8"
    ) as f:
        f.write(request.text)
        temp_path = f.name

    try:
        result = await ai_client.extract_data(temp_path, request.document_type)
        return ExtractResponse(
            fields=result.get("fields", []),
            language=result.get("language", "multilingual"),
            metadata=result.get("metadata"),
        )
    except Exception as e:
        logger.error(f"Extraction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(temp_path)


@app.post("/extract-and-translate")
async def extract_and_translate(request: ExtractAndTranslateRequest):
    """Extract and mark fields for translation"""
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".txt", delete=False, encoding="utf-8"
    ) as f:
        f.write(request.text)
        temp_path = f.name

    try:
        result = await ai_client.extract_with_translation(
            temp_path, request.document_type, request.target_language
        )
        return result
    except Exception as e:
        logger.error(f"Extract-and-translate failed: {e}")
        return {"error": str(e)}
    finally:
        os.unlink(temp_path)


@app.post("/translate", response_model=TranslateResponse)
async def translate_text(request: TranslateRequest):
    """Translate text via LibreTranslate"""
    lang_map = {
        "english": "en", "french": "fr", "arabic": "ar",
        "german": "de", "spanish": "es", "italian": "it",
    }

    source_lang = request.source_language or "english"
    if not request.source_language:
        if any(c in "éèêëàâçîïôûùüÿ" for c in request.text):
            source_lang = "french"
        elif any("؀" <= c <= "ۿ" for c in request.text):
            source_lang = "arabic"

    source_code = lang_map.get(source_lang.lower(), "en")
    target_code = lang_map.get(request.target_language.lower(), "en")

    if source_code == target_code:
        return TranslateResponse(
            translated_text=request.text,
            source_language=source_lang,
            target_language=request.target_language,
        )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "http://libretranslate:5000/translate",
                json={"q": request.text, "source": source_code, "target": target_code, "format": "text"},
            )
            if response.status_code == 200:
                translated = response.json().get("translatedText", request.text)
                return TranslateResponse(
                    translated_text=translated,
                    source_language=source_lang,
                    target_language=request.target_language,
                )
    except Exception as e:
        logger.error(f"Translation failed: {e}")

    return TranslateResponse(
        translated_text=request.text,
        source_language=source_lang,
        target_language=request.target_language,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
