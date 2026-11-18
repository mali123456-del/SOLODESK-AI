/**
 * Lightweight, deterministic 128-dimension semantic hashing projection using
 * character trigrams + normalized word unigrams & bigrams with L2 normalization.
 * Runs locally in <1ms per chunk with zero external dependencies or GPU requirements.
 *
 * IMPORTANT PROVENANCE DISCLOSURE:
 * These local vectors are deterministic lexical-hash projections, NOT neural embeddings.
 * When server-side Gemini Embeddings (`gemini-embedding-2`) are enabled, provenance
 * explicitly identifies `embeddingKind: 'neural'`.
 */
export const SEMANTIC_VECTOR_DIM = 128;
export const RAG_INDEX_VERSION = 3;

export interface EmbeddingProvenance {
  vectorModel: string;
  embeddingKind: 'lexical-hash-projection' | 'neural';
  dimension: number;
  deterministicLocal: boolean;
  notes: string;
}

export const LOCAL_VECTOR_PROVENANCE: EmbeddingProvenance = {
  vectorModel: 'fnv1a-trigram-bigram-128d-v3',
  embeddingKind: 'lexical-hash-projection',
  dimension: SEMANTIC_VECTOR_DIM,
  deterministicLocal: true,
  notes:
    'Deterministic browser-local 128D character-trigram + word-bigram projection. Not neural model weights.',
};

const vectorCache = new Map<string, Float32Array>();
const MAX_CACHE_ENTRIES = 1500;

function fnvHash(str: string, seed = 2166136261): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function buildSemanticVector(text: string): Float32Array {
  const vec = new Float32Array(SEMANTIC_VECTOR_DIM);
  const normText = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normText) return vec;

  // Word unigrams & bigrams
  const words = normText.split(' ').filter((w) => w.length >= 2);
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    const h = fnvHash(w, 2166136261);
    const sign = (h & 1) === 0 ? 1 : -1;
    vec[h % SEMANTIC_VECTOR_DIM] += sign * 1.4;

    if (i + 1 < words.length) {
      const bi = `${w}_${words[i + 1]}`;
      const bh = fnvHash(bi, 2166136263);
      const bsign = (bh & 1) === 0 ? 1 : -1;
      vec[bh % SEMANTIC_VECTOR_DIM] += bsign * 1.8;
    }

    // Character trigrams for morphological / partial-term similarity (e.g. "invoicing" ~ "invoice")
    if (w.length >= 4) {
      for (let j = 0; j <= w.length - 3; j += 1) {
        const tri = w.slice(j, j + 3);
        const th = fnvHash(tri, 2166136277);
        const tsign = (th & 1) === 0 ? 1 : -1;
        vec[th % SEMANTIC_VECTOR_DIM] += tsign * 0.45;
      }
    }
  }

  let normSq = 0;
  for (let i = 0; i < vec.length; i += 1) {
    normSq += vec[i] * vec[i];
  }
  const mag = Math.sqrt(normSq);
  if (mag > 0) {
    for (let i = 0; i < vec.length; i += 1) {
      vec[i] /= mag;
    }
  }
  return vec;
}

export function getCachedSemanticVector(cacheKey: string, text: string): Float32Array {
  const existing = vectorCache.get(cacheKey);
  if (existing) return existing;
  const computed = buildSemanticVector(text);
  if (vectorCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = vectorCache.keys().next().value;
    if (oldest) vectorCache.delete(oldest);
  }
  vectorCache.set(cacheKey, computed);
  return computed;
}

export function clearSemanticVectorCache(): void {
  vectorCache.clear();
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
  }
  return dot;
}
