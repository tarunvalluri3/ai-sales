import "server-only";
import { Embeddings } from "@langchain/core/embeddings";
import { GoogleGenAI } from "@google/genai";
import { AppError } from "@/lib/errors";

/**
 * Fallback path from Phase 7's Implementation Requirement 1: the current
 * @langchain/google-genai (2.2.0) GoogleGenerativeAIEmbeddings class has no
 * outputDimensionality field anywhere in its constructor or per-call
 * options (confirmed by reading its installed .d.ts), and its own
 * underlying dependency, the legacy @google/generative-ai SDK, has no
 * such field either (confirmed the same way). The current, actively
 * maintained @google/genai SDK's EmbedContentConfig.outputDimensionality
 * does support it, so this class extends LangChain's Embeddings base
 * (preserving the LangChain interface for Phase 8's future retriever/
 * vector-store code) but calls @google/genai directly underneath.
 */
/**
 * Confirmed live in production (STATE.md): Gemini's embedding-model API
 * enforces a per-minute quota (`RESOURCE_EXHAUSTED`, HTTP 429) well below
 * what a handful of chat messages in quick succession can trigger, since
 * every retrieval call embeds the prospect's question. A brief retry
 * absorbs short blips; `isEmbeddingRateLimitError` lets a caller detect
 * the case that survives retries, to degrade gracefully instead of a raw
 * 500 (see lib/rag.ts's askSalesEmployee()).
 */
const RATE_LIMIT_MAX_ATTEMPTS = 3;
const RATE_LIMIT_BACKOFF_MS = [500, 1500];

function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = (error as { status?: unknown }).status;
  return status === 429 || /RESOURCE_EXHAUSTED/.test(error.message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True if `error` (as thrown by embedTexts/embedText, an AppError wrapping the original cause) is Gemini's embedding-quota rate limit, surviving all retries. */
export function isEmbeddingRateLimitError(error: unknown): boolean {
  if (error instanceof AppError) {
    return isRateLimitError(error.cause);
  }
  return isRateLimitError(error);
}

export class TruncatedGeminiEmbeddings extends Embeddings {
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly outputDimensionality: number;

  constructor(fields: { apiKey: string; model: string; outputDimensionality: number }) {
    super({});
    this.client = new GoogleGenAI({ apiKey: fields.apiKey });
    this.model = fields.model;
    this.outputDimensionality = fields.outputDimensionality;
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    if (documents.length === 0) {
      return [];
    }

    for (let attempt = 0; attempt < RATE_LIMIT_MAX_ATTEMPTS; attempt++) {
      try {
        const response = await this.client.models.embedContent({
          model: this.model,
          contents: documents,
          config: { outputDimensionality: this.outputDimensionality },
        });

        const embeddings = response.embeddings;
        if (!embeddings || embeddings.length !== documents.length) {
          throw new AppError(
            "Something went wrong generating knowledge embeddings. Please try again.",
            "TruncatedGeminiEmbeddings.embedDocuments: unexpected response shape",
            response,
          );
        }

        return embeddings.map((embedding) => assertDimension(embedding.values, this.outputDimensionality));
      } catch (error) {
        const isLastAttempt = attempt === RATE_LIMIT_MAX_ATTEMPTS - 1;
        if (!isRateLimitError(error) || isLastAttempt) {
          throw error;
        }
        await sleep(RATE_LIMIT_BACKOFF_MS[attempt]);
      }
    }

    // Unreachable -- the loop above always either returns or throws.
    throw new AppError("Something went wrong generating knowledge embeddings. Please try again.", "embedDocuments: retry loop exited unexpectedly");
  }

  async embedQuery(document: string): Promise<number[]> {
    const [embedding] = await this.embedDocuments([document]);
    return embedding;
  }
}

function assertDimension(values: number[] | undefined, expected: number): number[] {
  if (!values || values.length !== expected) {
    throw new AppError(
      "Something went wrong generating knowledge embeddings. Please try again.",
      `assertDimension: expected ${expected} dimensions, got ${values?.length ?? "undefined"}`,
    );
  }
  return values;
}

/**
 * L2-normalizes an embedding vector. Required for gemini-embedding-001:
 * unlike the newer gemini-embedding-2-preview, non-3072-dimension output
 * from this model is not auto-normalized by Google, and cosine-distance
 * similarity ranking silently degrades without this step (see STATE.md's
 * D3 resolution and the Phase 7 prompt's Decision 5).
 */
export function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return vector;
  }
  return vector.map((value) => value / norm);
}

const EMBEDDING_DIMENSION = (() => {
  const raw = process.env.GEMINI_EMBEDDING_DIMENSION!;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`GEMINI_EMBEDDING_DIMENSION must be a positive integer, got: ${raw}`);
  }
  return parsed;
})();

function getEmbeddingsClient(): TruncatedGeminiEmbeddings {
  return new TruncatedGeminiEmbeddings({
    apiKey: process.env.GEMINI_API_KEY!,
    model: process.env.GEMINI_EMBEDDING_MODEL!,
    outputDimensionality: EMBEDDING_DIMENSION,
  });
}

/** Embeds and L2-normalizes a batch of texts. Run concurrently by the underlying client's own batching (a single embedContent call covers the whole array). */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  let raw: number[][];
  try {
    raw = await getEmbeddingsClient().embedDocuments(texts);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      "Something went wrong generating knowledge embeddings. Please try again.",
      "embedTexts failed",
      error,
    );
  }

  return raw.map(l2Normalize);
}

/** Embeds and L2-normalizes a single text (e.g. a retrieval query). */
export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}
