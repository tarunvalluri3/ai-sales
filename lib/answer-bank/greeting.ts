import { cleanInline } from "@/lib/answer-bank/normalize";

/**
 * Greeting-only detection and the fixed welcome. Pure.
 *
 * A message is a greeting only if EVERY token is a greeting word, a polite
 * filler ("there", "sir", "team") or part of a known multi-word greeting.
 * Anything with real content after the greeting ("hi, I need help with my
 * website") is not a greeting and goes to the AI.
 */

/** Longest message considered; a greeting is a handful of characters. */
const MAX_GREETING_CHARS = 40;

const GREETING_WORDS = new Set([
  "hi", "hii", "hello", "hey", "hola", "yo", "hallo", "bonjour", "salut", "ola", "oi",
  "namaste", "namaskar", "namaskaram", "namaskara", "namaskaaram", "pranam", "vanakkam", "vannakam",
  "sat", "sri", "akal", "ram", "radhe", "jai", "shri", "krishna",
  "नमस्ते", "नमस्कार", "प्रणाम", "हैलो", "हेलो", "हाय", "हलो",
  "வணக்கம்", "నమస్కారం", "నమస్తే", "ನಮಸ್ಕಾರ", "നമസ്കാരം", "নমস্কার", "হ্যালো", "হাই", "નમસ્તે", "ਸਤ", "ਸ਼੍ਰੀ", "ਅਕਾਲ",
  "good", "morning", "afternoon", "evening", "day", "greetings",
]);

/** Greeting words that only count alongside another ("good morning", "sat sri akal", "jai shri krishna"). */
const NON_ANCHOR_WORDS = new Set(["good", "day", "sat", "sri", "shri", "jai"]);

const FILLER_WORDS = new Set([
  "there", "sir", "madam", "maam", "ma'am", "team", "everyone", "all", "guys", "friend", "friends",
  "bro", "bhai", "ji", "dear", "folks", "again", "sirji", "boss", "!",
]);

/** Stretched spellings: "hiiii" -> "hi", "heyyy" -> "hey", "hellooo" -> "hello". A run of three or more of a letter is tried collapsed to one and to two. */
function spellingVariants(word: string): string[] {
  return [word, word.replace(/(\p{L})\1{2,}/gu, "$1"), word.replace(/(\p{L})\1{2,}/gu, "$1$1")];
}

/** True only when the whole message is a greeting (with optional filler and punctuation/emoji). */
export function isGreetingOnly(message: string): boolean {
  const text = message.normalize("NFKC").trim();
  if (text.length === 0 || text.length > MAX_GREETING_CHARS) return false;

  const tokens = text
    .toLowerCase()
    .replace(/[\p{P}\p{S}\p{Emoji_Presentation}\p{Extended_Pictographic}]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0)
    // Each token resolves to the first spelling variant that is a known word, or stays as written.
    .map((token) => spellingVariants(token).find((variant) => GREETING_WORDS.has(variant) || FILLER_WORDS.has(variant)) ?? token);

  if (tokens.length === 0 || tokens.length > 5) return false;
  if (!tokens.every((token) => GREETING_WORDS.has(token) || FILLER_WORDS.has(token))) return false;
  // At least one anchor word -- a lone "there", "good" or "sir" is not a greeting.
  return tokens.some((token) => GREETING_WORDS.has(token) && !NON_ANCHOR_WORDS.has(token));
}

const MAX_WELCOME_QUESTIONS = 4;

/** Languages a fixed welcome exists for. Any other widget language sends greetings to the AI (which answers in that language). */
export function hasWelcomeTemplate(language: string): boolean {
  return language === "en" || language === "hi";
}

/**
 * The fixed welcome: the business name, an invitation, and (when the owner
 * has set them) their suggested questions as a short list. Built from owner
 * data only -- no model, nothing invented. Returns null for a language with
 * no template.
 */
export function buildWelcome(language: string, businessName: string, suggestedQuestions: string[]): string | null {
  const name = cleanInline(businessName, 80);
  const questions = suggestedQuestions
    .map((question) => cleanInline(question, 120))
    .filter((question) => question.length > 0)
    .slice(0, MAX_WELCOME_QUESTIONS);

  if (language === "en") {
    const lines = [`Hi! Welcome to ${name}. How can I help you today?`];
    if (questions.length > 0) lines.push("", "You can ask me things like:", ...questions.map((question) => `- ${question}`));
    return lines.join("\n");
  }
  if (language === "hi") {
    const lines = [`नमस्ते! ${name} में आपका स्वागत है। मैं आपकी कैसे मदद कर सकता हूँ?`];
    if (questions.length > 0) lines.push("", "आप मुझसे ऐसे सवाल पूछ सकते हैं:", ...questions.map((question) => `- ${question}`));
    return lines.join("\n");
  }
  return null;
}
