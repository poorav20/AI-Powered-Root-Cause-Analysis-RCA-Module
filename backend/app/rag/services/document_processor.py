"""
Document Processor for RAG System
Handles document loading, chunking, and preprocessing
"""
import os
import re
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
import tiktoken
from app.services.document_processor import document_processor as base_doc_processor
from app.rag.services.embedding_service import content_hasher


@dataclass
class DocumentChunk:
    """Represents a chunk of document text with metadata"""
    content: str
    chunk_index: int
    token_count: int
    metadata: Dict[str, Any]


class TextChunker:
    """Intelligent text chunking with overlap and structure preservation"""
    
    def __init__(
        self,
        chunk_size: int = 512,
        chunk_overlap: int = 50,
        encoding_name: str = "cl100k_base"
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.encoding = tiktoken.get_encoding(encoding_name)
    
    def count_tokens(self, text: str) -> int:
        """Count tokens in text"""
        return len(self.encoding.encode(text))
    
    def chunk_text(
        self,
        text: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> List[DocumentChunk]:
        """Split text into overlapping chunks preserving structure"""
        if not text or not text.strip():
            return []
        
        # Clean text
        text = self._clean_text(text)
        
        # Try to split by sections first (headers, paragraphs)
        sections = self._split_by_structure(text)
        
        chunks = []
        chunk_index = 0
        
        for section in sections:
            section_chunks = self._chunk_section(section, chunk_index, metadata)
            chunks.extend(section_chunks)
            chunk_index += len(section_chunks)
        
        return chunks
    
    def _clean_text(self, text: str) -> str:
        """Clean and normalize text"""
        # Remove excessive whitespace
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = re.sub(r' {2,}', ' ', text)
        # Remove zero-width characters
        text = text.replace('\u200b', '').replace('\ufeff', '')
        return text.strip()
    
    def _split_by_structure(self, text: str) -> List[str]:
        """Split text by headers and major sections"""
        # Split by markdown headers, numbered sections, or double newlines
        header_pattern = r'(^|\n)(#{1,6}\s+.+|\d+\.\d+\s+.+|[A-Z][A-Z\s]{2,}:)'
        
        parts = re.split(header_pattern, text)
        
        # Reconstruct sections with their headers
        sections = []
        current_section = ""
        
        for i, part in enumerate(parts):
            if re.match(header_pattern, part) and current_section:
                sections.append(current_section.strip())
                current_section = part
            else:
                current_section += part
        
        if current_section:
            sections.append(current_section.strip())
        
        # If no clear structure, fall back to paragraph splitting
        if len(sections) <= 1:
            sections = [p.strip() for p in text.split('\n\n') if p.strip()]
        
        return sections
    
    def _chunk_section(
        self,
        section: str,
        start_index: int,
        base_metadata: Optional[Dict[str, Any]] = None
    ) -> List[DocumentChunk]:
        """Chunk a single section with overlap"""
        tokens = self.encoding.encode(section)
        
        if len(tokens) <= self.chunk_size:
            return [DocumentChunk(
                content=section,
                chunk_index=start_index,
                token_count=len(tokens),
                metadata={**(base_metadata or {}), "section_header": self._extract_header(section)}
            )]
        
        chunks = []
        chunk_index = start_index
        
        for i in range(0, len(tokens), self.chunk_size - self.chunk_overlap):
            chunk_tokens = tokens[i:i + self.chunk_size]
            chunk_text = self.encoding.decode(chunk_tokens)
            
            chunks.append(DocumentChunk(
                content=chunk_text,
                chunk_index=chunk_index,
                token_count=len(chunk_tokens),
                metadata={
                    **(base_metadata or {}),
                    "section_header": self._extract_header(section),
                    "chunk_start_token": i,
                    "chunk_end_token": min(i + self.chunk_size, len(tokens))
                }
            ))
            chunk_index += 1
            
            # Break if we've covered all tokens
            if i + self.chunk_size >= len(tokens):
                break
        
        return chunks
    
    def _extract_header(self, text: str) -> str:
        """Extract the first header-like line from text"""
        lines = text.split('\n')
        for line in lines[:3]:
            line = line.strip()
            if re.match(r'^(#{1,6}\s+|\d+\.\d+\s+|[A-Z][A-Z\s]{2,}:)', line):
                return line[:200]
        return ""


class DocumentProcessor:
    """Main document processor for RAG ingestion"""
    
    def __init__(
        self,
        chunk_size: int = 512,
        chunk_overlap: int = 50
    ):
        self.chunker = TextChunker(chunk_size, chunk_overlap)
        self.supported_extensions = {
            '.pdf': self._process_pdf,
            '.docx': self._process_docx,
            '.txt': self._process_txt,
            '.md': self._process_txt,
        }
    
    def process_file(
        self,
        file_path: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Tuple[str, List[DocumentChunk], str]:
        """
        Process a file and return content, chunks, and content hash
        Returns: (full_text, chunks, content_hash)
        """
        ext = os.path.splitext(file_path)[1].lower()
        
        if ext not in self.supported_extensions:
            raise ValueError(f"Unsupported file type: {ext}")
        
        # Extract text
        full_text = self.supported_extensions[ext](file_path)
        
        if not full_text or not full_text.strip():
            raise ValueError("No text content extracted from file")
        
        # Compute content hash for deduplication
        content_hash = content_hasher.compute_hash(full_text)
        
        # Prepare metadata
        chunk_metadata = {
            "source_file": os.path.basename(file_path),
            "file_extension": ext,
            **(metadata or {})
        }
        
        # Chunk the text
        chunks = self.chunker.chunk_text(full_text, chunk_metadata)
        
        return full_text, chunks, content_hash
    
    def process_text(
        self,
        text: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Tuple[str, List[DocumentChunk], str]:
        """Process raw text directly"""
        if not text or not text.strip():
            raise ValueError("Empty text provided")
        
        content_hash = content_hasher.compute_hash(text)
        chunk_metadata = {"source_type": "direct_text", **(metadata or {})}
        chunks = self.chunker.chunk_text(text, chunk_metadata)
        
        return text, chunks, content_hash
    
    def _process_pdf(self, file_path: str) -> str:
        """Extract text from PDF with page metadata"""
        return base_doc_processor.extract_text_from_pdf(file_path)
    
    def _process_docx(self, file_path: str) -> str:
        """Extract text from DOCX"""
        return base_doc_processor.extract_text_from_docx(file_path)
    
    def _process_txt(self, file_path: str) -> str:
        """Extract text from plain text file"""
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read()


# Singleton instance
document_processor = DocumentProcessor()