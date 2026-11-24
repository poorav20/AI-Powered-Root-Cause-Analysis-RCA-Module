"""
Vector Store Service for RAG System
Handles storage and retrieval of document embeddings using pgvector
"""
import json
from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text, func, and_, or_
from pgvector.sqlalchemy import Vector
from app.rag.models.vector_models import (
    KnowledgeBase, KnowledgeDocument, DocumentChunk,
    RCAQueryLog, DeviationKnowledgeLink
)
from app.rag.schemas.rag_schemas import (
    KnowledgeBaseCreate, KnowledgeBaseUpdate,
    KnowledgeDocumentCreate, KnowledgeDocumentUpdate,
    DocumentChunkCreate, RAGQueryRequest, RAGQueryResponse,
    DocumentChunkWithScore, DeviationKnowledgeLinkCreate
)
from app.rag.services.embedding_service import embedding_service
import time
import logging

logger = logging.getLogger(__name__)


class VectorStoreService:
    """Service for managing vector storage and retrieval"""
    
    def __init__(self, db: Session):
        self.db = db
    
    # ==================== Knowledge Base Operations ====================
    
    def create_knowledge_base(self, kb: KnowledgeBaseCreate) -> KnowledgeBase:
        """Create a new knowledge base"""
        db_kb = KnowledgeBase(
            name=kb.name,
            description=kb.description,
            domain=kb.domain
        )
        self.db.add(db_kb)
        self.db.commit()
        self.db.refresh(db_kb)
        return db_kb
    
    def get_knowledge_base(self, kb_id: int) -> Optional[KnowledgeBase]:
        """Get knowledge base by ID"""
        return self.db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()
    
    def list_knowledge_bases(self, domain: Optional[str] = None) -> List[KnowledgeBase]:
        """List all knowledge bases"""
        query = self.db.query(KnowledgeBase)
        if domain:
            query = query.filter(KnowledgeBase.domain == domain)
        return query.order_by(KnowledgeBase.created_at.desc()).all()
    
    def update_knowledge_base(self, kb_id: int, kb: KnowledgeBaseUpdate) -> Optional[KnowledgeBase]:
        """Update knowledge base"""
        db_kb = self.get_knowledge_base(kb_id)
        if not db_kb:
            return None
        
        update_data = kb.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_kb, field, value)
        
        self.db.commit()
        self.db.refresh(db_kb)
        return db_kb
    
    def delete_knowledge_base(self, kb_id: int) -> bool:
        """Delete knowledge base and all associated documents"""
        db_kb = self.get_knowledge_base(kb_id)
        if not db_kb:
            return False
        
        self.db.delete(db_kb)
        self.db.commit()
        return True
    
    def get_kb_stats(self, kb_id: int) -> Dict[str, Any]:
        """Get statistics for a knowledge base"""
        kb = self.get_knowledge_base(kb_id)
        if not kb:
            return {}
        
        doc_count = self.db.query(KnowledgeDocument).filter(
            KnowledgeDocument.knowledge_base_id == kb_id
        ).count()
        
        chunk_count = self.db.query(DocumentChunk).join(KnowledgeDocument).filter(
            KnowledgeDocument.knowledge_base_id == kb_id
        ).count()
        
        return {
            "knowledge_base_id": kb_id,
            "name": kb.name,
            "document_count": doc_count,
            "chunk_count": chunk_count,
            "domain": kb.domain
        }
    
    # ==================== Document Operations ====================
    
    def create_document(self, doc: KnowledgeDocumentCreate) -> KnowledgeDocument:
        """Create a new document record"""
        db_doc = KnowledgeDocument(
            knowledge_base_id=doc.knowledge_base_id,
            title=doc.title,
            source_type=doc.source_type.value,
            source_path=doc.source_path,
            doc_metadata=doc.metadata,
            processing_status="pending"
        )
        self.db.add(db_doc)
        self.db.commit()
        self.db.refresh(db_doc)
        return db_doc
    
    def get_document(self, doc_id: int) -> Optional[KnowledgeDocument]:
        """Get document by ID"""
        return self.db.query(KnowledgeDocument).filter(KnowledgeDocument.id == doc_id).first()
    
    def list_documents(
        self,
        knowledge_base_id: Optional[int] = None,
        status: Optional[str] = None,
        source_type: Optional[str] = None
    ) -> List[KnowledgeDocument]:
        """List documents with optional filters"""
        query = self.db.query(KnowledgeDocument)
        
        if knowledge_base_id:
            query = query.filter(KnowledgeDocument.knowledge_base_id == knowledge_base_id)
        if status:
            query = query.filter(KnowledgeDocument.processing_status == status)
        if source_type:
            query = query.filter(KnowledgeDocument.source_type == source_type)
        
        return query.order_by(KnowledgeDocument.created_at.desc()).all()
    
    def update_document(self, doc_id: int, doc: KnowledgeDocumentUpdate) -> Optional[KnowledgeDocument]:
        """Update document"""
        db_doc = self.get_document(doc_id)
        if not db_doc:
            return None
        
        update_data = doc.model_dump(exclude_unset=True)
        if "metadata" in update_data:
            update_data["doc_metadata"] = update_data.pop("metadata")
        for field, value in update_data.items():
            if field == "source_type" and hasattr(value, 'value'):
                value = value.value
            setattr(db_doc, field, value)
        
        self.db.commit()
        self.db.refresh(db_doc)
        return db_doc
    
    def delete_document(self, doc_id: int) -> bool:
        """Delete document and its chunks"""
        db_doc = self.get_document(doc_id)
        if not db_doc:
            return False
        
        self.db.delete(db_doc)
        self.db.commit()
        return True
    
    def check_duplicate(self, knowledge_base_id: int, content_hash: str) -> Optional[KnowledgeDocument]:
        """Check if document with same content hash exists"""
        return self.db.query(KnowledgeDocument).filter(
            KnowledgeDocument.knowledge_base_id == knowledge_base_id,
            KnowledgeDocument.content_hash == content_hash
        ).first()
    
    # ==================== Chunk Operations ====================
    
    def add_chunks(
        self,
        document_id: int,
        chunks: List[DocumentChunkCreate]
    ) -> List[DocumentChunk]:
        """Add multiple chunks with embeddings"""
        db_chunks = []
        
        for chunk in chunks:
            # Generate embedding
            embedding = embedding_service.embed_text(chunk.content)
            
            db_chunk = DocumentChunk(
                document_id=document_id,
                chunk_index=chunk.chunk_index,
                content=chunk.content,
                token_count=chunk.token_count,
                embedding=embedding,
                chunk_metadata=chunk.chunk_metadata
            )
            self.db.add(db_chunk)
            db_chunks.append(db_chunk)
        
        self.db.commit()
        
        # Refresh all chunks
        for chunk in db_chunks:
            self.db.refresh(chunk)
        
        # Update document chunk count
        doc = self.get_document(document_id)
        if doc:
            doc.chunk_count = len(db_chunks)
            self.db.commit()
        
        return db_chunks
    
    def get_chunks(self, document_id: int) -> List[DocumentChunk]:
        """Get all chunks for a document"""
        return self.db.query(DocumentChunk).filter(
            DocumentChunk.document_id == document_id
        ).order_by(DocumentChunk.chunk_index).all()
    
    def delete_chunks(self, document_id: int) -> int:
        """Delete all chunks for a document"""
        count = self.db.query(DocumentChunk).filter(
            DocumentChunk.document_id == document_id
        ).delete()
        self.db.commit()
        return count
    
    # ==================== Vector Search Operations ====================
    
    def similarity_search(
        self,
        query_embedding: List[float],
        top_k: int = 5,
        similarity_threshold: float = 0.7,
        knowledge_base_ids: Optional[List[int]] = None,
        source_types: Optional[List[str]] = None,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Tuple[DocumentChunk, float]]:
        """
        Perform vector similarity search using pgvector
        Returns list of (chunk, similarity_score) tuples
        """
        # Build the query
        query = self.db.query(
            DocumentChunk,
            (1 - DocumentChunk.embedding.cosine_distance(query_embedding)).label('similarity')
        )
        
        # Apply filters
        if knowledge_base_ids:
            query = query.join(KnowledgeDocument).filter(
                KnowledgeDocument.knowledge_base_id.in_(knowledge_base_ids)
            )
        
        if source_types:
            query = query.join(KnowledgeDocument).filter(
                KnowledgeDocument.source_type.in_(source_types)
            )
        
        if filters:
            for key, value in filters.items():
                if key == "metadata" and isinstance(value, dict):
                    # JSON metadata filtering
                    for mk, mv in value.items():
                        query = query.filter(
                            DocumentChunk.chunk_metadata[mk].astext == str(mv)
                        )
        
        # Apply similarity threshold and order
        query = query.filter(
            (1 - DocumentChunk.embedding.cosine_distance(query_embedding)) >= similarity_threshold
        ).order_by(
            (1 - DocumentChunk.embedding.cosine_distance(query_embedding)).desc()
        ).limit(top_k)
        
        results = query.all()
        return [(chunk, float(similarity)) for chunk, similarity in results]
    
    def hybrid_search(
        self,
        query_text: str,
        query_embedding: List[float],
        top_k: int = 5,
        similarity_threshold: float = 0.7,
        knowledge_base_ids: Optional[List[int]] = None,
        keyword_weight: float = 0.3
    ) -> List[Tuple[DocumentChunk, float]]:
        """
        Hybrid search combining vector similarity and keyword matching
        """
        # Vector search
        vector_results = self.similarity_search(
            query_embedding=query_embedding,
            top_k=top_k * 2,  # Get more for reranking
            similarity_threshold=similarity_threshold * 0.8,  # Lower threshold
            knowledge_base_ids=knowledge_base_ids
        )
        
        # Keyword search using PostgreSQL full-text search
        keyword_query = self.db.query(
            DocumentChunk,
            func.ts_rank_cd(
                func.to_tsvector('english', DocumentChunk.content),
                func.plainto_tsquery('english', query_text)
            ).label('rank')
        )
        
        if knowledge_base_ids:
            keyword_query = keyword_query.join(KnowledgeDocument).filter(
                KnowledgeDocument.knowledge_base_id.in_(knowledge_base_ids)
            )
        
        keyword_results = keyword_query.filter(
            func.to_tsvector('english', DocumentChunk.content).match(query_text)
        ).order_by(
            func.ts_rank_cd(
                func.to_tsvector('english', DocumentChunk.content),
                func.plainto_tsquery('english', query_text)
            ).desc()
        ).limit(top_k * 2).all()
        
        # Combine and rerank
        chunk_scores = {}
        
        # Add vector scores (weight: 1 - keyword_weight)
        for chunk, score in vector_results:
            chunk_scores[chunk.id] = chunk_scores.get(chunk.id, 0) + score * (1 - keyword_weight)
        
        # Add keyword scores (weight: keyword_weight)
        max_rank = max([r[1] for r in keyword_results]) if keyword_results else 1
        for chunk, rank in keyword_results:
            normalized_rank = rank / max_rank if max_rank > 0 else 0
            chunk_scores[chunk.id] = chunk_scores.get(chunk.id, 0) + normalized_rank * keyword_weight
        
        # Sort by combined score
        sorted_chunks = sorted(chunk_scores.items(), key=lambda x: x[1], reverse=True)
        
        # Fetch full chunk objects for top results
        top_chunk_ids = [cid for cid, _ in sorted_chunks[:top_k]]
        chunks = self.db.query(DocumentChunk).filter(
            DocumentChunk.id.in_(top_chunk_ids)
        ).all()
        
        chunk_map = {c.id: c for c in chunks}
        results = [(chunk_map[cid], score) for cid, score in sorted_chunks[:top_k] if cid in chunk_map]
        
        return results
    
    # ==================== RAG Query Operations ====================
    
    def query(
        self,
        request: RAGQueryRequest
    ) -> RAGQueryResponse:
        """
        Execute a RAG query and return response with sources
        """
        start_time = time.time()
        
        # Generate query embedding
        query_embedding = embedding_service.embed_query(request.query)
        
        # Perform search
        if request.filters and request.filters.get("use_hybrid", False):
            results = self.hybrid_search(
                query_text=request.query,
                query_embedding=query_embedding,
                top_k=request.top_k,
                similarity_threshold=request.similarity_threshold,
                knowledge_base_ids=request.knowledge_base_ids
            )
        else:
            results = self.similarity_search(
                query_embedding=query_embedding,
                top_k=request.top_k,
                similarity_threshold=request.similarity_threshold,
                knowledge_base_ids=request.knowledge_base_ids,
                source_types=[st.value for st in request.filters.get("source_types", [])] if request.filters else None,
                filters=request.filters
            )
        
        # Format retrieved chunks
        retrieved_chunks = []
        sources_used = []
        
        for chunk, score in results:
            doc = self.get_document(chunk.document_id)
            kb = self.get_knowledge_base(doc.knowledge_base_id) if doc else None
            
            chunk_response = DocumentChunkWithScore(
                chunk=DocumentChunkWithScore.model_validate(chunk, from_attributes=True) if hasattr(chunk, '__dict__') else None,
                score=score,
                document_title=doc.title if doc else "Unknown",
                source_type=doc.source_type if doc else "unknown"
            )
            
            # Manually construct since we need custom fields
            retrieved_chunks.append(DocumentChunkWithScore(
                chunk=DocumentChunkResponse.model_validate(chunk),
                score=score,
                document_title=doc.title if doc else "Unknown",
                source_type=doc.source_type if doc else "unknown"
            ))
            
            sources_used.append({
                "chunk_id": chunk.id,
                "document_id": chunk.document_id,
                "document_title": doc.title if doc else "Unknown",
                "source_type": doc.source_type if doc else "unknown",
                "knowledge_base": kb.name if kb else "Unknown",
                "similarity_score": score,
                "content_preview": chunk.content[:200] + "..." if len(chunk.content) > 200 else chunk.content
            })
        
        response_time_ms = int((time.time() - start_time) * 1000)
        
        # Log query
        self.log_query(
            query_text=request.query,
            query_type=request.query_type.value,
            deviation_id=request.deviation_id,
            retrieved_chunks=[{"chunk_id": c.chunk.id, "score": c.score} for c in retrieved_chunks],
            response_time_ms=response_time_ms
        )
        
        return RAGQueryResponse(
            query=request.query,
            query_type=request.query_type,
            retrieved_chunks=retrieved_chunks,
            llm_response="",  # Will be filled by LLM service
            confidence_score=0.0,  # Will be calculated by LLM service
            response_time_ms=response_time_ms,
            sources_used=sources_used
        )
    
    def log_query(
        self,
        query_text: str,
        query_type: str,
        deviation_id: Optional[int],
        retrieved_chunks: List[Dict[str, Any]],
        llm_response: str = "",
        confidence_score: float = 0.0,
        response_time_ms: int = 0
    ) -> RCAQueryLog:
        """Log RAG query for analytics"""
        log = RCAQueryLog(
            deviation_id=deviation_id,
            query_text=query_text,
            query_type=query_type,
            retrieved_chunks=retrieved_chunks,
            llm_response=llm_response,
            confidence_score=confidence_score,
            response_time_ms=response_time_ms
        )
        self.db.add(log)
        self.db.commit()
        self.db.refresh(log)
        return log
    
    def update_query_log(
        self,
        log_id: int,
        llm_response: str,
        confidence_score: float,
        user_feedback: Optional[str] = None
    ) -> Optional[RCAQueryLog]:
        """Update query log with LLM response and feedback"""
        log = self.db.query(RCAQueryLog).filter(RCAQueryLog.id == log_id).first()
        if not log:
            return None
        
        log.llm_response = llm_response
        log.confidence_score = confidence_score
        if user_feedback:
            log.user_feedback = user_feedback
        
        self.db.commit()
        self.db.refresh(log)
        return log
    
    # ==================== Deviation Knowledge Links ====================
    
    def link_deviation_knowledge(
        self,
        link: DeviationKnowledgeLinkCreate
    ) -> DeviationKnowledgeLink:
        """Create a link between deviation and knowledge document"""
        db_link = DeviationKnowledgeLink(
            deviation_id=link.deviation_id,
            document_id=link.document_id,
            chunk_ids=link.chunk_ids,
            relevance_score=link.relevance_score,
            link_type=link.link_type,
            created_by="user"
        )
        self.db.add(db_link)
        self.db.commit()
        self.db.refresh(db_link)
        return db_link
    
    def get_deviation_knowledge_links(self, deviation_id: int) -> List[DeviationKnowledgeLink]:
        """Get all knowledge links for a deviation"""
        return self.db.query(DeviationKnowledgeLink).filter(
            DeviationKnowledgeLink.deviation_id == deviation_id
        ).order_by(DeviationKnowledgeLink.relevance_score.desc().nullslast()).all()
    
    # ==================== Analytics ====================
    
    def get_analytics(self) -> Dict[str, Any]:
        """Get RAG system analytics"""
        total_kbs = self.db.query(KnowledgeBase).count()
        total_docs = self.db.query(KnowledgeDocument).count()
        total_chunks = self.db.query(DocumentChunk).count()
        
        # Queries in last 30 days
        from datetime import datetime, timedelta
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        recent_queries = self.db.query(RCAQueryLog).filter(
            RCAQueryLog.created_at >= thirty_days_ago
        ).count()
        
        # Average confidence
        avg_confidence = self.db.query(func.avg(RCAQueryLog.confidence_score)).filter(
            RCAQueryLog.confidence_score > 0
        ).scalar() or 0.0
        
        # Top query types
        query_types = self.db.query(
            RCAQueryLog.query_type,
            func.count(RCAQueryLog.id).label('count')
        ).group_by(RCAQueryLog.query_type).order_by(func.count(RCAQueryLog.id).desc()).limit(10).all()
        
        # Top source types
        source_types = self.db.query(
            KnowledgeDocument.source_type,
            func.count(KnowledgeDocument.id).label('count')
        ).group_by(KnowledgeDocument.source_type).order_by(func.count(KnowledgeDocument.id).desc()).limit(10).all()
        
        return {
            "total_knowledge_bases": total_kbs,
            "total_documents": total_docs,
            "total_chunks": total_chunks,
            "queries_last_30_days": recent_queries,
            "avg_confidence_score": float(avg_confidence),
            "top_query_types": [{"type": qt, "count": c} for qt, c in query_types],
            "top_source_types": [{"type": st, "count": c} for st, c in source_types]
        }