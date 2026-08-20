/**
 * Minimal HTML-to-text extraction for Phase 24's URL knowledge source --
 * strips script/style blocks and tags, decodes the handful of entities
 * that show up in ordinary marketing/docs pages, and collapses
 * whitespace. Deliberately not a full HTML parser (no new dependency for
 * this phase) -- good enough for readable body text on a typical
 * business website, not a guarantee against malformed/adversarial HTML.
 * A known limitation, not a hidden one -- see STATE.md.
 */
export function extractTextFromHtml(html: string): string {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, " ");

  const decoded = withoutTags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  return decoded.replace(/\s+/g, " ").trim();
}
