"""
RAG API Routes
REST endpoints for RAG system operations
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks, Request
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import shutil
import json
from app.core.limiter import limiter
from app.db.session import get_db
from app.rag.services.vector_store import VectorStoreService
from app.rag.services.document_processor import document_processor
from app.rag.services.rag_query_service import RAGQueryService, RCAWorkflowRAGIntegration
from app.rag.schemas.rag_schemas import (
    KnowledgeBaseCreate, KnowledgeBaseUpdate, KnowledgeBaseResponse,
    KnowledgeDocumentCreate, KnowledgeDocumentUpdate, KnowledgeDocumentResponse,
    DocumentChunkCreate, DocumentChunkResponse, RAGQueryRequest, RAGQueryResponse,
    DocumentUploadRequest, DocumentUploadResponse,
    BatchProcessRequest, BatchProcessResponse,
    RAGAnalyticsResponse, DeviationKnowledgeLinkCreate, DeviationKnowledgeLinkResponse
)
from app.models.models import Deviation

router = APIRouter(prefix="/rag", tags=["RAG"])

# Upload directory
UPLOAD_DIR = "uploads/knowledge_base"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ==================== Knowledge Base Endpoints ====================

@router.post("/knowledge-bases", response_model=KnowledgeBaseResponse)
def create_knowledge_base(kb: KnowledgeBaseCreate, db: Session = Depends(get_db)):
    """Create a new knowledge base"""
    vector_store = VectorStoreService(db)
    db_kb = vector_store.create_knowledge_base(kb)
    return KnowledgeBaseResponse.model_validate(db_kb)


@router.get("/knowledge-bases", response_model=List[KnowledgeBaseResponse])
def list_knowledge_bases(domain: Optional[str] = None, db: Session = Depends(get_db)):
    """List all knowledge bases"""
    vector_store = VectorStoreService(db)
    kbs = vector_store.list_knowledge_bases(domain=domain)
    
    # Add document counts
    result = []
    for kb in kbs:
        stats = vector_store.get_kb_stats(kb.id)
        result.append(KnowledgeBaseResponse(
            id=kb.id,
            name=kb.name,
            description=kb.description,
            domain=kb.domain,
            document_count=stats.get("document_count", 0),
            created_at=kb.created_at,
            updated_at=kb.updated_at
        ))
    return result


@router.get("/knowledge-bases/{kb_id}", response_model=KnowledgeBaseResponse)
def get_knowledge_base(kb_id: int, db: Session = Depends(get_db)):
    """Get knowledge base by ID"""
    vector_store = VectorStoreService(db)
    kb = vector_store.get_knowledge_base(kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    
    stats = vector_store.get_kb_stats(kb_id)
    return KnowledgeBaseResponse(
        id=kb.id,
        name=kb.name,
        description=kb.description,
        domain=kb.domain,
        document_count=stats.get("document_count", 0),
        created_at=kb.created_at,
        updated_at=kb.updated_at
    )


@router.put("/knowledge-bases/{kb_id}", response_model=KnowledgeBaseResponse)
def update_knowledge_base(kb_id: int, kb: KnowledgeBaseUpdate, db: Session = Depends(get_db)):
    """Update knowledge base"""
    vector_store = VectorStoreService(db)
    db_kb = vector_store.update_knowledge_base(kb_id, kb)
    if not db_kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return KnowledgeBaseResponse.model_validate(db_kb)


@router.delete("/knowledge-bases/{kb_id}")
def delete_knowledge_base(kb_id: int, db: Session = Depends(get_db)):
    """Delete knowledge base"""
    vector_store = VectorStoreService(db)
    success = vector_store.delete_knowledge_base(kb_id)
    if not success:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return {"message": "Knowledge base deleted successfully"}


@router.get("/knowledge-bases/{kb_id}/stats")
def get_knowledge_base_stats(kb_id: int, db: Session = Depends(get_db)):
    """Get knowledge base statistics"""
    vector_store = VectorStoreService(db)
    stats = vector_store.get_kb_stats(kb_id)
    if not stats:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return stats


# ==================== Document Endpoints ====================

@router.post("/knowledge-bases/{kb_id}/documents/upload", response_model=DocumentUploadResponse)
async def upload_document(
    kb_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    source_type: str = Form("pdf"),
    metadata: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """Upload and process a document"""
    vector_store = VectorStoreService(db)
    
    # Verify knowledge base exists
    kb = vector_store.get_knowledge_base(kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    
    # Save file
    file_ext = os.path.splitext(file.filename)[1].lower()
    safe_filename = f"{kb_id}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Parse metadata
    meta = json.loads(metadata) if metadata else {}
    meta["original_filename"] = file.filename
    meta["uploaded_by"] = "api"
    
    # Create document record
    doc_create = KnowledgeDocumentCreate(
        knowledge_base_id=kb_id,
        title=title or file.filename,
        source_type=source_type,
        source_path=file_path,
        metadata=meta
    )
    
    db_doc = vector_store.create_document(doc_create)
    
    # Process in background
    background_tasks.add_task(
        process_document_background,
        db_doc.id,
        file_path,
        meta
    )
    
    return DocumentUploadResponse(
        document_id=db_doc.id,
        title=db_doc.title,
        status=db_doc.processing_status,
        message="Document uploaded. Processing started in background."
    )


def process_document_background(doc_id: int, file_path: str, metadata: dict):
    """Background task to process document"""
    from app.db.session import SessionLocal
    from app.rag.services.vector_store import VectorStoreService
    from app.rag.services.document_processor import document_processor as rag_doc_processor
    from app.rag.services.embedding_service import embedding_service
    
    db = SessionLocal()
    try:
        vector_store = VectorStoreService(db)
        
        # Update status
        doc = vector_store.get_document(doc_id)
        if not doc:
            return
        
        doc.processing_status = "processing"
        db.commit()
        
        # Process document
        full_text, chunks, content_hash = rag_doc_processor.process_file(file_path, metadata)
        
        # Check for duplicates
        existing = vector_store.check_duplicate(doc.knowledge_base_id, content_hash)
        if existing and existing.id != doc_id:
            doc.processing_status = "failed"
            doc.doc_metadata = {**(doc.doc_metadata or {}), "error": "Duplicate content detected"}
            db.commit()
            return
        
        # Update document with hash
        doc.content_hash = content_hash
        
        # Convert chunks to schema
        chunk_creates = [
            DocumentChunkCreate(
                document_id=doc_id,
                chunk_index=chunk.chunk_index,
                content=chunk.content,
                token_count=chunk.token_count,
                chunk_metadata=chunk.metadata
            )
            for chunk in chunks
        ]
        
        # Add chunks with embeddings
        vector_store.add_chunks(doc_id, chunk_creates)
        
        # Update status
        doc.processing_status = "completed"
        doc.chunk_count = len(chunks)
        db.commit()
        
    except Exception as e:
        doc = vector_store.get_document(doc_id)
        if doc:
            doc.processing_status = "failed"
            doc.doc_metadata = {**(doc.doc_metadata or {}), "error": str(e)}
            db.commit()
    finally:
        db.close()


@router.get("/knowledge-bases/{kb_id}/documents", response_model=List[KnowledgeDocumentResponse])
def list_documents(
    kb_id: int,
    status: Optional[str] = None,
    source_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List documents in a knowledge base"""
    vector_store = VectorStoreService(db)
    docs = vector_store.list_documents(
        knowledge_base_id=kb_id,
        status=status,
        source_type=source_type
    )
    return [KnowledgeDocumentResponse.model_validate(d) for d in docs]


@router.get("/documents/{doc_id}", response_model=KnowledgeDocumentResponse)
def get_document(doc_id: int, db: Session = Depends(get_db)):
    """Get document by ID"""
    vector_store = VectorStoreService(db)
    doc = vector_store.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return KnowledgeDocumentResponse.model_validate(doc)


@router.get("/documents/{doc_id}/chunks", response_model=List[DocumentChunkResponse])
def get_document_chunks(doc_id: int, db: Session = Depends(get_db)):
    """Get all chunks for a document"""
    vector_store = VectorStoreService(db)
    chunks = vector_store.get_chunks(doc_id)
    return [DocumentChunkResponse.model_validate(c) for c in chunks]


@router.put("/documents/{doc_id}", response_model=KnowledgeDocumentResponse)
def update_document(doc_id: int, doc: KnowledgeDocumentUpdate, db: Session = Depends(get_db)):
    """Update document"""
    vector_store = VectorStoreService(db)
    db_doc = vector_store.update_document(doc_id, doc)
    if not db_doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return KnowledgeDocumentResponse.model_validate(db_doc)


@router.delete("/documents/{doc_id}")
def delete_document(doc_id: int, db: Session = Depends(get_db)):
    """Delete document"""
    vector_store = VectorStoreService(db)
    success = vector_store.delete_document(doc_id)
    if not success:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Document deleted successfully"}


@router.post("/documents/{doc_id}/reprocess")
def reprocess_document(doc_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Reprocess a document"""
    vector_store = VectorStoreService(db)
    doc = vector_store.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not doc.source_path or not os.path.exists(doc.source_path):
        raise HTTPException(status_code=400, detail="Source file not found")
    
    # Delete existing chunks
    vector_store.delete_chunks(doc_id)
    
    # Reset status
    doc.processing_status = "pending"
    db.commit()
    
    # Reprocess in background
    background_tasks.add_task(
        process_document_background,
        doc_id,
        doc.source_path,
        doc.doc_metadata or {}
    )
    
    return {"message": "Reprocessing started"}


# ==================== RAG Query Endpoints ====================

@router.post("/query", response_model=RAGQueryResponse)
@limiter.limit("20/minute")
def query_rag(http_request: Request, request: RAGQueryRequest, db: Session = Depends(get_db)):
    """Execute a RAG query"""
    rag_service = RAGQueryService(db)
    return rag_service.execute_query(request)


@router.post("/query/rca")
def query_rca(
    deviation_text: str,
    deviation_id: Optional[int] = None,
    query_type: str = "root_cause",
    db: Session = Depends(get_db)
):
    """Execute RAG query for RCA workflow"""
    from app.rag.schemas.rag_schemas import QueryType
    
    rag_service = RAGQueryService(db)
    
    try:
        qt = QueryType(query_type)
    except ValueError:
        qt = QueryType.ROOT_CAUSE
    
    return rag_service.execute_rca_workflow_query(
        deviation_text=deviation_text,
        deviation_id=deviation_id,
        query_type=qt
    )


@router.post("/query/investigation-guidance")
def get_investigation_guidance(
    deviation_text: str,
    current_findings: str = "",
    deviation_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Get investigation guidance"""
    rag_service = RAGQueryService(db)
    return rag_service.get_investigation_guidance(
        deviation_text=deviation_text,
        current_findings=current_findings,
        deviation_id=deviation_id
    )


@router.post("/query/similar-cases")
def find_similar_cases(
    deviation_text: str,
    deviation_id: Optional[int] = None,
    top_k: int = 5,
    db: Session = Depends(get_db)
):
    """Find similar historical cases"""
    rag_service = RAGQueryService(db)
    return rag_service.find_similar_cases(
        deviation_text=deviation_text,
        deviation_id=deviation_id,
        top_k=top_k
    )


@router.post("/query/enhance-rca/{deviation_id}")
def enhance_rca_with_rag(deviation_id: int, db: Session = Depends(get_db)):
    """Enhance existing RCA with RAG"""
    # Get deviation
    deviation = db.query(Deviation).filter(Deviation.id == deviation_id).first()
    if not deviation:
        raise HTTPException(status_code=404, detail="Deviation not found")
    
    if not deviation.raw_input_text:
        raise HTTPException(status_code=400, detail="No source text available for deviation")
    
    integration = RCAWorkflowRAGIntegration(db)
    return integration.enhance_deviation_analysis(
        deviation_text=deviation.raw_input_text,
        deviation_id=deviation_id
    )


# ==================== Deviation Knowledge Links ====================

@router.post("/deviations/{deviation_id}/knowledge-links", response_model=DeviationKnowledgeLinkResponse)
def link_deviation_knowledge(
    deviation_id: int,
    link: DeviationKnowledgeLinkCreate,
    db: Session = Depends(get_db)
):
    """Link deviation to knowledge base document"""
    vector_store = VectorStoreService(db)
    
    # Verify deviation exists
    deviation = db.query(Deviation).filter(Deviation.id == deviation_id).first()
    if not deviation:
        raise HTTPException(status_code=404, detail="Deviation not found")
    
    db_link = vector_store.link_deviation_knowledge(link)
    return DeviationKnowledgeLinkResponse.model_validate(db_link)


@router.get("/deviations/{deviation_id}/knowledge-links", response_model=List[DeviationKnowledgeLinkResponse])
def get_deviation_knowledge_links(deviation_id: int, db: Session = Depends(get_db)):
    """Get all knowledge links for a deviation"""
    vector_store = VectorStoreService(db)
    links = vector_store.get_deviation_knowledge_links(deviation_id)
    return [DeviationKnowledgeLinkResponse.model_validate(l) for l in links]


# ==================== Analytics ====================

@router.get("/analytics", response_model=RAGAnalyticsResponse)
def get_rag_analytics(db: Session = Depends(get_db)):
    """Get RAG system analytics"""
    vector_store = VectorStoreService(db)
    analytics = vector_store.get_analytics()
    return RAGAnalyticsResponse(**analytics)


# ==================== Batch Processing ====================

@router.post("/batch-process", response_model=BatchProcessResponse)
def batch_process_documents(request: BatchProcessRequest, db: Session = Depends(get_db)):
    """Process multiple documents in batch"""
    vector_store = VectorStoreService(db)
    
    processed = 0
    failed = 0
    total_chunks = 0
    errors = []
    
    for doc_id in request.document_ids:
        doc = vector_store.get_document(doc_id)
        if not doc:
            errors.append(f"Document {doc_id} not found")
            failed += 1
            continue
        
        if not doc.source_path or not os.path.exists(doc.source_path):
            errors.append(f"Source file not found for document {doc_id}")
            failed += 1
            continue
        
        try:
            # Delete existing chunks
            vector_store.delete_chunks(doc_id)
            
            # Process
            full_text, chunks, content_hash = document_processor.process_file(
                doc.source_path, doc.doc_metadata
            )
            
            # Update hash
            doc.content_hash = content_hash
            
            # Add chunks
            chunk_creates = [
                DocumentChunkCreate(
                    document_id=doc_id,
                    chunk_index=chunk.chunk_index,
                    content=chunk.content,
                    token_count=chunk.token_count,
                    chunk_metadata=chunk.metadata
                )
                for chunk in chunks
            ]
            
            vector_store.add_chunks(doc_id, chunk_creates)
            
            doc.processing_status = "completed"
            doc.chunk_count = len(chunks)
            total_chunks += len(chunks)
            processed += 1
            
        except Exception as e:
            doc.processing_status = "failed"
            errors.append(f"Document {doc_id}: {str(e)}")
            failed += 1
        
        db.commit()
    
    return BatchProcessResponse(
        processed_count=processed,
        failed_count=failed,
        total_chunks=total_chunks,
        errors=errors
    )