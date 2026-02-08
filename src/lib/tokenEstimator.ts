/**
 * Estimates token count for Python code.
 *
 * Uses a simple heuristic of ~3.5 characters per token, which is
 * approximately 80% accurate for Python code. Good enough for budget
 * management in RAG context building without adding a heavy tokenizer
 * dependency (tiktoken, sentencepiece would add 500KB+).
 */
export function estimateCodeTokens(code: string): number {
  return Math.ceil(code.length / 3.5);
}
