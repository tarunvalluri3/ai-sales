/**
 * Deterministic prompt-injection / abuse classifier for visitor messages
 * (guardrails Phase 1). A pure function over a string -- no I/O, no model
 * call, microseconds -- so it can run on every message on every channel
 * without touching the reply's critical path.
 *
 * LOG-ONLY at first (lib/guardrails/config.ts): a hit produces a signal that
 * is logged and persisted for false-positive review, and never blocks. These
 * are heuristics, not a security boundary -- the boundary is the structure
 * (untrusted-content tags, tenant-scoped tools, output checks). Patterns are
 * kept narrow on purpose (an ordinary "what are your opening hours?" or "can
 * you give me setup instructions?" must not fire), and cover English, Hindi,
 * Telugu and Hinglish, the languages Phase 0 red-teamed.
 */

export type InjectionSignalType =
  | "instruction_override"
  | "prompt_extraction"
  | "role_hijack"
  | "tag_forgery"
  | "encoded_payload";

export type ClassifierSignalType = InjectionSignalType | "abuse";

export type ClassifierHit = {
  type: ClassifierSignalType;
  /** Stable rule id, so a false positive can be traced to the exact pattern. */
  rule: string;
};

/** Matches `a` and `b` in either order within `gap` characters of each other. */
function near(a: string, b: string, gap = 60): RegExp {
  return new RegExp(`(?:${a})[\\s\\S]{0,${gap}}?(?:${b})|(?:${b})[\\s\\S]{0,${gap}}?(?:${a})`, "iu");
}

type Rule = { type: ClassifierSignalType; rule: string; pattern: RegExp };

const RULES: Rule[] = [
  // ---- instruction override ----
  {
    type: "instruction_override",
    rule: "override.en.ignore_instructions",
    pattern: /\b(?:ignore|disregard|forget|override|bypass|drop|discard)\b[^.\n]{0,40}\b(?:instructions?|rules?|prompts?|guidelines?|directives?|restrictions?|programming|training)\b/iu,
  },
  { type: "instruction_override", rule: "override.en.new_rules", pattern: /\b(?:new|updated|revised|real)\s+(?:rules|instructions|system prompt)\b\s*[:\-]/iu },
  { type: "instruction_override", rule: "override.en.special_mode", pattern: /\b(?:developer|debug|admin|god|jailbreak|unrestricted|dan)\s+mode\b|\bdo anything now\b/iu },
  { type: "instruction_override", rule: "override.en.no_restrictions", pattern: /\b(?:no|without any|without)\s+(?:rules|restrictions|limits|filters|guidelines)\b/iu },
  {
    type: "instruction_override",
    rule: "override.hi.ignore_instructions",
    pattern: near("निर्देश|नियम|आदेश|प्रॉम्प्ट|प्रोम्प्ट", "अनदेखा|नज़रअंदाज़|नजरअंदाज|नज़रंदाज़|भूल\\s*जा|भूल\\s*जाओ|छोड़\\s*दो"),
  },
  {
    type: "instruction_override",
    rule: "override.te.ignore_instructions",
    pattern: near("సూచనల|సూచనలు|నియమాల|నియమాలు|ఆదేశాల", "విస్మరించ|పట్టించుకోక|మర్చిపో|మరచిపో"),
  },
  {
    type: "instruction_override",
    rule: "override.hinglish.ignore_instructions",
    pattern: near("instructions?|rules?|niyam|nirdesh|aadesh|prompt", "ignore\\s*kar|bhool\\s*ja|bhul\\s*ja|nazarandaz|nazarandaaz|hata\\s*do|mat\\s*mano", 80),
  },

  // ---- system prompt extraction ----
  {
    type: "prompt_extraction",
    rule: "extract.en.reveal_prompt",
    pattern: /\b(?:reveal|show|print|repeat|display|output|share|leak|recite|dump|translate|summari[sz]e|tell me|give me|what (?:is|are|were))\b[^.\n]{0,40}\b(?:your|the|these|those|above|previous|original|initial|hidden|internal|system)\s+(?:[a-z]+\s+){0,2}?(?:prompt|instructions|guidelines|configuration)\b/iu,
  },
  { type: "prompt_extraction", rule: "extract.en.repeat_above", pattern: /\b(?:repeat|print|copy|reproduce)\b[^.\n]{0,25}\b(?:everything|all|text|words?)\b[^.\n]{0,20}\b(?:above|before)\b|\bword for word\b/iu },
  { type: "prompt_extraction", rule: "extract.en.system_prompt_term", pattern: /\bsystem\s+prompt\b/iu },
  {
    type: "prompt_extraction",
    rule: "extract.hi.reveal_prompt",
    pattern: near("सिस्टम\\s*प्रॉम्प्ट|सिस्टम\\s*प्रोम्प्ट|अपने\\s*निर्देश|अपने\\s*नियम", "बताएं|बताओ|बताइए|दिखाएं|दिखाओ|बता\\s*दो|लिखें"),
  },
  {
    type: "prompt_extraction",
    rule: "extract.te.reveal_prompt",
    pattern: near("సిస్టమ్\\s*ప్రాంప్ట్|మీ\\s*సూచనల|మీ\\s*నియమాల", "చూపండి|చెప్పండి|బయటపెట్టండి|చూపించండి|రాయండి"),
  },
  {
    type: "prompt_extraction",
    rule: "extract.hinglish.reveal_prompt",
    pattern: near("system\\s*prompt|apne\\s*(?:instructions?|rules?|niyam)|apna\\s*prompt", "bata|batao|dikha|dikhao|show|print|likho", 50),
  },

  // ---- role hijack ----
  { type: "role_hijack", rule: "role.en.you_are_now", pattern: /\byou\s+are\s+(?:now|no longer)\b|\bfrom now on,?\s+you\b/iu },
  { type: "role_hijack", rule: "role.en.pretend", pattern: /\b(?:pretend|imagine)\s+(?:to be|that you(?:'re| are)|you(?:'re| are))\b|\brole-?play\s+as\b|\bact as (?:if you (?:are|were)|a different)\b/iu },
  { type: "role_hijack", rule: "role.en.persona_swap", pattern: /\b(?:rival|competitor)(?:'s)?\s+(?:company|business)?\s*(?:rep|representative|agent)\b/iu },
  { type: "role_hijack", rule: "role.hi.you_are_now", pattern: /अब\s*से\s*(?:तुम|आप)|तुम\s*अब|आप\s*अब\s*एक/u },
  { type: "role_hijack", rule: "role.hinglish.you_are_now", pattern: /\bab\s+se\s+tum\b|\btum\s+ab\s+ek\b|\baap\s+ab\s+ek\b/iu },

  // ---- fake structure / tag forgery ----
  { type: "tag_forgery", rule: "tag.untrusted_content_tags", pattern: /<\s*\/?\s*(?:retrieved_context|tool_result|system|assistant|instructions?)\b[^>]*>?/iu },
  { type: "tag_forgery", rule: "tag.role_markers", pattern: /\[\s*(?:system|assistant|inst)\s*\]|<\|(?:im_start|im_end|system|endoftext)\|>|^\s*#{2,}\s*system\b/imu },

  // ---- abuse (directed profanity / insults), English + Hinglish/Hindi/Telugu ----
  { type: "abuse", rule: "abuse.en.profanity", pattern: /\b(?:fuck(?:ing|er)?|f\*+k|shit|bitch|asshole|bastard|dickhead|dumbass|cunt|motherfucker)\b/iu },
  { type: "abuse", rule: "abuse.en.insult", pattern: /\byou(?:'re| are)?\s+(?:a\s+)?(?:stupid|useless|worthless|pathetic|idiot|moron|garbage|trash|piece of (?:shit|garbage|trash))\b|\b(?:stupid|useless|worthless)\s+(?:bot|robot|machine)\b/iu },
  { type: "abuse", rule: "abuse.hinglish.profanity", pattern: /\b(?:madarchod|behenchod|bhenchod|chutiya|chutiye|gandu|harami|bhosdi|bhosd|randi|kamina|kamine|saala|saale|bakchod)\b/iu },
  { type: "abuse", rule: "abuse.hi.profanity", pattern: /मादरचोद|बहनचोद|भेनचोद|चूतिया|गांडू|हरामी|कमीना|बकचोद/u },
  { type: "abuse", rule: "abuse.te.profanity", pattern: /\b(?:lanja|lanjakodaka|dengey|dengu|pukka|modda)\b|లంజ|దెంగ|పుక్కి/iu },
];

/** Collapses letter-spaced obfuscation ("i g n o r e", "i-g-n-o-r-e") back into words. */
function despace(text: string): string {
  return text.replace(/(?:^|(?<=[\s]))(?:[\p{L}][\s\-.]){3,}[\p{L}](?=$|[\s.,!?])/gu, (run) => run.replace(/[\s\-.]/g, ""));
}

const SQUASHED_OVERRIDE_RE = /(?:ignore|disregard|forget|override|bypass)(?:all|any|your|the)?(?:previous|prior|above|earlier)?(?:instructions|rules|prompt|guidelines)|(?:reveal|show|print|repeat)(?:your|the)?(?:system|hidden|initial)?(?:prompt|instructions)/;
const BASE64_RUN_RE = /[A-Za-z0-9+/]{24,}={0,2}/g;
const DECODED_OVERRIDE_RE = /(?:ignore|disregard|forget|reveal|system prompt|developer mode|you are now|previous instructions)/i;

function decodeBase64(blob: string): string | null {
  try {
    const bytes = typeof atob === "function" ? atob(blob) : "";
    // Only treat it as text if it is overwhelmingly printable ASCII.
    if (bytes.length < 12) return null;
    const printable = bytes.replace(/[^\x20-\x7e\n]/g, "").length;
    return printable / bytes.length > 0.9 ? bytes : null;
  } catch {
    return null;
  }
}

function runRules(text: string, hits: ClassifierHit[]): void {
  for (const rule of RULES) {
    if (rule.pattern.test(text) && !hits.some((hit) => hit.rule === rule.rule)) {
      hits.push({ type: rule.type, rule: rule.rule });
    }
  }
}

/**
 * Classifies a message that has already been through sanitizeVisitorText()
 * (invisible characters gone, NFKC applied). Returns every rule that matched;
 * an ordinary message returns an empty array. Also scans a de-spaced copy
 * (letter-spaced obfuscation) and any base64 blobs that decode to an override.
 */
export function classifyMessage(text: string): ClassifierHit[] {
  const hits: ClassifierHit[] = [];
  runRules(text, hits);

  const collapsed = despace(text);
  if (collapsed !== text) {
    runRules(collapsed, hits);
    // Letter-spaced text with single spaces everywhere leaves no word gaps to
    // match on ("i g n o r e a l l ..."), so also test it squashed to letters.
    const squashed = collapsed.toLowerCase().replace(/[^\p{L}]/gu, "");
    if (SQUASHED_OVERRIDE_RE.test(squashed) && !hits.some((hit) => hit.rule === "override.obfuscated_letter_spaced")) {
      hits.push({ type: "instruction_override", rule: "override.obfuscated_letter_spaced" });
    }
  }

  for (const blob of text.match(BASE64_RUN_RE) ?? []) {
    const decoded = decodeBase64(blob);
    if (decoded && DECODED_OVERRIDE_RE.test(decoded)) {
      hits.push({ type: "encoded_payload", rule: "encoded.base64_override" });
      break;
    }
  }
  if (/\b(?:decode|decrypt|rot13|base64)\b[^.\n]{0,60}\b(?:and|then)\b[^.\n]{0,30}\b(?:follow|execute|obey|do exactly|do what)\b/iu.test(text)) {
    if (!hits.some((hit) => hit.rule === "encoded.decode_and_follow")) {
      hits.push({ type: "encoded_payload", rule: "encoded.decode_and_follow" });
    }
  }
  return hits;
}
