import os
from pydantic_settings import BaseSettings

from pydantic_settings import BaseSettings
from typing import List
import json

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/topnet_db"
    AI_API_URL: str = "http://ai-api:8001"
    AI_TIMEOUT: int = 30
    UPLOAD_BASE_PATH: str = "./uploads"
    REPORTS_BASE_PATH: str = "./reports"
    MAX_FILE_SIZE: int = 10485760
    ALLOWED_EXTENSIONS: List[str] = ['.jpg', '.jpeg', '.png', '.tiff', '.bmp', '.pdf', '.doc', '.docx', '.txt']
    MAX_CONCURRENT_DOCUMENTS: int = 3
    PROGRESS_POLL_INTERVAL: int = 2
    CLEANUP_OLD_BATCHES_DAYS: int = 30
    CLEANUP_TEMP_HOURS: int = 24
    FRONTEND_URL: str = "http://localhost" #hedha lel pass reset
    APP_URL: str = os.getenv("APP_URL", "http://localhost:4200")

    # hedha lel mail
    SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD:str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM_EMAIL: str = os.getenv("FROM_EMAIL", SMTP_USERNAME)

    @classmethod
    def parse_env_var(cls, field_name: str, raw_val: str):
        if field_name == "ALLOWED_EXTENSIONS" and isinstance(raw_val, str):
            # Split comma-separated string and clean up
            return [ext.strip().strip('"') for ext in raw_val.split(',')]
        return super().parse_env_var(field_name, raw_val)

    class Config:
        env_file = ".env"
        case_sensitive = False
        env_file_encoding = 'utf-8'

settings = Settings()