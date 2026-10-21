"""Embedders. The one used for queries MUST be the one that built the vector index."""
import hashlib
import re
import numpy as np


class HashEmbedder:
    """Deterministic bag-of-words embedder for tests and offline demos (not semantic)."""
    def __init__(self, dim: int = 128):
        self.dim = dim

    def embed(self, texts):
        out = np.zeros((len(texts), self.dim), dtype=np.float32)
        for r, t in enumerate(texts):
            for tok in re.findall(r"[a-z0-9]+", t.lower()):
                h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
                out[r, h % self.dim] += 1.0 if (h >> 8) & 1 else -1.0
        return out


class OpenAIEmbedder:
    """Needs `pip install openai` and OPENAI_API_KEY in the environment (never in the repo)."""
    def __init__(self, model: str):
        from openai import OpenAI
        self.client, self.model = OpenAI(), model

    def embed(self, texts):
        resp = self.client.embeddings.create(model=self.model, input=list(texts))
        return np.array([d.embedding for d in resp.data], dtype=np.float32)
