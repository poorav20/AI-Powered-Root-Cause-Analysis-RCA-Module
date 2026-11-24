# RAG System Integration Guide

## Overview

The RAG (Retrieval-Augmented Generation) system has been integrated into the AIVOA.AI RCA Module. This system allows you to:

1. **Upload and index documents** (PDFs, research papers, regulations, SOPs, case studies)
2. **Generate vector embeddings** using sentence-transformers (all-MiniLM-L6-v2, 384 dimensions)
3. **Store embeddings in PostgreSQL** with pgvector for efficient similarity search
4. **Query the knowledge base** with natural language and get LLM-generated responses grounded in your documents
5. **Enhance RCA workflows** with relevant regulatory guidance, similar cases, and best practices

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Document Upload │────▶│  Text Chunking   │────▶│  Embedding Gen  │
│  (PDF, DOCX,    │     │  (512 tokens,    │     │  (sentence-     │
│   TXT, etc.)    │     │   50 overlap)    │     │   transformers) │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  LLM Response   │◀────│  RAG Query       │◀────│  Vector Search  │
│  (Groq Llama)   │     │  (Hybrid: Vector │     │  (pgvector      │
│                 │     │   + Keyword)     │     │   cosine sim)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Database Schema (New Tables)

- `knowledge_bases` - Collections of documents organized by domain
- `knowledge_documents` - Individual documents with metadata
- `document_chunks` - Text chunks with vector embeddings (VECTOR(384))
- `rca_query_logs` - Query history for analytics
- `deviation_knowledge_links` - Traceability between deviations and knowledge

## API Endpoints

### Knowledge Base Management
```
POST   /api/v1/rag/knowledge-bases              - Create knowledge base
GET    /api/v1/rag/knowledge-bases              - List knowledge bases
GET    /api/v1/rag/knowledge-bases/{id}         - Get knowledge base
PUT    /api/v1/rag/knowledge-bases/{id}         - Update knowledge base
DELETE /api/v1/rag/knowledge-bases/{id}         - Delete knowledge base
GET    /api/v1/rag/knowledge-bases/{id}/stats   - Get statistics
```

### Document Management
```
POST   /api/v1/rag/knowledge-bases/{kb_id}/documents/upload  - Upload document
GET    /api/v1/rag/knowledge-bases/{kb_id}/documents         - List documents
GET    /api/v1/rag/documents/{id}                            - Get document
GET    /api/v1/rag/documents/{id}/chunks                     - Get document chunks
PUT    /api/v1/rag/documents/{id}                            - Update document
DELETE /api/v1/rag/documents/{id}                            - Delete document
POST   /api/v1/rag/documents/{id}/reprocess                  - Reprocess document
POST   /api/v1/rag/batch-process                             - Batch process documents
```

### RAG Queries
```
POST   /api/v1/rag/query                          - General RAG query
POST   /api/v1/rag/query/rca                      - RCA-specific query
POST   /api/v1/rag/query/investigation-guidance   - Investigation guidance
POST   /api/v1/rag/query/similar-cases            - Find similar cases
POST   /api/v1/rag/query/enhance-rca/{deviation_id} - Enhance existing RCA
```

### Deviation Knowledge Links
```
POST   /api/v1/rag/deviations/{deviation_id}/knowledge-links  - Link deviation to knowledge
GET    /api/v1/rag/deviations/{deviation_id}/knowledge-links  - Get deviation knowledge links
```

### Analytics
```
GET    /api/v1/rag/analytics                      - System analytics
```

## Frontend Pages

### Knowledge Base Management (`/knowledge-base`)
- Create and manage knowledge bases
- Upload documents (PDF, DOCX, TXT, etc.)
- View document processing status
- Execute RAG queries with multiple query types
- View retrieval sources and confidence scores

### Integration with Existing Pages
- **Investigation Page**: "Run AI Analysis" now uses RAG for enhanced results
- **Deviation Detail**: "Run AI Analysis" button triggers RAG-enhanced workflow
- **CAPA Page**: "AI Recommendations" uses RAG for regulatory-grounded suggestions

## Query Types

| Type | Use Case | Context |
|------|----------|---------|
| `root_cause` | 5 Whys, Fishbone analysis | Deviation text + knowledge base |
| `capa` | Corrective/Preventive actions | Root causes + regulations |
| `investigation` | Next steps, missing evidence | Current findings + guidelines |
| `similar_case` | Historical case matching | Deviation description |
| `regulation` | Compliance questions | Specific regulation sections |
| `general` | Any pharmaceutical QA question | Full knowledge base |

## Running the System

### 1. Start with Docker (Recommended)
```bash
# The database init.sql now includes pgvector extension
docker compose up --build -d

# Wait for services to be healthy
docker compose ps
```

### 2. Manual Setup (if not using Docker)

#### PostgreSQL with pgvector
```bash
# Install pgvector extension
# On Ubuntu/Debian:
sudo apt-get install postgresql-15-pgvector

# Or compile from source:
git clone https://github.com/pgvector/pgvector
cd pgvector
make
sudo make install

# Enable in database:
psql -d rca_db -c "CREATE EXTENSION vector;"
```

#### Python Dependencies
```bash
cd backend
pip install -r requirements.txt
# Key RAG packages:
# sentence-transformers==2.2.2
# pgvector==0.2.3
# faiss-cpu==1.7.4
```

#### Run Backend
```bash
cd backend
source venv/bin/activate  # or venv\Scripts\activate on Windows
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Run Frontend
```bash
cd frontend
npm install
npm run dev
```

## Using the RAG System

### 1. Create a Knowledge Base
1. Navigate to **Knowledge Base** in the sidebar
2. Click **"New Knowledge Base"**
3. Enter name, domain (pharmaceutical/regulatory/case_studies), and description

### 2. Upload Documents
1. Select a knowledge base
2. Click **"Upload Document"**
3. Choose file (PDF, DOCX, TXT)
4. Add title, source type, and metadata (JSON)
5. Document processes in background - check status

### 3. Query the Knowledge Base
1. Go to **"RAG Query"** tab
2. Select query type (Root Cause, CAPA, Investigation, etc.)
3. Enter your question
4. Click **"Execute Query"**
5. Review response with sources and confidence score

### 4. Enhance Existing RCA
1. Open any deviation
2. Click **"Run AI Analysis"** or **"Enhance with RAG"**
3. System retrieves relevant knowledge and enhances analysis

## Example Queries

### Root Cause Analysis
```
"Batch BATCH-2024-001 of Aspirin API showed assay result of 97.2% 
(spec: 98.0-102.0%). What are potential root causes using 5 Whys methodology?"
```

### CAPA Recommendations
```
"For a temperature excursion in Reactor R-101 (exceeded 85°C, limit 80°C 
for 15 minutes), what corrective and preventive actions are recommended 
per FDA 21 CFR 211 and ICH Q7?"
```

### Investigation Guidance
```
"We found particulate matter in 3/100 vials of Ibuprofen API. 
What investigation steps should we take? What evidence is needed?"
```

### Similar Cases
```
"Find similar cases to: 'HPLC assay out of specification for Aspirin API 
batch due to column degradation'"
```

### Regulatory Query
```
"What does ICH Q7 say about deviation investigation and CAPA for 
API manufacturing?"
```

## Configuration

### Embedding Model
Default: `all-MiniLM-L6-v2` (384 dimensions, fast, good quality)

To change model, update `EmbeddingService.DEFAULT_MODEL` in `embedding_service.py`:
```python
# Options:
# - all-MiniLM-L6-v2 (384 dim, fast) - DEFAULT
# - all-mpnet-base-v2 (768 dim, better quality)
# - all-MiniLM-L12-v2 (384 dim, better quality)
# - multi-qa-mpnet-base-dot-v1 (768 dim, optimized for QA)
```

### Chunking Parameters
Default: 512 tokens, 50 token overlap

Adjust in `DocumentProcessor` initialization:
```python
document_processor = DocumentProcessor(
    chunk_size=512,      # Tokens per chunk
    chunk_overlap=50     # Overlap between chunks
)
```

### Search Parameters
- `top_k`: Number of results (default: 5, max: 20)
- `similarity_threshold`: Minimum cosine similarity (default: 0.7)
- `use_hybrid`: Combine vector + keyword search (default: true for RCA queries)

## Monitoring & Analytics

Access analytics at `GET /api/v1/rag/analytics`:
- Total knowledge bases, documents, chunks
- Queries in last 30 days
- Average confidence score
- Top query types and source types

Query logs stored in `rca_query_logs` table with:
- Query text and type
- Retrieved chunks with scores
- LLM response
- Confidence score
- Response time
- User feedback (helpful/not_helpful/partially_helpful)

## Troubleshooting

### "pgvector extension not found"
```sql
-- Run in PostgreSQL:
CREATE EXTENSION vector;
```

### "Embedding model not found"
```bash
# Download model on first run (requires internet)
# Or pre-download:
python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"
```

### "Document processing failed"
- Check file format is supported
- Verify file isn't corrupted
- Check logs: `docker compose logs backend`

### Low confidence scores
- Add more relevant documents to knowledge base
- Lower similarity_threshold (try 0.5-0.6)
- Use hybrid search for better recall
- Ensure documents are properly chunked

### Slow query performance
- Ensure HNSW index exists on embeddings:
  ```sql
  CREATE INDEX idx_document_chunks_embedding 
  ON document_chunks USING hnsw (embedding vector_cosine_ops);
  ```
- Reduce `top_k` parameter
- Use knowledge_base_ids filter to limit search scope

## Security Considerations

1. **API Key**: Groq API key stored in `.env` (not committed)
2. **File Upload**: Validate file types, scan for malware in production
3. **Access Control**: Add authentication/authorization for production
4. **Data Privacy**: Documents stored locally in PostgreSQL
5. **Audit Trail**: All queries logged with user attribution

## Production Deployment

1. **Managed PostgreSQL**: Use AWS RDS/Azure Database with pgvector support
2. **Vector DB Alternative**: Consider Pinecone, Weaviate, or Qdrant for scale
3. **Embedding Service**: Deploy sentence-transformers as separate microservice
4. **Caching**: Add Redis caching for frequent queries
5. **Monitoring**: Add Prometheus/Grafana for query performance metrics
6. **Backup**: Regular pg_dump of knowledge base tables

## Extending the System

### Add Custom Query Types
1. Add to `QueryType` enum in `rag_schemas.py`
2. Add prompt template in `rag_query_service.py`
3. Update frontend query type selector

### Add Document Types
1. Add to `SourceType` enum
2. Add processor in `document_processor.py`
3. Update frontend upload form

### Custom Embedding Models
1. Modify `EmbeddingService` to support multiple models
2. Add model selection to knowledge base creation
3. Store model name with embeddings for compatibility

## License

Part of AIVOA.AI RCA Module - AI Product Engineer Challenge