"""
RAG Vector Models using pgvector with PostgreSQL
Stores document embeddings for retrieval-augmented generation
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index, JSON, Float, ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from app.db.session import Base
import uuid


class KnowledgeBase(Base):
    """Knowledge base collections for organizing documents"""
    __tablename__ = "knowledge_bases"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(Text)
    domain = Column(String(100), default="pharmaceutical")  # pharmaceutical, manufacturing, quality
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    documents = relationship("KnowledgeDocument", back_populates="knowledge_base", cascade="all, delete-orphan")


class KnowledgeDocument(Base):
    """Documents stored in the knowledge base"""
    __tablename__ = "knowledge_documents"
    
    id = Column(Integer, primary_key=True, index=True)
    knowledge_base_id = Column(Integer, ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(500), nullable=False)
    source_type = Column(String(50))  # pdf, docx, txt, research_paper, sop, regulation, case_study
    source_path = Column(String(1000))  # Original file path or URL
    content_hash = Column(String(64), index=True)  # SHA256 for deduplication
    doc_metadata = Column("metadata", JSON)  # Author, publication date, DOI, categories, tags
    processing_status = Column(String(50), default="pending")  # pending, processing, completed, failed
    chunk_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    knowledge_base = relationship("KnowledgeBase", back_populates="documents")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")


class DocumentChunk(Base):
    """Text chunks with vector embeddings for retrieval"""
    __tablename__ = "document_chunks"
    
    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    token_count = Column(Integer)
    # Vector embedding (384 dimensions for all-MiniLM-L6-v2)
    embedding = Column(Vector(384))
    # Metadata for filtering
    chunk_metadata = Column(JSON)  # Section headers, page numbers, etc.
    created_at = Column(DateTime, default=func.now())
    
    # Relationships
    document = relationship("KnowledgeDocument", back_populates="chunks")
    
    # Composite index for efficient retrieval
    __table_args__ = (
        Index('ix_document_chunk_doc_idx', 'document_id', 'chunk_index'),
    )


class RCAQueryLog(Base):
    """Log of RAG queries for analytics and improvement"""
    __tablename__ = "rca_query_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    deviation_id = Column(Integer, ForeignKey("deviations.id", ondelete="SET NULL"), nullable=True)
    query_text = Column(Text, nullable=False)
    query_type = Column(String(50))  # root_cause, capa, investigation, general
    retrieved_chunks = Column(JSON)  # IDs and scores of retrieved chunks
    llm_response = Column(Text)
    confidence_score = Column(Float)
    response_time_ms = Column(Integer)
    user_feedback = Column(String(20))  # helpful, not_helpful, partially_helpful
    created_at = Column(DateTime, default=func.now())


class DeviationKnowledgeLink(Base):
    """Links between deviations and knowledge base documents for traceability"""
    __tablename__ = "deviation_knowledge_links"
    
    id = Column(Integer, primary_key=True, index=True)
    deviation_id = Column(Integer, ForeignKey("deviations.id", ondelete="CASCADE"), nullable=False)
    document_id = Column(Integer, ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=False)
    chunk_ids = Column(ARRAY(Integer))  # Specific chunks referenced
    relevance_score = Column(Float)
    link_type = Column(String(50))  # evidence, reference, regulation, similar_case
    created_by = Column(String(255))  # user or 'ai'
    created_at = Column(DateTime, default=func.now())
    
    __table_args__ = (
        Index('ix_deviation_knowledge_dev_doc', 'deviation_id', 'document_id'),
    )