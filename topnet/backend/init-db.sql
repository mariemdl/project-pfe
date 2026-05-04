-- Create database
CREATE DATABASE IF NOT EXISTS topnet_db;

-- Connect to database
\c topnet_db;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create tables
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE batches (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    document_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'processing',
    total_documents INTEGER NOT NULL,
    processed_documents INTEGER DEFAULT 0,
    storage_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE INDEX idx_batches_status ON batches(status);
CREATE INDEX idx_batches_user ON batches(user_id);

CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE,
    sequence_number INTEGER NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    original_file_path VARCHAR(500) NOT NULL,
    converted_pdf_path VARCHAR(500),
    file_size BIGINT,
    mime_type VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending',
    error_message TEXT,
    processing_started_at TIMESTAMP,
    processing_completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_documents_batch ON documents(batch_id);
CREATE INDEX idx_documents_status ON documents(status);

CREATE TABLE extracted_fields (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    field_name VARCHAR(100) NOT NULL,
    field_type VARCHAR(50),
    original_value TEXT,
    translated_value TEXT,
    confidence FLOAT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_fields_document ON extracted_fields(document_id);

CREATE TABLE translation_requests (
    id SERIAL PRIMARY KEY,
    batch_id INTEGER REFERENCES batches(id),
    target_language VARCHAR(10) NOT NULL,
    translate_all_fields BOOLEAN DEFAULT TRUE,
    requested_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE TABLE document_analysis (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    analysis_type VARCHAR(50),
    result JSONB,
    confidence FLOAT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert default user (for testing)
INSERT INTO users (email) VALUES ('test@topnet.com');