"""
RAG Query Service - Integrates retrieval with LLM generation
"""
import json
import time
import logging
from typing import List, Dict, Any, Optional
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.core.llm_provider import llm_provider
from app.rag.services.vector_store import VectorStoreService
from app.rag.services.embedding_service import embedding_service
from app.rag.schemas.rag_schemas import (
    RAGQueryRequest, RAGQueryResponse, QueryType,
    DocumentChunkWithScore, DocumentChunkResponse
)
from sqlalchemy.orm import Session


logger = logging.getLogger(__name__)


class RAGQueryService:
    """Service for executing RAG queries with LLM generation"""
    
    def __init__(self, db: Session):
        self.db = db
        self.vector_store = VectorStoreService(db)
        self.llm = llm_provider.get_llm(temperature=0.1)
    
    def _build_context(self, chunks: List[DocumentChunkWithScore]) -> str:
        """Build context string from retrieved chunks"""
        context_parts = []
        
        for i, chunk_score in enumerate(chunks, 1):
            chunk = chunk_score.chunk
            doc_title = chunk_score.document_title
            source_type = chunk_score.source_type
            score = chunk_score.score
            
            context_parts.append(
                f"[Source {i}: {doc_title} ({source_type}) - Relevance: {score:.2f}]\n"
                f"{chunk.content}\n"
            )
        
        return "\n---\n".join(context_parts)
    
    def _build_prompt(self, query_type: QueryType) -> ChatPromptTemplate:
        """Build prompt template based on query type"""
        
        base_system = """You are an expert pharmaceutical quality assurance and root cause analysis assistant. 
You have access to a knowledge base of pharmaceutical manufacturing documents, regulations, SOPs, case studies, and research papers.

Your role is to provide accurate, evidence-based answers for Root Cause Analysis (RCA) and Corrective and Preventive Actions (CAPA) in API pharmaceutical manufacturing.

Guidelines:
1. Base your answers ONLY on the provided context from the knowledge base
2. Cite specific sources when making claims
3. If the context doesn't contain enough information, clearly state what's missing
4. Be precise and technical - this is for qualified pharmaceutical professionals
5. Reference relevant regulations (FDA 21 CFR, ICH Q7, EU GMP) when applicable
6. Distinguish between established facts and your inferences
"""
        
        prompts = {
            QueryType.ROOT_CAUSE: base_system + """
Focus on identifying potential root causes for the deviation described.
Use the 5 Whys or Fishbone (6M) methodology implicitly.
Identify: direct causes, contributing factors, systemic issues.
Reference similar cases from the knowledge base if available.
""",
            QueryType.CAPA: base_system + """
Focus on recommending Corrective and Preventive Actions (CAPA).
Distinguish between:
- Corrective actions (fix the immediate problem)
- Preventive actions (prevent recurrence)
Prioritize by impact and feasibility.
Reference regulatory requirements for CAPA (21 CFR 820.100, ICH Q10).
""",
            QueryType.INVESTIGATION: base_system + """
Focus on guiding the investigation process.
Identify: missing evidence, required tests, interviews needed, documents to review.
Suggest investigation methodology (5 Whys, Fishbone, Fault Tree, FMEA).
Reference investigation best practices from FDA/ICH guidelines.
""",
            QueryType.REGULATION: base_system + """
Focus on regulatory requirements and compliance.
Cite specific regulation sections (21 CFR, ICH, EU GMP).
Explain how regulations apply to the specific situation.
""",
            QueryType.SIMILAR_CASE: base_system + """
Focus on finding and analyzing similar historical cases.
Compare the current deviation with past cases.
Identify patterns, common root causes, and effective CAPAs from similar cases.
""",
            QueryType.GENERAL: base_system + """
Provide a comprehensive answer based on the available context.
Cover relevant aspects of pharmaceutical quality management.
"""
        }
        
        system_prompt = prompts.get(query_type, prompts[QueryType.GENERAL])
        
        human_prompt = """Context from Knowledge Base:
{context}

Question: {query}

Please provide a detailed, evidence-based response. Structure your answer as follows:

1. **Direct Answer**: Clear, concise answer to the question
2. **Evidence from Sources**: Specific references to the provided context
3. **Analysis/Reasoning**: Your expert analysis connecting evidence to answer
4. **Confidence Level**: High/Medium/Low with brief justification
5. **Missing Information**: What additional information would improve the answer
6. **Recommended Next Steps**: Specific actions for the investigator

If the context is insufficient, clearly state what's missing and suggest where to find it."""
        
        return ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", human_prompt)
        ])
    
    def execute_query(self, request: RAGQueryRequest) -> RAGQueryResponse:
        """Execute full RAG query: retrieve + generate"""
        start_time = time.time()
        
        # Step 1: Retrieve relevant chunks
        rag_response = self.vector_store.query(request)
        
        # Step 2: Build context
        context = self._build_context(rag_response.retrieved_chunks)
        
        # Step 3: Generate LLM response
        prompt = self._build_prompt(request.query_type)
        chain = prompt | self.llm | StrOutputParser()
        
        try:
            llm_response = None
            last_err = None
            for cfg in llm_provider._fallback_chain():
                try:
                    llm = llm_provider._build_llm(cfg["provider"], cfg["model"], 0.1)
                    if llm is None:
                        continue
                    chain = prompt | llm | StrOutputParser()
                    llm_response = chain.invoke({
                        "context": context,
                        "query": request.query
                    })
                    break
                except Exception as e:
                    last_err = e
                    logger.warning("RAG provider %s/%s failed: %s", cfg["provider"], cfg["model"], e)
                    continue
            if llm_response is None:
                llm_response = f"Error generating response: {str(last_err) if last_err else 'No LLM provider available'}"
        except Exception as e:
            llm_response = f"Error generating response: {str(e)}"
        
        # Step 4: Calculate confidence score
        confidence = self._calculate_confidence(
            rag_response.retrieved_chunks,
            request.query,
            llm_response
        )
        
        # Step 5: Update response
        response_time_ms = int((time.time() - start_time) * 1000)
        
        final_response = RAGQueryResponse(
            query=request.query,
            query_type=request.query_type,
            retrieved_chunks=rag_response.retrieved_chunks,
            llm_response=llm_response,
            confidence_score=confidence,
            response_time_ms=response_time_ms,
            sources_used=rag_response.sources_used
        )
        
        # Step 6: Log the complete query
        self.vector_store.log_query(
            query_text=request.query,
            query_type=request.query_type.value,
            deviation_id=request.deviation_id,
            retrieved_chunks=[{"chunk_id": c.chunk.id, "score": c.score} for c in rag_response.retrieved_chunks],
            llm_response=llm_response,
            confidence_score=confidence,
            response_time_ms=response_time_ms
        )
        
        return final_response
    
    def _calculate_confidence(
        self,
        chunks: List[DocumentChunkWithScore],
        query: str,
        response: str
    ) -> float:
        """Calculate confidence score based on retrieval quality and response"""
        if not chunks:
            return 0.1
        
        # Base confidence from retrieval scores
        avg_similarity = sum(c.score for c in chunks) / len(chunks)
        
        # Boost for multiple relevant sources
        source_diversity = min(len(set(c.document_title for c in chunks)) / 3, 1.0)
        
        # Boost for high individual scores
        max_score = max(c.score for c in chunks)
        
        # Penalize if response indicates uncertainty
        uncertainty_penalty = 0.0
        uncertainty_phrases = [
            "insufficient information", "not enough context", "cannot determine",
            "unclear", "missing", "unknown", "insufficient evidence"
        ]
        response_lower = response.lower()
        for phrase in uncertainty_phrases:
            if phrase in response_lower:
                uncertainty_penalty += 0.1
        
        confidence = (
            avg_similarity * 0.5 +
            max_score * 0.3 +
            source_diversity * 0.2
        ) - uncertainty_penalty
        
        return max(0.0, min(1.0, confidence))
    
    def execute_rca_workflow_query(
        self,
        deviation_text: str,
        deviation_id: Optional[int] = None,
        query_type: QueryType = QueryType.ROOT_CAUSE
    ) -> RAGQueryResponse:
        """Execute RAG query specifically for RCA workflow"""
        # Build enhanced query with deviation context
        enhanced_query = f"""
Deviation Context: {deviation_text}

Based on the above deviation, please provide:
"""
        
        if query_type == QueryType.ROOT_CAUSE:
            enhanced_query += """
1. Potential root causes using 5 Whys methodology
2. Contributing factors across 6M categories (Man, Machine, Material, Method, Environment, Measurement)
3. Missing evidence needed for complete investigation
4. Similar cases from knowledge base
"""
        elif query_type == QueryType.CAPA:
            enhanced_query += """
1. Corrective actions to address immediate problem
2. Preventive actions to prevent recurrence
3. Regulatory requirements for CAPA
4. Prioritization by impact and feasibility
"""
        
        request = RAGQueryRequest(
            query=enhanced_query,
            query_type=query_type,
            deviation_id=deviation_id,
            top_k=8,
            similarity_threshold=0.65,
            filters={"use_hybrid": True}
        )
        
        return self.execute_query(request)
    
    def get_investigation_guidance(
        self,
        deviation_text: str,
        current_findings: str = "",
        deviation_id: Optional[int] = None
    ) -> RAGQueryResponse:
        """Get AI guidance for investigation next steps"""
        query = f"""
Deviation: {deviation_text}

Current Investigation Findings: {current_findings}

Please provide:
1. Recommended investigation methodology (5 Whys, Fishbone, Fault Tree, FMEA)
2. Missing evidence or information needed
3. Specific tests, interviews, or document reviews required
4. Potential investigation paths based on similar cases
5. Regulatory considerations for this type of deviation
"""
        
        request = RAGQueryRequest(
            query=query,
            query_type=QueryType.INVESTIGATION,
            deviation_id=deviation_id,
            top_k=6,
            similarity_threshold=0.6
        )
        
        return self.execute_query(request)
    
    def find_similar_cases(
        self,
        deviation_text: str,
        deviation_id: Optional[int] = None,
        top_k: int = 5
    ) -> RAGQueryResponse:
        """Find similar historical cases from knowledge base"""
        query = f"""
Find similar cases to this deviation:
{deviation_text}

Please identify:
1. Similar deviations from the knowledge base
2. Their root causes and contributing factors
3. CAPAs that were effective
4. Lessons learned
5. Regulatory outcomes if available
"""
        
        request = RAGQueryRequest(
            query=query,
            query_type=QueryType.SIMILAR_CASE,
            deviation_id=deviation_id,
            top_k=top_k,
            similarity_threshold=0.6
        )
        
        return self.execute_query(request)


# Integration with existing RCA workflow
class RCAWorkflowRAGIntegration:
    """Integrates RAG into the existing LangGraph RCA workflow"""
    
    def __init__(self, db: Session):
        self.rag_service = RAGQueryService(db)
    
    def enhance_deviation_analysis(self, deviation_text: str, deviation_id: int) -> Dict[str, Any]:
        """Enhance deviation analysis with RAG"""
        # Get root cause analysis with RAG
        rca_result = self.rag_service.execute_rca_workflow_query(
            deviation_text=deviation_text,
            deviation_id=deviation_id,
            query_type=QueryType.ROOT_CAUSE
        )
        
        # Get CAPA recommendations with RAG
        capa_result = self.rag_service.execute_rca_workflow_query(
            deviation_text=deviation_text,
            deviation_id=deviation_id,
            query_type=QueryType.CAPA
        )
        
        # Get investigation guidance
        investigation_result = self.rag_service.get_investigation_guidance(
            deviation_text=deviation_text,
            deviation_id=deviation_id
        )
        
        # Find similar cases
        similar_cases = self.rag_service.find_similar_cases(
            deviation_text=deviation_text,
            deviation_id=deviation_id
        )
        
        return {
            "rca_analysis": {
                "llm_response": rca_result.llm_response,
                "confidence": rca_result.confidence_score,
                "sources": rca_result.sources_used
            },
            "capa_recommendations": {
                "llm_response": capa_result.llm_response,
                "confidence": capa_result.confidence_score,
                "sources": capa_result.sources_used
            },
            "investigation_guidance": {
                "llm_response": investigation_result.llm_response,
                "confidence": investigation_result.confidence_score,
                "sources": investigation_result.sources_used
            },
            "similar_cases": {
                "llm_response": similar_cases.llm_response,
                "confidence": similar_cases.confidence_score,
                "sources": similar_cases.sources_used
            },
            "overall_confidence": (
                rca_result.confidence_score +
                capa_result.confidence_score +
                investigation_result.confidence_score
            ) / 3
        }
