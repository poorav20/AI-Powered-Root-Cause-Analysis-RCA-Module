"""
RAG System Pydantic Schemas
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class SourceType(str, Enum):
    PDF = "pdf"
    DOCX = "docx"
    TXT = "txt"
    RESEARCH_PAPER = "research_paper"
    SOP = "sop"
    REGULATION = "regulation"
    CASE_STUDY = "case_study"
    GUIDELINE = "guideline"
    OTHER = "other"


class ProcessingStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class QueryType(str, Enum):
    ROOT_CAUSE = "root_cause"
    CAPA = "capa"
    INVESTIGATION = "investigation"
    GENERAL = "general"
    REGULATION = "regulation"
    SIMILAR_CASE = "similar_case"


class FeedbackType(str, Enum):
    HELPFUL = "helpful"
    NOT_HELPFUL = "not_helpful"
    PARTIALLY_HELPFUL = "partially_helpful"


# Knowledge Base schemas
class KnowledgeBaseCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    domain: str = Field(default="pharmaceutical", max_length=100)


class KnowledgeBaseUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    domain: Optional[str] = None


class KnowledgeBaseResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    domain: str = "pharmaceutical"
    document_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# Knowledge Document schemas
class KnowledgeDocumentCreate(BaseModel):
    knowledge_base_id: int
    title: str = Field(..., min_length=1, max_length=500)
    source_type: SourceType
    source_path: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class KnowledgeDocumentUpdate(BaseModel):
    title: Optional[str] = None
    source_type: Optional[SourceType] = None
    metadata: Optional[Dict[str, Any]] = None
    processing_status: Optional[ProcessingStatus] = None


class KnowledgeDocumentResponse(BaseModel):
    id: int
    knowledge_base_id: int
    title: str
    source_type: SourceType
    source_path: Optional[str]
    content_hash: Optional[str]
    metadata: Optional[Dict[str, Any]] = Field(default=None, validation_alias="doc_metadata")
    processing_status: ProcessingStatus
    chunk_count: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# Document Chunk schemas
class DocumentChunkCreate(BaseModel):
    document_id: int
    chunk_index: int
    content: str
    token_count: Optional[int] = None
    chunk_metadata: Optional[Dict[str, Any]] = None


class DocumentChunkResponse(BaseModel):
    id: int
    document_id: int
    chunk_index: int
    content: str
    token_count: Optional[int]
    chunk_metadata: Optional[Dict[str, Any]]
    created_at: datetime
    
    class Config:
        from_attributes = True


class DocumentChunkWithScore(BaseModel):
    chunk: DocumentChunkResponse
    score: float
    document_title: str
    source_type: SourceType


# RAG Query schemas
class RAGQueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    query_type: QueryType = QueryType.GENERAL
    deviation_id: Optional[int] = None
    knowledge_base_ids: Optional[List[int]] = None
    top_k: int = Field(default=5, ge=1, le=20)
    similarity_threshold: float = Field(default=0.7, ge=0.0, le=1.0)
    filters: Optional[Dict[str, Any]] = None  # source_type, date_range, tags


class RAGQueryResponse(BaseModel):
    query: str
    query_type: QueryType
    retrieved_chunks: List[DocumentChunkWithScore]
    llm_response: str
    confidence_score: float
    response_time_ms: int
    sources_used: List[Dict[str, Any]]


# Document Upload schemas
class DocumentUploadRequest(BaseModel):
    knowledge_base_id: int
    title: Optional[str] = None
    source_type: SourceType
    metadata: Optional[Dict[str, Any]] = None


class DocumentUploadResponse(BaseModel):
    document_id: int
    title: str
    status: ProcessingStatus
    message: str


# Batch Processing schemas
class BatchProcessRequest(BaseModel):
    knowledge_base_id: int
    document_ids: List[int]
    chunk_size: int = Field(default=512, ge=100, le=2000)
    chunk_overlap: int = Field(default=50, ge=0, le=500)


class BatchProcessResponse(BaseModel):
    processed_count: int
    failed_count: int
    total_chunks: int
    errors: List[str]


# Analytics schemas
class RAGAnalyticsResponse(BaseModel):
    total_knowledge_bases: int
    total_documents: int
    total_chunks: int
    queries_last_30_days: int
    avg_confidence_score: float
    top_query_types: List[Dict[str, Any]]
    top_source_types: List[Dict[str, Any]]


# Deviation Knowledge Link schemas
class DeviationKnowledgeLinkCreate(BaseModel):
    deviation_id: int
    document_id: int
    chunk_ids: Optional[List[int]] = None
    relevance_score: Optional[float] = None
    link_type: str = Field(default="evidence", max_length=50)


class DeviationKnowledgeLinkResponse(BaseModel):
    id: int
    deviation_id: int
    document_id: int
    chunk_ids: Optional[List[int]]
    relevance_score: Optional[float]
    link_type: str
    created_by: str
    created_at: datetime
    
    class Config:
        from_attributes = True