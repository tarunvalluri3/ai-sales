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

export type LeadScore = {
  qualification: "hot" | "warm" | "cold";
  reason: string;
};

const HOT_THRESHOLD = 4;
const WARM_THRESHOLD = 2;

export function scoreLead(signals: LeadScoringSignals): LeadScore {
  const reasons: string[] = [];
  let points = 0;

  if (signals.appointmentBooked) {
    points += 4;
    reasons.push("booked an appointment");
  }
  if (signals.requestedCallback) {
    points += 2;
    reasons.push("requested a callback");
  }
  if (signals.hasEmail && signals.hasPhone) {
    points += 1;
    reasons.push("provided both email and phone");
  }
  if (signals.needsAttention) {
    points += 1;
    reasons.push("conversation flagged for human follow-up");
  }
  if (signals.interestSpecified) {
    points += 1;
    reasons.push("named a specific product or service");
  }

  const qualification: LeadScore["qualification"] =
    points >= HOT_THRESHOLD ? "hot" : points >= WARM_THRESHOLD ? "warm" : "cold";

  const reason =
    reasons.length > 0
      ? `Prospect ${formatReasonList(reasons)}.`
      : "Prospect left contact info without a specific ask.";

  return { qualification, reason };
}

function formatReasonList(reasons: string[]): string {
  if (reasons.length === 1) return reasons[0];
  if (reasons.length === 2) return `${reasons[0]} and ${reasons[1]}`;
  return `${reasons.slice(0, -1).join(", ")}, and ${reasons[reasons.length - 1]}`;
}
