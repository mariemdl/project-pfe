FROM python:3.10-slim

# Install Tesseract OCR, fonts for Arabic support, and WeasyPrint dependencies
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-fra \
    tesseract-ocr-ara \
    poppler-utils \
    # Fonts that support Arabic
    fonts-dejavu \
    fonts-dejavu-core \
    fonts-dejavu-extra \
    fonts-noto-core \
    fonts-noto-extra \
    # WeasyPrint dependencies (corrected package names)
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libffi-dev \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Requirements 
COPY requirements.txt .

# Python dependencies
RUN pip install --no-cache-dir -r requirements.txt weasyprint jinja2

# Copy the rest of the application
COPY . .

# Create storage directories
RUN mkdir -p /app/storage/uploads /app/storage/reports

# Set permissions
RUN chmod -R 755 /app/storage

# Environment variables
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]