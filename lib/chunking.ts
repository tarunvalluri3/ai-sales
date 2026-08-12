import "server-only";

export type Chunk = {
  index: number;
  content: string;
  charCount: number;
};

const DEFAULT_TARGET_SIZE = 1000;
const DEFAULT_OVERLAP = 150;

/**
 * Splits text into overlapping chunks, preferring paragraph breaks, then
 * sentence breaks, then a hard character cutoff. Deterministic -- same
 * input always produces the same output. Never returns an empty chunk.
 */
export function chunkText(
  text: string,
  options?: { targetSize?: number; overlap?: number },
): Chunk[] {
  const targetSize = options?.targetSize ?? DEFAULT_TARGET_SIZE;
  const overlap = options?.overlap ?? DEFAULT_OVERLAP;

  const trimmed = text.trim();
  if (trimmed === "") {
    return [];
  }

  const segments = splitIntoSegments(trimmed, targetSize);
  const merged = mergeSegments(segments, targetSize, overlap);

  return merged.map((content, index) => ({
    index,
    content,
    charCount: content.length,
  }));
}

/**
 * Breaks text into pieces no larger than targetSize, preferring to split
 * on paragraph boundaries, then sentence boundaries, then a hard cutoff.
 */
function splitIntoSegments(text: string, targetSize: number): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p !== "");

  const segments: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= targetSize) {
      segments.push(paragraph);
      continue;
    }
    segments.push(...splitBySentence(paragraph, targetSize));
  }

  return segments;
}

function splitBySentence(text: string, targetSize: number): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim() !== "");

  const segments: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= targetSize) {
      segments.push(sentence);
      continue;
    }
    segments.push(...splitHard(sentence, targetSize));
  }

  return segments;
}

function splitHard(text: string, targetSize: number): string[] {
  const segments: string[] = [];
  for (let i = 0; i < text.length; i += targetSize) {
    segments.push(text.slice(i, i + targetSize));
  }
  return segments;
}

/**
 * Packs small segments together up to targetSize, and carries the tail of
 * each chunk forward as overlap into the next.
 */
function mergeSegments(segments: string[], targetSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const segment of segments) {
    if (current === "") {
      current = segment;
      continue;
    }

    const candidate = `${current}\n\n${segment}`;
    if (candidate.length <= targetSize) {
      current = candidate;
      continue;
    }

    chunks.push(current);
    const tail = current.slice(Math.max(0, current.length - overlap));
    current = `${tail}\n\n${segment}`;
  }

  if (current !== "") {
    chunks.push(current);
  }

  return chunks;
}
