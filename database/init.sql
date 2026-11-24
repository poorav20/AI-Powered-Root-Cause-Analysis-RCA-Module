-- Initialize database schema for RCA Module
-- This script runs automatically when PostgreSQL container starts

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create custom types
DO $$ BEGIN
    CREATE TYPE deviation_status AS ENUM ('open', 'under_investigation', 'rca_complete', 'capa_pending', 'capa_implemented', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE deviation_severity AS ENUM ('critical', 'major', 'minor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE investigation_method AS ENUM ('five_whys', 'fishbone', 'fault_tree', 'fmea');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE capa_type AS ENUM ('corrective', 'preventive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE capa_status AS ENUM ('pending', 'in_progress', 'completed', 'verified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Create deviations table
CREATE TABLE IF NOT EXISTS deviations (
    id SERIAL PRIMARY KEY,
    deviation_number VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    product_name VARCHAR(255),
    batch_number VARCHAR(100),
    manufacturing_date TIMESTAMP,
    expiry_date TIMESTAMP,
    severity deviation_severity DEFAULT 'minor',
    status deviation_status DEFAULT 'open',
    reported_by VARCHAR(255),
    reported_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_to VARCHAR(255),
    department VARCHAR(100),
    equipment_involved TEXT,
    source_type VARCHAR(80),
    expected_outcome TEXT,
    actual_outcome TEXT,
    affected_quantity VARCHAR(120),
    impact_summary TEXT,
    raw_input_text TEXT,
    source_document_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE deviations ADD COLUMN IF NOT EXISTS source_type VARCHAR(80);
ALTER TABLE deviations ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMP;
ALTER TABLE deviations ADD COLUMN IF NOT EXISTS expected_outcome TEXT;
ALTER TABLE deviations ADD COLUMN IF NOT EXISTS actual_outcome TEXT;
ALTER TABLE deviations ADD COLUMN IF NOT EXISTS affected_quantity VARCHAR(120);
ALTER TABLE deviations ADD COLUMN IF NOT EXISTS impact_summary TEXT;

-- Create investigations table
CREATE TABLE IF NOT EXISTS investigations (
    id SERIAL PRIMARY KEY,
    deviation_id INTEGER NOT NULL REFERENCES deviations(id) ON DELETE CASCADE,
    method investigation_method DEFAULT 'five_whys',
    why_1 TEXT,
    why_2 TEXT,
    why_3 TEXT,
    why_4 TEXT,
    why_5 TEXT,
    man_factors JSONB,
    machine_factors JSONB,
    material_factors JSONB,
    method_factors JSONB,
    environment_factors JSONB,
    measurement_factors JSONB,
    root_causes JSONB,
    contributing_factors JSONB,
    missing_evidence JSONB,
    investigation_summary TEXT,
    investigator_notes TEXT,
    ai_generated BOOLEAN DEFAULT FALSE,
    ai_confidence_score REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create capa_actions table
CREATE TABLE IF NOT EXISTS capa_actions (
    id SERIAL PRIMARY KEY,
    deviation_id INTEGER NOT NULL REFERENCES deviations(id) ON DELETE CASCADE,
    action_type capa_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    root_cause_addressed VARCHAR(255),
    assigned_to VARCHAR(255),
    due_date TIMESTAMP,
    completion_date TIMESTAMP,
    status capa_status DEFAULT 'pending',
    effectiveness_check TEXT,
    effectiveness_date TIMESTAMP,
    ai_generated BOOLEAN DEFAULT FALSE,
    ai_reasoning TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    deviation_id INTEGER REFERENCES deviations(id) ON DELETE SET NULL,
    filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(50),
    file_size INTEGER,
    extracted_text TEXT,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT FALSE
);

-- ==================== RAG Tables ====================

-- Knowledge bases for organizing documents
CREATE TABLE IF NOT EXISTS knowledge_bases (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    domain VARCHAR(100) DEFAULT 'pharmaceutical',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Documents in knowledge bases
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id SERIAL PRIMARY KEY,
    knowledge_base_id INTEGER NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    source_type VARCHAR(50),
    source_path VARCHAR(1000),
    content_hash VARCHAR(64),
    metadata JSONB,
    processing_status VARCHAR(50) DEFAULT 'pending',
    chunk_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Document chunks with vector embeddings
CREATE TABLE IF NOT EXISTS document_chunks (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER,
    embedding VECTOR(384),
    chunk_metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- RAG query logs for analytics
CREATE TABLE IF NOT EXISTS rca_query_logs (
    id SERIAL PRIMARY KEY,
    deviation_id INTEGER REFERENCES deviations(id) ON DELETE SET NULL,
    query_text TEXT NOT NULL,
    query_type VARCHAR(50),
    retrieved_chunks JSONB,
    llm_response TEXT,
    confidence_score REAL,
    response_time_ms INTEGER,
    user_feedback VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Links between deviations and knowledge documents
CREATE TABLE IF NOT EXISTS deviation_knowledge_links (
    id SERIAL PRIMARY KEY,
    deviation_id INTEGER NOT NULL REFERENCES deviations(id) ON DELETE CASCADE,
    document_id INTEGER NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    chunk_ids INTEGER[],
    relevance_score REAL,
    link_type VARCHAR(50),
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_deviations_status ON deviations(status);
CREATE INDEX IF NOT EXISTS idx_deviations_severity ON deviations(severity);
CREATE INDEX IF NOT EXISTS idx_deviations_product ON deviations(product_name);
CREATE INDEX IF NOT EXISTS idx_deviations_batch ON deviations(batch_number);
CREATE INDEX IF NOT EXISTS idx_deviations_created ON deviations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_investigations_deviation ON investigations(deviation_id);
CREATE INDEX IF NOT EXISTS idx_capa_deviation ON capa_actions(deviation_id);
CREATE INDEX IF NOT EXISTS idx_capa_status ON capa_actions(status);
CREATE INDEX IF NOT EXISTS idx_documents_deviation ON documents(deviation_id);

-- RAG indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_domain ON knowledge_bases(domain);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_kb ON knowledge_documents(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_status ON knowledge_documents(processing_status);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_hash ON knowledge_documents(content_hash);
CREATE INDEX IF NOT EXISTS idx_document_chunks_document ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON document_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_rca_query_logs_deviation ON rca_query_logs(deviation_id);
CREATE INDEX IF NOT EXISTS idx_rca_query_logs_created ON rca_query_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deviation_knowledge_links_dev ON deviation_knowledge_links(deviation_id);
CREATE INDEX IF NOT EXISTS idx_deviation_knowledge_links_doc ON deviation_knowledge_links(document_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS update_deviations_updated_at ON deviations;
CREATE TRIGGER update_deviations_updated_at
    BEFORE UPDATE ON deviations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_investigations_updated_at ON investigations;
CREATE TRIGGER update_investigations_updated_at
    BEFORE UPDATE ON investigations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_capa_actions_updated_at ON capa_actions;
CREATE TRIGGER update_capa_actions_updated_at
    BEFORE UPDATE ON capa_actions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_knowledge_bases_updated_at ON knowledge_bases;
CREATE TRIGGER update_knowledge_bases_updated_at
    BEFORE UPDATE ON knowledge_bases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_knowledge_documents_updated_at ON knowledge_documents;
CREATE TRIGGER update_knowledge_documents_updated_at
    BEFORE UPDATE ON knowledge_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data for testing (optional)
INSERT INTO deviations (deviation_number, title, description, product_name, batch_number, severity, status, reported_by, department, equipment_involved)
VALUES 
    ('DEV-2024-0001', 'Out of Specification Assay Result', 'Batch BATCH-2024-001 of Aspirin API showed assay result of 97.2% (spec: 98.0-102.0%) during release testing.', 'Aspirin API', 'BATCH-2024-001', 'major', 'under_investigation', 'John Smith', 'Quality Control', 'HPLC System - Waters 2695'),
    ('DEV-2024-0002', 'Temperature Excursion in Reactor', 'Reactor R-101 temperature exceeded 85°C (limit: 80°C) for 15 minutes during Paracetamol Intermediate synthesis.', 'Paracetamol Intermediate', 'BATCH-2024-002', 'critical', 'open', 'Jane Doe', 'Production', 'Reactor R-101, Temperature Controller TC-101'),
    ('DEV-2024-0003', 'Particulate Matter in Final Product', 'Visual inspection revealed visible particulates in 3 out of 100 vials of Ibuprofen API Batch BATCH-2024-003.', 'Ibuprofen API', 'BATCH-2024-003', 'minor', 'rca_complete', 'Mike Johnson', 'Quality Assurance', 'Filling Line FL-200, Filtration System FS-05')
ON CONFLICT (deviation_number) DO NOTHING;

-- Create default knowledge base
INSERT INTO knowledge_bases (name, description, domain)
VALUES 
    ('Pharmaceutical Manufacturing Knowledge Base', 'Core knowledge base for API manufacturing deviations, regulations, and best practices', 'pharmaceutical'),
    ('Regulatory Guidelines', 'FDA 21 CFR, ICH Guidelines, EU GMP, and other regulatory documents', 'regulatory'),
    ('Case Studies', 'Historical deviation case studies and lessons learned', 'case_studies')
ON CONFLICT (name) DO NOTHING;
