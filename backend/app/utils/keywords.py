import re
from sklearn.feature_extraction.text import TfidfVectorizer, ENGLISH_STOP_WORDS

def generate_keywords(texts: list[str], num_keywords: int = 3) -> str | None:
    """Generates keywords from a list of text strings using TF-IDF.

    Args:
        texts: A list of strings (e.g., message contents).
        num_keywords: The maximum number of keywords to return.

    Returns:
        A string containing the top keywords separated by commas, or None if input is insufficient.
    """
    if not texts or len(texts) < 2: # Need at least a couple of messages for TF-IDF
        return None

    # Preprocess text: lowercase, remove punctuation (simple version)
    processed_texts = [
        re.sub(r'[^\w\s]', '', text.lower())
        for text in texts
    ]

    # Combine into a single document for vectorization
    corpus = [' '.join(processed_texts)]

    # Use TF-IDF Vectorizer
    try:
        # Add custom stop words if needed
        custom_stop_words = list(ENGLISH_STOP_WORDS) + ['user', 'assistant', 'sure', 'yes', 'no', 'okay', 'thanks', 'think', 'like', 'just', 'im']
        vectorizer = TfidfVectorizer(stop_words=custom_stop_words, max_features=50) # Limit features
        tfidf_matrix = vectorizer.fit_transform(corpus)

        # Get feature names (words)
        feature_names = vectorizer.get_feature_names_out()

        # Get TF-IDF scores for the single document
        if tfidf_matrix.shape[0] == 0 or tfidf_matrix.shape[1] == 0:
            return None # Not enough valid words found

        scores = tfidf_matrix.toarray()[0]

        # Sort words by score
        sorted_indices = scores.argsort()[::-1]

        # Get top keywords, applying a small threshold to avoid very low-score words
        top_keywords = [feature_names[i] for i in sorted_indices[:num_keywords] if scores[i] > 0.1]

        return ', '.join(top_keywords) if top_keywords else None

    except ValueError:
        # Handle cases where vocabulary might be empty after stop word removal
        return None 