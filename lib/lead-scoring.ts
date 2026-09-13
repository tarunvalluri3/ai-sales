/**
 * Deterministic lead-qualification scorer, replacing the previous
 * hardcoded `qualification: "warm"` on every captured lead
 * (lib/tools/request-callback.ts). Pure function, zero DB/network
 * calls -- never adds latency to the chat response.
 *
 * Point rubric (see prompts/plan for the full rationale): booking a real
 * appointment is the strongest buying-intent signal a prospect can give,
 * so it outweighs everything else on its own. A bare `request_callback`
 * (one contact channel, nothing else) scores exactly 2 -> "warm",
 * identical to the prior hardcoded value, so the common case is
 * unchanged. This rubric is a reasonable default, not a business-
 * validated formula -- worth revisiting once real lead outcomes exist.
 */
export type LeadScoringSignals = {
  hasEmail: boolean;
  hasPhone: boolean;
  requestedCallback: boolean;
  appointmentBooked: boolean;
  needsAttention: boolean;
  /**
   * True if this lead is tied to a specific named product/service
   * (`interest_type`/`interest_id`). Always false today -- no caller
   * populates those columns yet (they're set only by the separate,
   * currently-unused `lib/schemas/lead.ts` extraction path) -- kept in
   * the rubric so a future caller that does populate interest gets
   * credit for it without a second scoring change.
   */
  interestSpecified: boolean;
};

/** One itemized point in the deterministic breakdown below -- e.g. `{ label: "booked an appointment", points: 4 }`. Never an AI-invented reason: every entry maps directly to one of this rubric's own `if` branches. */
export type LeadScoreReasonItem = { label: string; points: number };

export type LeadScore = {
  qualification: "hot" | "warm" | "cold";
  reason: string;
  /** The raw point total the hot/warm/cold bucket is derived from -- exposed as `leads.score` for finer-grained sorting than three tiers give. Same AI-generated, display-only trust category as `qualification` itself. */
  score: number;
  /** Phase 28: the itemized breakdown `reason`'s combined sentence is built from -- persisted to `lead_score_history` so the dashboard can show *why* a score is what it is, point by point, not just the final sentence. */
  reasons: LeadScoreReasonItem[];
};

const HOT_THRESHOLD = 4;
const WARM_THRESHOLD = 2;

/** The highest `score` this rubric can ever produce (4+2+1+1+1) -- the single source of truth for any "N out of MAX" display, so it can never drift from the point values above. */
export const MAX_LEAD_SCORE = 9;

export function scoreLead(signals: LeadScoringSignals): LeadScore {
  const sentenceFragments: string[] = [];
  const reasonItems: LeadScoreReasonItem[] = [];
  let points = 0;

  if (signals.appointmentBooked) {
    points += 4;
    sentenceFragments.push("booked an appointment");
    reasonItems.push({ label: "Appointment booked", points: 4 });
  }
  if (signals.requestedCallback) {
    points += 2;
    sentenceFragments.push("requested a callback");
    reasonItems.push({ label: "Requested a callback", points: 2 });
  }
  if (signals.hasEmail && signals.hasPhone) {
    points += 1;
    sentenceFragments.push("provided both email and phone");
    reasonItems.push({ label: "Provided both email and phone", points: 1 });
  }
  if (signals.needsAttention) {
    points += 1;
    sentenceFragments.push("conversation flagged for human follow-up");
    reasonItems.push({ label: "Conversation flagged for human follow-up", points: 1 });
  }
  if (signals.interestSpecified) {
    points += 1;
    sentenceFragments.push("named a specific product or service");
    reasonItems.push({ label: "Named a specific product or service", points: 1 });
  }

  const qualification: LeadScore["qualification"] =
    points >= HOT_THRESHOLD ? "hot" : points >= WARM_THRESHOLD ? "warm" : "cold";

  const reason =
    sentenceFragments.length > 0
      ? `Prospect ${formatReasonList(sentenceFragments)}.`
      : "Prospect left contact info without a specific ask.";

  return { qualification, reason, score: points, reasons: reasonItems };
}

function formatReasonList(reasons: string[]): string {
  if (reasons.length === 1) return reasons[0];
  if (reasons.length === 2) return `${reasons[0]} and ${reasons[1]}`;
  return `${reasons.slice(0, -1).join(", ")}, and ${reasons[reasons.length - 1]}`;
}
