/**
 * LRU cache for embedding vectors.
 *
 * Avoids redundant Ollama API calls for similar queries by caching
 * recently generated embeddings. Uses SHA-256 hash of the text as
 * the cache key.
 */

const CACHE_SIZE = 10;
const embeddingCache = new Map<string, number[]>();

/**
 * Generates a SHA-256 hash of the input string.
 */
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Get embedding from cache or generate using provided function.
 *
 * @param host - Ollama host URL
 * @param model - Embedding model name
 * @param text - Text to embed
 * @param generateFn - Function to generate embedding if not cached
 * @returns The embedding vector
 */
export async function getCachedEmbedding(
  host: string,
  model: string,
  text: string,
  generateFn: (host: string, model: string, text: string) => Promise<number[]>
): Promise<number[]> {
  const textHash = await sha256(text);
  const cacheKey = `${model}:${textHash}`;

  const cached = embeddingCache.get(cacheKey);
  if (cached) {
    // Move to front (Map preserves insertion order)
    embeddingCache.delete(cacheKey);
    embeddingCache.set(cacheKey, cached);
    console.log("[RAG] Embedding cache HIT");
    return cached;
  }

  console.log("[RAG] Embedding cache MISS");
  const embedding = await generateFn(host, model, text);

  // LRU eviction - remove oldest entry if at capacity
  if (embeddingCache.size >= CACHE_SIZE) {
    const oldestKey = embeddingCache.keys().next().value;
    if (oldestKey !== undefined) {
      embeddingCache.delete(oldestKey);
    }
  }

  embeddingCache.set(cacheKey, embedding);
  return embedding;
}

/**
 * Clear all cached embeddings.
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}

/**
 * Get current cache statistics.
 */
export function getEmbeddingCacheStats(): { size: number; maxSize: number } {
  return { size: embeddingCache.size, maxSize: CACHE_SIZE };
}
