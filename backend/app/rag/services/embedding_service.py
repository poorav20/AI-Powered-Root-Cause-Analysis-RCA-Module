"""
Embedding Service for RAG System
Generates vector embeddings using sentence-transformers
"""
import os
import hashlib
import logging
from typing import List, Optional, Dict, Any
import numpy as np
from app.core.config import settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Service for generating and managing text embeddings with lazy loading and fallback"""
    
    DEFAULT_MODEL = "all-MiniLM-L6-v2"  # 384 dimensions, fast, good quality
    MODEL_DIMENSIONS = 384
    MAX_SEQ_LENGTH = 512
    
    def __init__(self, model_name: str = None, device: str = None):
        self.model_name = model_name or self.DEFAULT_MODEL
        self.device = device
        self._model = None
        self._init_attempted = False
    
    def _initialize_model(self):
        """Lazily initialize the sentence transformer model"""
        if self._init_attempted:
            return
        self._init_attempted = True
        
        try:
            import torch
            if not self.device:
                self.device = "cuda" if torch.cuda.is_available() else "cpu"
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self.model_name, device=self.device)
            self._model.max_seq_length = self.MAX_SEQ_LENGTH
            logger.info("✅ Embedding model loaded: %s on %s", self.model_name, self.device)
        except Exception as e:
            logger.warning("Embedding model failed to load (%s). Falling back to deterministic pseudo-embeddings.", e)
            self._model = None
    
    @property
    def model(self):
        if not self._init_attempted:
            self._initialize_model()
        return self._model
    
    def get_embedding_dimension(self) -> int:
        """Get the embedding dimension for the current model"""
        return self.MODEL_DIMENSIONS
    
    def embed_text(self, text: str) -> List[float]:
        """Generate embedding for a single text"""
        if not text or not text.strip():
            return [0.0] * self.MODEL_DIMENSIONS
        
        if self.model is not None:
            embedding = self.model.encode(text.strip(), convert_to_numpy=True, normalize_embeddings=True)
            return embedding.tolist()
        
        # Deterministic hash-based fallback embedding if sentence-transformers is unavailable
        seed = int(hashlib.md5(text.encode('utf-8')).hexdigest(), 16) % (2**32)
        rng = np.random.RandomState(seed)
        vec = rng.randn(self.MODEL_DIMENSIONS).astype(np.float32)
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        return vec.tolist()
    
    def embed_texts(self, texts: List[str], batch_size: int = 32, show_progress: bool = False) -> List[List[float]]:
        """Generate embeddings for multiple texts"""
        if not texts:
            return []
        
        valid_texts = [t.strip() for t in texts if t and t.strip()]
        if not valid_texts:
            return [[0.0] * self.MODEL_DIMENSIONS] * len(texts)
        
        if self.model is not None:
            embeddings = self.model.encode(
                valid_texts,
                batch_size=batch_size,
                convert_to_numpy=True,
                normalize_embeddings=True,
                show_progress_bar=show_progress
            )
            return embeddings.tolist()
        
        return [self.embed_text(t) for t in valid_texts]
    
    def embed_query(self, query: str) -> List[float]:
        """Generate embedding for a search query"""
        return self.embed_text(query)
    
    def compute_similarity(self, embedding1: List[float], embedding2: List[float]) -> float:
        """Compute cosine similarity between two embeddings"""
        vec1 = np.array(embedding1)
        vec2 = np.array(embedding2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        if norm1 == 0 or norm2 == 0:
            return 0.0
        return float(np.dot(vec1, vec2) / (norm1 * norm2))
    
    def compute_similarities(self, query_embedding: List[float], embeddings: List[List[float]]) -> List[float]:
        """Compute similarities between query and multiple embeddings"""
        query_vec = np.array(query_embedding)
        query_norm = np.linalg.norm(query_vec)
        if query_norm == 0:
            return [0.0] * len(embeddings)
        
        similarities = []
        for emb in embeddings:
            emb_vec = np.array(emb)
            emb_norm = np.linalg.norm(emb_vec)
            if emb_norm == 0:
                similarities.append(0.0)
            else:
                sim = float(np.dot(query_vec, emb_vec) / (query_norm * emb_norm))
                similarities.append(sim)
        return similarities


class ContentHasher:
    """Utility for generating content hashes for deduplication"""
    
    @staticmethod
    def compute_hash(content: str) -> str:
        """Compute SHA256 hash of content"""
        return hashlib.sha256(content.encode('utf-8')).hexdigest()
    
    @staticmethod
    def compute_file_hash(file_path: str) -> str:
        """Compute SHA256 hash of file content"""
        hasher = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                hasher.update(chunk)
        return hasher.hexdigest()


# Singleton instance
embedding_service = EmbeddingService()
content_hasher = ContentHasher()
