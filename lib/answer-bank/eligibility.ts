import { tokenize } from "@/lib/answer-bank/normalize";

/**
 * The pure rules that decide whether a message is even allowed near the
 * instant-answer path, and whether an answer may be served for it. Every rule
 * errs toward "send it to the AI": a wrong instant answer (especially a wrong
 * price) is worse than a slow right one.
 */

/** Phrases that try to steer the model or the pipeline. The instant path would ignore them anyway, but such a message is never served from a shortcut -- it goes through the full pipeline. */
const INJECTION_SIGNALS: RegExp[] = [
  /\bignore\b.{0,30}\b(instructions?|rules?|prompts?|above|previous)\b/i,
  /\b(disregard|forget)\b.{0,30}\b(instructions?|rules?|prompts?|above|previous)\b/i,
  /\b(system|developer|hidden|initial)\s+(prompt|message|instructions?)\b/i,
  /\bwhat\s+(are|is)\s+your\s+(instructions?|rules|prompt)\b/i,
  /\byou\s+are\s+now\b/i,
  /\b(act|behave|pretend)\s+(as|like)\b/i,
  /\b(jailbreak|dan\s+mode|developer\s+mode)\b/i,
  /<\/?[a-z][^>]*>/i,
  /\{\{|\}\}|\$\{/,
];

export function hasInjectionSignal(message: string): boolean {
  return INJECTION_SIGNALS.some((pattern) => pattern.test(message));
}

/** Words that point back at something said earlier ("how much is it", "what about that one"). English plus common romanized and Devanagari Hindi forms. */
const REFERENCE_WORDS = new Set([
  "it", "its", "that", "this", "those", "these", "they", "them", "their", "he", "she", "his", "her", "him",
  "there", "one", "ones", "same", "above", "previous", "earlier", "before", "also", "too", "again", "another",
  "else", "other", "instead", "either", "both", "former", "latter", "such",
  "iska", "uska", "iski", "uski", "iske", "uske", "yeh", "ye", "woh", "wo", "isme", "usme", "inka", "unka", "inki", "unki",
  "यह", "वह", "इसका", "उसका", "इसकी", "उसकी", "इसमें", "उसमें", "इनका", "उनका", "ये", "वे",
]);

const CONTINUATION_START =
  /^(and|but|so|or|also|then|what about|how about|and what|what else|why|really|ok|okay|yes|no|yeah|sure|thanks|thank you)\b/i;

/**
 * False when the message depends on earlier turns. When unsure, false -- the
 * AI reads the conversation and a shortcut cannot.
 */
export function isSelfContained(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length === 0) return false;
  if (CONTINUATION_START.test(trimmed)) return false;
  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return false;
  return !tokens.some((token) => REFERENCE_WORDS.has(token));
}

export type Script =
  | "latin" | "devanagari" | "bengali" | "gurmukhi" | "gujarati" | "tamil" | "telugu" | "kannada" | "malayalam"
  | "arabic" | "cyrillic" | "cjk" | "other" | "none";

const SCRIPT_RANGES: [Script, RegExp][] = [
  ["devanagari", /\p{Script=Devanagari}/u],
  ["bengali", /\p{Script=Bengali}/u],
  ["gurmukhi", /\p{Script=Gurmukhi}/u],
  ["gujarati", /\p{Script=Gujarati}/u],
  ["tamil", /\p{Script=Tamil}/u],
  ["telugu", /\p{Script=Telugu}/u],
  ["kannada", /\p{Script=Kannada}/u],
  ["malayalam", /\p{Script=Malayalam}/u],
  ["arabic", /\p{Script=Arabic}/u],
  ["cyrillic", /\p{Script=Cyrillic}/u],
  ["cjk", /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u],
  ["latin", /\p{Script=Latin}/u],
];

/** The script most of a text's letters are written in; "none" when it has no letters. */
export function dominantScript(text: string): Script {
  const counts = new Map<Script, number>();
  for (const char of text.normalize("NFKC")) {
    if (!/\p{L}/u.test(char)) continue;
    const script = SCRIPT_RANGES.find(([, pattern]) => pattern.test(char))?.[0] ?? "other";
    counts.set(script, (counts.get(script) ?? 0) + 1);
  }
  let best: Script = "none";
  let bestCount = 0;
  for (const [script, count] of counts) {
    if (count > bestCount) {
      best = script;
      bestCount = count;
    }
  }
  return best;
}

/** True when the message and the stored text are written in the same script (a message with no letters, such as "499?", is compatible with anything). */
export function scriptsCompatible(message: string, stored: string): boolean {
  const a = dominantScript(message);
  const b = dominantScript(stored);
  return a === "none" || b === "none" || a === b;
}

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "do", "does", "did", "can", "could", "would", "will", "you", "your", "yours",
  "i", "me", "my", "we", "us", "our", "to", "of", "in", "on", "for", "with", "at", "by", "from", "and", "or", "if", "so",
  "what", "which", "who", "how", "when", "where", "why", "any", "some", "get", "have", "has", "need", "want", "know", "tell",
  "about", "please", "pls", "kindly", "just", "like", "much", "many", "really",
]);

/** The first five characters of a token: "supports"/"support"/"supported" compare equal without a stemmer. */
function stem(token: string): string {
  return token.slice(0, 5);
}

/**
 * The lexical guard that backs the FAQ similarity match. Embeddings are blind
 * to the details that change an answer (measured: "cost 499" vs "cost 599"
 * scores 0.957), so a match is served only when the message introduces
 * nothing the FAQ does not already contain:
 *   - every number in the message appears in the FAQ's question or answer;
 *   - no product/service name in the message is missing from them;
 *   - at most one other content word is new, and none for a short message.
 * `reference` is the FAQ question plus its answer. Returns the reason it
 * refused, or null when the message is covered.
 */
export function faqGuardRefusal(message: string, reference: string, catalogNames: string[]): string | null {
  const referenceTokens = tokenize(reference);
  const referenceSet = new Set(referenceTokens);
  const referenceStems = new Set(referenceTokens.map(stem));
  const messageTokens = tokenize(message);

  for (const token of messageTokens) {
    if (/\p{N}/u.test(token) && !referenceSet.has(token)) return "number_not_in_faq";
  }

  const normalizedReference = ` ${referenceTokens.join(" ")} `;
  const normalizedMessage = ` ${messageTokens.join(" ")} `;
  for (const name of catalogNames) {
    const nameTokens = tokenize(name);
    if (nameTokens.length === 0) continue;
    const needle = ` ${nameTokens.join(" ")} `;
    if (normalizedMessage.includes(needle) && !normalizedReference.includes(needle)) return "catalog_item_not_in_faq";
  }

  const content = messageTokens.filter((token) => !STOPWORDS.has(token) && !/\p{N}/u.test(token));
  const novel = content.filter((token) => !referenceStems.has(stem(token)));
  const allowedNovel = content.length >= 4 ? 1 : 0;
  if (novel.length > allowedNovel) return "new_terms_not_in_faq";
  return null;
}

/** True when the message contains a number that the answer does not. */
export function numbersMissingFrom(message: string, answer: string): boolean {
  const answerSet = new Set(tokenize(answer));
  return tokenize(message).some((token) => /\p{N}/u.test(token) && !answerSet.has(token));
}
