/**
 * Widget reliability item 4 (STATE.md 2026-11-20): a new business's widget
 * opened with only a greeting and a large empty area. When the owner has not
 * set suggested questions, the widget shows 3-4 defaults built ONLY from the
 * business's own published content -- never invented:
 *   1. FAQ questions, verbatim (the owner's own wording), in their order;
 *   2. then catalog items: "How much is {name}?" for an item with a price
 *      (what prospects ask most), "Tell me about {name}." otherwise.
 * The owner's own chips always win. Pure, no I/O; the question templates are
 * passed in so they follow the widget language.
 */

export const DEFAULT_QUESTION_LIMIT = 4;
const MAX_QUESTION_LENGTH = 120;
const MAX_NAME_LENGTH = 80;

export type DefaultQuestionSource = {
  faqQuestions: string[];
  items: { name: string; hasPrice: boolean }[];
};

export type DefaultQuestionTemplates = {
  /** Contains "{name}". */
  price: string;
  /** Contains "{name}". */
  about: string;
};

/** Collapses whitespace (a newline in owner text must not break a chip). */
function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function buildDefaultSuggestedQuestions(
  ownerQuestions: string[],
  source: DefaultQuestionSource | null,
  templates: DefaultQuestionTemplates,
): string[] {
  const owner = ownerQuestions.map(clean).filter((q) => q.length > 0);
  if (owner.length > 0) return ownerQuestions;
  if (!source) return [];

  const result: string[] = [];
  const seen = new Set<string>();
  const add = (question: string) => {
    const text = clean(question);
    const key = text.toLowerCase();
    if (!text || text.length > MAX_QUESTION_LENGTH || seen.has(key)) return;
    seen.add(key);
    result.push(text);
  };

  for (const question of source.faqQuestions) {
    if (result.length >= DEFAULT_QUESTION_LIMIT) break;
    add(question);
  }
  for (const item of source.items) {
    if (result.length >= DEFAULT_QUESTION_LIMIT) break;
    const name = clean(item.name);
    if (!name || name.length > MAX_NAME_LENGTH) continue;
    add((item.hasPrice ? templates.price : templates.about).replace("{name}", name));
  }
  return result;
}

/** True when a snapshot price (string display text or legacy number) actually holds something. */
export function catalogItemHasPrice(price: string | number | null | undefined): boolean {
  if (price === null || price === undefined) return false;
  return String(price).trim().length > 0;
}
