"""AI client — OpenRouter Vision (primary) or Tesseract (fallback)"""
import os
import json
import base64
import logging
import tempfile
from pathlib import Path
from typing import Dict, Any, Optional, List

from .ai_service_client import ai_service_client

import pytesseract
from PIL import Image
import pdf2image

logger = logging.getLogger(__name__)

OCR_LANGUAGES = "ara+fra+eng"

# Windows paths for Tesseract / Poppler (no-op inside Docker)
if os.name == "nt":
    import shutil as _shutil
    if not _shutil.which("tesseract"):
        pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

_POPPLER_PATH: Optional[str] = None
if os.name == "nt":
    import shutil as _shutil2
    if not _shutil2.which("pdftoppm"):
        _POPPLER_PATH = r"C:\poppler\Library\bin"

# ── Groq API key (lazy read) ─────────────────────────────────────────────────
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"

def _get_groq_key() -> Optional[str]:
    return os.getenv("GROQ_API_KEY") or None


# ── Field extraction prompts per document type ───────────────────────────────
_FIELD_PROMPTS: Dict[str, str] = {
    "id-card": """First, determine if this image shows an identity card (CIN, carte d'identité nationale, national ID card, or similar government-issued ID).
If it does NOT appear to be an identity card, return ONLY this JSON:
{"error": "not_id_card", "message": "This image does not appear to be an ID card. Please upload a valid identity card."}

If it IS an identity card, extract every visible field and return a JSON with these keys (use null if not found):
last_name, first_name, id_number, date_of_birth, place_of_birth, nationality, expiry_date, address, detected_language
detected_language should be the language of the document (e.g. arabic, french, english).
Example: {"last_name": "BEN ALI", "first_name": "Mohamed", "id_number": "12345678", "detected_language": "arabic"}
Return ONLY the JSON, no explanation.""",

    "passport": """Extract every field visible in this passport image.
Return a JSON object with these keys (use null if not found):
surname, given_names, passport_number, nationality, date_of_birth, place_of_birth, date_of_issue, date_of_expiry, sex, mrz_line1, mrz_line2, detected_language
detected_language should be the language of the document (e.g. arabic, french, english).
Return ONLY the JSON, no explanation.""",

    "invoice": """Extract every field visible in this invoice image.
Return a JSON object with these keys (use null if not found):
invoice_number, date, due_date, bill_to, vendor_name, subtotal, total_amount, tax, currency, payment_bank, payment_account, email, detected_language
detected_language should be the language of the document (e.g. arabic, french, english).
Return ONLY the JSON, no explanation.""",

    "contract": """Extract every field visible in this contract document.
Return a JSON object with these keys (use null if not found):
contract_number, contract_date, effective_date, party_1, party_2, subject, duration, value, governing_law, detected_language
detected_language should be the language of the document (e.g. arabic, french, english).
Return ONLY the JSON, no explanation.""",
}


def _try_pymupdf_text(file_path: Path) -> str:
    try:
        import fitz
        doc = fitz.open(str(file_path))
        text = "\n".join(page.get_text() for page in doc)
        doc.close()
        return text
    except Exception:
        return ""


def _image_to_base64(file_path: Path) -> tuple:
    """Returns (base64_string, mime_type)"""
    mime_map = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".jfif": "image/jpeg",
        ".png": "image/png", ".webp": "image/webp",
        ".tiff": "image/tiff", ".bmp": "image/bmp",
    }
    mime = mime_map.get(file_path.suffix.lower(), "image/jpeg")
    with open(file_path, "rb") as f:
        return base64.b64encode(f.read()).decode(), mime


class AIClient:

    async def detect_language(self, file_path: Path) -> Dict[str, Any]:
        api_key = _get_groq_key()
        if api_key:
            text = self._extract_text(file_path)
            if text.strip():
                import httpx
                try:
                    async with httpx.AsyncClient(timeout=20) as client:
                        response = await client.post(
                            GROQ_URL,
                            headers={"Authorization": f"Bearer {api_key}"},
                            json={
                                "model": "llama-3.3-70b-versatile",
                                "messages": [{
                                    "role": "user",
                                    "content": f"Detect the language of this text. Reply with ONLY one word (e.g. arabic, french, english):\n\n{text[:500]}"
                                }],
                            },
                        )
                        response.raise_for_status()
                        lang = response.json()["choices"][0]["message"]["content"].strip().lower()
                        return {"language": lang, "confidence": 0.95}
                except Exception as e:
                    logger.error(f"Groq language detection failed: {e}")
        text = self._extract_text(file_path)
        return await ai_service_client.detect_language(text)

    async def validate_type(self, file_path: Path, claimed_type: str) -> Dict[str, Any]:
        text = self._extract_text(file_path)
        if not text.strip():
            return {"is_type": True, "confidence": 0.5}
        try:
            return await ai_service_client.validate_document_type(text, claimed_type)
        except Exception as e:
            logger.warning(f"Validation failed: {e}")
            return {"is_type": True, "confidence": 0.5}

    async def verify_id_pair(self, front_path: Path, back_path: Path) -> Dict[str, Any]:
        return {"same_card": True, "confidence": 0.9}

    async def split_documents(self, pdf_path: Path) -> Dict[str, Any]:
        return {"document_count": 1, "pages": [[1, 1]]}

    async def extract_data(self, file_path: Path, doc_type: str) -> Dict[str, Any]:
        """
        If OpenRouter key is set: extract structured fields directly from the image.
        Otherwise: OCR with Tesseract, then send text to ai-service for regex extraction.
        """
        api_key = _get_groq_key()
        if api_key:
            return await self._openrouter_extract_fields(api_key, file_path, doc_type)
        # Fallback: Tesseract + ai-service regex
        text = self._extract_text(file_path)
        return await ai_service_client.extract_data(text, doc_type)

    async def translate_text(self, text: str, target_language: str,
                              source_language: Optional[str] = None) -> str:
        api_key = _get_groq_key()
        if api_key:
            return await self._groq_translate(api_key, text, target_language, source_language)
        return text

    # ── OpenRouter extraction ─────────────────────────────────────────────────

    async def _openrouter_extract_fields(self, api_key: str, file_path: Path,
                                          doc_type: str) -> Dict[str, Any]:
        """Use Groq vision model to extract structured fields from the document."""
        import io
        import httpx

        try:
            prompt = _FIELD_PROMPTS.get(doc_type, _FIELD_PROMPTS["invoice"])
            images = self._load_images_for_vision(file_path)

            if not images:
                raise ValueError("Could not load any images from file")

            content = []
            for item in images:
                if isinstance(item, str):
                    content.append({"type": "text", "text": item})
                else:
                    buf = io.BytesIO()
                    item.save(buf, format="JPEG")
                    b64 = base64.b64encode(buf.getvalue()).decode()
                    content.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                    })
            content.append({"type": "text", "text": prompt})

            import asyncio
            async with httpx.AsyncClient(timeout=60) as client:
                for attempt in range(3):
                    response = await client.post(
                        GROQ_URL,
                        headers={"Authorization": f"Bearer {api_key}"},
                        json={
                            "model": GROQ_MODEL,
                            "messages": [{"role": "user", "content": content}],
                        },
                    )
                    if response.status_code == 429 and attempt < 2:
                        await asyncio.sleep(15 * (attempt + 1))
                        continue
                    response.raise_for_status()
                    break
                raw = response.json()["choices"][0]["message"]["content"].strip()

            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            raw = raw.strip()

            data = json.loads(raw)

            # AI rejected the document type (e.g., not an ID card)
            if "error" in data:
                raise ValueError(data.get("message", data["error"]))

            detected_language = str(data.pop("detected_language", "unknown")).lower()

            fields = [
                {
                    "name": key,
                    "value": str(val),
                    "confidence": 0.92,
                    "type": "text",
                }
                for key, val in data.items()
                if val is not None and str(val).strip() not in ("", "null", "None")
            ]

            logger.info(f"Groq extracted {len(fields)} fields for {doc_type} in {detected_language}")
            return {
                "fields": fields,
                "language": detected_language,
                "metadata": {"source": "groq-vision"},
            }

        except ValueError as e:
            # Document type validation failure — propagate so the processor marks it failed
            raise
        except Exception as e:
            logger.error(f"Groq extraction failed: {e}, falling back to Tesseract")
            text = self._extract_text(file_path)
            return await ai_service_client.extract_data(text, doc_type)

    async def _groq_translate(self, api_key: str, text: str, target_language: str,
                               source_language: Optional[str] = None) -> str:
        import httpx
        src = f" from {source_language}" if source_language else ""
        prompt = (
            f"Translate the following text{src} to {target_language}. "
            f"Return ONLY the translated text, no explanations, no quotes:\n\n{text}"
        )
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    GROQ_URL,
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "model": "llama-3.3-70b-versatile",
                        "messages": [{"role": "user", "content": prompt}],
                    },
                )
                response.raise_for_status()
                return response.json()["choices"][0]["message"]["content"].strip()
        except Exception as e:
            logger.error(f"Groq translation failed: {e}")
            return text

    def _load_images_for_vision(self, file_path: Path) -> List:
        """Load file as PIL Image(s) for Gemini."""
        ext = file_path.suffix.lower()

        if ext == ".pdf":
            embedded = _try_pymupdf_text(file_path)
            if len(embedded.strip().replace(" ", "")) > 50:
                # Digital PDF — return text directly, no vision needed
                return [embedded[:8000]]

            # Scanned PDF — convert pages to images
            pages = pdf2image.convert_from_path(
                str(file_path), dpi=200, poppler_path=_POPPLER_PATH
            )
            images = []
            for page in pages[:5]:  # max 5 pages
                if page.mode != "RGB":
                    page = page.convert("RGB")
                images.append(page)
            return images

        # Single image file
        image = Image.open(file_path)
        if image.mode != "RGB":
            image = image.convert("RGB")
        return [image]

    # ── Tesseract extraction ─────────────────────────────────────────────────

    def _extract_text(self, file_path: Path) -> str:
        try:
            ext = file_path.suffix.lower()
            if ext == ".pdf":
                return self._extract_pdf(file_path)
            if ext in {".jpg", ".jpeg", ".jfif", ".png", ".tiff", ".bmp", ".webp"}:
                return self._tesseract_image(file_path)
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()[:50000]
        except Exception as e:
            logger.error(f"Text extraction failed for {file_path}: {e}")
            return ""

    def _extract_pdf(self, file_path: Path) -> str:
        embedded = _try_pymupdf_text(file_path)
        if len(embedded.strip().replace("\n", "").replace(" ", "")) > 50:
            logger.info(f"PyMuPDF: {len(embedded)} chars from {file_path.name}")
            return embedded[:50000]
        logger.info(f"Scanned PDF — running Tesseract on {file_path.name}")
        images = pdf2image.convert_from_path(
            str(file_path), dpi=300, poppler_path=_POPPLER_PATH
        )
        texts = []
        for i, img in enumerate(images):
            if img.mode != "RGB":
                img = img.convert("RGB")
            t = pytesseract.image_to_string(img, lang=OCR_LANGUAGES)
            texts.append(f"--- Page {i+1} ---\n{t}")
        return "\n".join(texts)[:50000]

    def _tesseract_image(self, file_path: Path) -> str:
        image = Image.open(file_path)
        if image.mode != "RGB":
            image = image.convert("RGB")
        text = pytesseract.image_to_string(image, lang=OCR_LANGUAGES)
        logger.info(f"Tesseract: {len(text)} chars from {file_path.name}")
        return text[:50000]


ai_client = AIClient()
