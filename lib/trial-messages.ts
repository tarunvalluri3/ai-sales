/**
 * Owner-facing trial copy shared by the onboarding plan step, the billing page
 * and the channel gates. Pure (no server-only): client components import it.
 *
 * Round 3, item 2: a free trial is limited to one per Clerk user AND one per
 * organisation (migrations 20261121000000 + 20261124000200). A business that
 * gets no trial has an 'expired' row, surfaced as `trial_already_used`. The
 * database does not record which of the two rules refused it, so the message
 * names both, and always points at the paid plans shown next to it.
 */
export const TRIAL_NOT_AVAILABLE_MESSAGE =
  "A free trial isn't available here: there is one free trial per person and per organisation, and it has already been used. Choose a paid plan below to go live.";

/** Short form for places that already explain the plans (channel gates). */
export const TRIAL_ALREADY_USED_SHORT = "The free trial has already been used (one per person and per organisation).";
