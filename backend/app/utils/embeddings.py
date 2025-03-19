"""
Utilities for generating and managing text embeddings.
"""
import os
import logging
from typing import List, Dict, Any, Union, Optional
import json

# Conditionally import numpy, which may not be available during migrations
try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False
    print("Warning: numpy not available, vector operations will be limited")

# Conditionally import sentence-transformers
try:
    from sentence_transformers import SentenceTransformer
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False
    print("Warning: sentence-transformers not available, embedding generation will be disabled")

# Configure logging
logger = logging.getLogger(__name__)

class EmbeddingManager:
    """Manager for generating and working with embeddings using sentence-transformers."""
    
    def __init__(self, model_name: str = 'all-MiniLM-L6-v2'):
        """Initialize the embedding manager.
        
        Args:
            model_name: The name of the sentence-transformers model to use.
                Default is 'all-MiniLM-L6-v2' which produces 384-dimensional vectors.
        """
        self.model_name = model_name
        self._model = None
        
        if not TRANSFORMERS_AVAILABLE or not NUMPY_AVAILABLE:
            logger.warning(
                "Required dependencies not available. "
                "Embedding functionality will be limited."
            )
    
    @property
    def model(self) -> Any:
        """Lazy-loaded sentence transformer model.
        
        Returns:
            The sentence transformer model.
        """
        if not TRANSFORMERS_AVAILABLE:
            logger.error("sentence-transformers library is not available")
            return None
            
        if self._model is None:
            try:
                self._model = SentenceTransformer(self.model_name)
                logger.info(f"Loaded embedding model: {self.model_name}")
            except Exception as e:
                logger.error(f"Failed to load embedding model: {e}")
                raise RuntimeError(f"Failed to load embedding model: {e}")
        return self._model
    
    def generate_embedding(self, text: str) -> List[float]:
        """Generate an embedding vector for a text string.
        
        This generates a 384-dimensional vector that can be stored in 
        PostgreSQL using the pgvector extension.
        
        Args:
            text: The text to generate an embedding for.
            
        Returns:
            A list of floats representing the embedding vector.
            The vector has 384 dimensions when using the default model.
        """
        if not text or not isinstance(text, str):
            logger.warning(f"Invalid text provided for embedding: {text}")
            # Return a zero vector with correct dimensions if text is invalid
            return [0.0] * 384
            
        try:
            # Generate embedding
            embedding = self.model.encode(text)
            
            # Convert numpy array to list for JSON serialization and DB storage
            return embedding.tolist()
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            # Return a zero vector with correct dimensions
            return [0.0] * 384
    
    def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts.
        
        Args:
            texts: List of texts to generate embeddings for.
            
        Returns:
            List of embeddings, each as a list of floats.
        """
        if not TRANSFORMERS_AVAILABLE:
            logger.warning("Cannot generate embeddings: sentence-transformers not available")
            return [[0.0] * 384 for _ in texts]  # Return zero vectors
            
        try:
            embeddings = self.model.encode(texts)
            return [emb.tolist() for emb in embeddings]
        except Exception as e:
            logger.error(f"Error generating embeddings: {e}")
            raise RuntimeError(f"Error generating embeddings: {e}")
    
    def compute_similarity(self, embedding1: List[float], embedding2: List[float]) -> float:
        """Compute the cosine similarity between two embeddings.
        
        For pgvector in PostgreSQL, you can use built-in operators instead:
        - <-> (Euclidean distance) 
        - <=> (Cosine distance)
        - <#> (Inner product)
        
        Args:
            embedding1: First embedding vector.
            embedding2: Second embedding vector.
            
        Returns:
            The cosine similarity as a float between -1 and 1.
            Higher values indicate more similar embeddings.
        """
        if not NUMPY_AVAILABLE:
            logger.error("NumPy is required for computing similarity.")
            return 0.0
            
        try:
            # Convert lists to numpy arrays if they aren't already
            if not isinstance(embedding1, np.ndarray):
                embedding1 = np.array(embedding1)
            if not isinstance(embedding2, np.ndarray):
                embedding2 = np.array(embedding2)
                
            # Check dimensions
            if embedding1.shape != embedding2.shape:
                logger.warning(
                    f"Embedding dimension mismatch: {embedding1.shape} vs {embedding2.shape}"
                )
            
            # Compute cosine similarity
            norm1 = np.linalg.norm(embedding1)
            norm2 = np.linalg.norm(embedding2)
            
            if norm1 == 0 or norm2 == 0:
                return 0.0
                
            return np.dot(embedding1, embedding2) / (norm1 * norm2)
        except Exception as e:
            logger.error(f"Error computing similarity: {e}")
            return 0.0
    
    def get_part_embedding(self, part: Dict[str, Any]) -> List[float]:
        """Generate an embedding for a part based on its attributes.
        
        Args:
            part: Dictionary representation of a part.
            
        Returns:
            The embedding as a list of floats.
        """
        if not TRANSFORMERS_AVAILABLE:
            logger.warning("Cannot generate part embedding: sentence-transformers not available")
            return [0.0] * 384  # Return zero vector
            
        # Construct a descriptive text from the part's attributes
        text_elements = [
            f"Name: {part.get('name', '')}",
            f"Role: {part.get('role', '')}",
            f"Description: {part.get('description', '')}"
        ]
        
        # Add feelings, beliefs, etc. if available
        if part.get('feelings'):
            text_elements.append(f"Feelings: {', '.join(part.get('feelings', []))}")
        if part.get('beliefs'):
            text_elements.append(f"Beliefs: {', '.join(part.get('beliefs', []))}")
        if part.get('triggers'):
            text_elements.append(f"Triggers: {', '.join(part.get('triggers', []))}")
        if part.get('needs'):
            text_elements.append(f"Needs: {', '.join(part.get('needs', []))}")
        
        # Combine into a single text
        part_text = " ".join(text_elements)
        
        # Generate and return the embedding
        return self.generate_embedding(part_text)


# Create a singleton instance
embedding_manager = EmbeddingManager() 