export function normalizeEvidence(text: string): string {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

export function sourceExcerpt(source: string, quote: string): string | null {
  const normalizedQuote = normalizeEvidence(quote);
  return normalizedQuote && normalizeEvidence(source).includes(normalizedQuote) ? normalizedQuote : null;
}

/** Preserve sentence context so an extract cannot drop an explicit negation. */
export function sourceStatement(source: string, quote: string): string | null {
  const excerpt = sourceExcerpt(source, quote);
  if (!excerpt) return null;
  const normalized = source.normalize("NFC").replace(/[^\S\n]+/gu, " ");
  const scoped = normalized.split(/\n|(?<=[.!?।…])\s+/u);
  return scoped.some((statement) => normalizeEvidence(statement).replace(/[.!?।…]$/u, "") === excerpt.replace(/[.!?।…]$/u, ""))
    ? excerpt : null;
}
