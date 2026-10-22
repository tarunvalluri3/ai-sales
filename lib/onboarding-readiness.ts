import type {
  IngestionStatus,
  KnowledgeDocumentStatus,
  KnowledgeSourceType,
} from "@/lib/supabase/types";

/**
 * Onboarding readiness (feat/onboarding-readiness). Decides whether a
 * business has enough real, retrievable information for its AI agent to
 * face prospects before it is allowed to publish for the FIRST time.
 *
 * This module is PURE -- no I/O, no `server-only` -- so the whole rule set
 * is unit-testable (scripts/run-onboarding-readiness-tests.mjs) and can be
 * imported by both the server gate (lib/business.ts) and the UI. The
 * server-side data loader that turns Supabase rows into a
 * `ReadinessInput` lives in lib/onboarding-readiness-data.ts.
 *
 * Readiness is NOT billing. Nothing here reads the subscription/trial
 * state; a trialing business can be fully ready, and the gate only ever
 * blocks a first publish (see `alreadyPublished`), so a paying business is
 * never switched off by these rules. The separate `subscription_not_serving`
 * gate in lib/rag.ts governs whether an already-live agent replies.
 */

/** The description must be a real sentence about what the business sells and to whom, not a one-word placeholder. */
export const DESCRIPTION_MIN_LENGTH = 40;
/** A meaningful FAQ needs a real question and a real answer, not a stub. */
export const FAQ_QUESTION_MIN_LENGTH = 10;
export const FAQ_ANSWER_MIN_LENGTH = 20;
/** A catalog item needs a name and a real description (no price required -- PRODUCT.md §8). */
export const CATALOG_DESCRIPTION_MIN_LENGTH = 10;
/** At least this many retrieval-ready FAQs before the agent faces customers. */
export const MIN_READY_FAQS = 3;
/** At least one knowledge source that actually reached retrieval. */
export const MIN_READY_KNOWLEDGE_SOURCES = 1;
/** At least one product or service, where the business type makes a catalog relevant. */
export const MIN_CATALOG_ITEMS = 1;

/**
 * Business types for which selling at least one named product/service is a
 * real expectation -- so `catalog_present` is REQUIRED for them (the owner
 * can still mark it not-applicable if their model genuinely has no fixed
 * catalog). For every other type it is only RECOMMENDED. Keys match
 * BUSINESS_TYPES in lib/schemas/business.ts.
 */
export const CATALOG_REQUIRED_BUSINESS_TYPES: ReadonlySet<string> = new Set([
  "ecommerce",
  "retail",
  "professional_services",
  "hospitality",
  "real_estate",
  "technology",
]);

/**
 * Item keys the owner may explicitly mark "doesn't apply to us" (the brief's
 * "let the user say so explicitly rather than inventing a value"). Only a
 * conditional item is ever dismissible -- a genuinely-required item
 * (description, knowledge, FAQs) can never be waived. `business_hours` is
 * deliberately absent: when appointment booking is on, hours are not
 * optional (no hours = no bookable slots), and when it is off the item is
 * already non-blocking.
 */
export const DISMISSIBLE_ITEM_KEYS = ["catalog_present"] as const;
export type DismissibleItemKey = (typeof DISMISSIBLE_ITEM_KEYS)[number];

export function isDismissibleItemKey(key: string): key is DismissibleItemKey {
  return (DISMISSIBLE_ITEM_KEYS as readonly string[]).includes(key);
}

export type ReadinessTier = "required" | "recommended";
export type ReadinessItemStatus = "met" | "unmet" | "not_applicable";

export type ReadinessItemKey =
  | "profile_name"
  | "profile_business_type"
  | "profile_description"
  | "profile_contact_email"
  | "knowledge_ready"
  | "faqs_ready"
  | "catalog_present"
  | "business_hours"
  | "contact_phone"
  | "website"
  | "privacy_policy_url";

export type ReadinessItem = {
  key: ReadinessItemKey;
  label: string;
  /** Plain-language reason this matters to a real prospect conversation. */
  why: string;
  tier: ReadinessTier;
  status: ReadinessItemStatus;
  /** True only for an unmet required item that has not been dismissed. */
  blocksPublish: boolean;
  dismissible: boolean;
  /** What the owner still has to do, shown only when the item is unmet. */
  action: string | null;
};

export type ReadinessReport = {
  items: ReadinessItem[];
  /** Unmet required items that are currently preventing a first publish. */
  blockingItems: ReadinessItem[];
  /**
   * Would a first publish be allowed right now? For an already-published
   * business this is always true (the gate never blocks a republish) --
   * read `blockingItems` for the audit view regardless of publish state.
   */
  canPublish: boolean;
  /** False once the business has already been published -- the gate no longer applies. */
  gateApplies: boolean;
};

/** One knowledge source (manual/file/url/product/service/faq generated doc) with the state the ingestion queue left it in. */
export type ReadinessKnowledgeSource = {
  sourceType: KnowledgeSourceType;
  ingestionStatus: IngestionStatus;
  documentStatus: KnowledgeDocumentStatus;
  hasChunks: boolean;
};

/** One approved FAQ, with the ingestion state of the knowledge document it generated (null if that document does not exist yet). */
export type ReadinessFaq = {
  question: string;
  answer: string;
  generatedDocIngestionStatus: IngestionStatus | null;
};

/** One approved product or service (name + description only -- price is never required). */
export type ReadinessCatalogItem = {
  name: string;
  description: string | null;
};

export type ReadinessInput = {
  businessType: string;
  name: string;
  description: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  privacyPolicyUrl: string | null;
  appointmentsEnabled: boolean;
  alreadyPublished: boolean;
  knowledgeSources: ReadinessKnowledgeSource[];
  faqs: ReadinessFaq[];
  catalogItems: ReadinessCatalogItem[];
  /** Number of weekly days marked open in business_hours. */
  openBusinessHoursDayCount: number;
  /** Item keys the owner has explicitly marked not-applicable. */
  dismissedItemKeys: string[];
};

function trimmedLength(value: string | null | undefined): number {
  return value ? value.trim().length : 0;
}

/** A knowledge source counts as retrieval-ready only when extraction, embedding and persistence all genuinely succeeded. */
export function isKnowledgeSourceReady(source: ReadinessKnowledgeSource): boolean {
  return (
    source.ingestionStatus === "complete" &&
    source.documentStatus === "published" &&
    source.hasChunks
  );
}

/** A FAQ is retrieval-ready only when both sides are meaningful AND its generated document reached the agent (ingestion complete). */
export function isFaqReady(faq: ReadinessFaq): boolean {
  return (
    trimmedLength(faq.question) >= FAQ_QUESTION_MIN_LENGTH &&
    trimmedLength(faq.answer) >= FAQ_ANSWER_MIN_LENGTH &&
    faq.generatedDocIngestionStatus === "complete"
  );
}

/** A catalog item counts only with a name and a real description (never a price). */
export function isCatalogItemComplete(item: ReadinessCatalogItem): boolean {
  return trimmedLength(item.name) > 0 && trimmedLength(item.description) >= CATALOG_DESCRIPTION_MIN_LENGTH;
}

export function countReadyKnowledgeSources(sources: ReadinessKnowledgeSource[]): number {
  return sources.filter(isKnowledgeSourceReady).length;
}

export function countReadyFaqs(faqs: ReadinessFaq[]): number {
  return faqs.filter(isFaqReady).length;
}

export function countCompleteCatalogItems(items: ReadinessCatalogItem[]): number {
  return items.filter(isCatalogItemComplete).length;
}

/**
 * Evaluates every readiness rule against an in-memory snapshot and returns
 * the full checklist plus the publish verdict. Pure and deterministic.
 */
export function evaluateReadiness(input: ReadinessInput): ReadinessReport {
  const dismissed = new Set(input.dismissedItemKeys.filter(isDismissibleItemKey));

  const readyKnowledge = countReadyKnowledgeSources(input.knowledgeSources);
  const readyFaqs = countReadyFaqs(input.faqs);
  const completeCatalog = countCompleteCatalogItems(input.catalogItems);

  const catalogRequired = CATALOG_REQUIRED_BUSINESS_TYPES.has(input.businessType);

  const raw: Array<{
    key: ReadinessItemKey;
    label: string;
    why: string;
    tier: ReadinessTier;
    met: boolean;
    dismissible: boolean;
    action: string | null;
  }> = [
    {
      key: "profile_name",
      label: "Business name",
      why: "The agent introduces itself as an employee of your business — it needs your name.",
      tier: "required",
      met: trimmedLength(input.name) > 0,
      dismissible: false,
      action: "Add your business name in onboarding.",
    },
    {
      key: "profile_business_type",
      label: "Business type",
      why: "Your industry decides which of the checks below apply to you.",
      tier: "required",
      met: trimmedLength(input.businessType) > 0,
      dismissible: false,
      action: "Pick your business type in onboarding.",
    },
    {
      key: "profile_description",
      label: "Description of what you sell and to whom",
      why: "This is the agent's core sense of who you are. Without it, it can't speak for your business convincingly.",
      tier: "required",
      met: trimmedLength(input.description) >= DESCRIPTION_MIN_LENGTH,
      dismissible: false,
      action: `Write at least ${DESCRIPTION_MIN_LENGTH} characters describing what your business offers and who it serves (Profile).`,
    },
    {
      key: "profile_contact_email",
      label: "Contact email",
      why: "Lead, handover and appointment alerts all go to this address — without it you never hear about a prospect.",
      tier: "required",
      met: input.contactEmail != null && trimmedLength(input.contactEmail) > 0,
      dismissible: false,
      action: "Add a contact email in Profile.",
    },
    {
      key: "knowledge_ready",
      label: "At least one knowledge source the agent can draw on",
      why: "The agent answers only from your approved, embedded knowledge. With none ready, it can't answer a single business question.",
      tier: "required",
      met: readyKnowledge >= MIN_READY_KNOWLEDGE_SOURCES,
      dismissible: false,
      action:
        "Add products, services, FAQs or knowledge and wait for each to finish processing. A source that failed or is still processing doesn't count yet.",
    },
    {
      key: "faqs_ready",
      label: `At least ${MIN_READY_FAQS} FAQs the agent can retrieve`,
      why: "FAQs cover the questions prospects actually ask first. Three real, finished FAQs are the minimum before the agent faces customers.",
      tier: "required",
      met: readyFaqs >= MIN_READY_FAQS,
      dismissible: false,
      action: `You have ${readyFaqs} of ${MIN_READY_FAQS} ready. Add FAQs with a real question and answer, and wait for each to finish processing.`,
    },
    {
      key: "catalog_present",
      label: "At least one product or service",
      why: "Prospects ask what you offer. A named product or service (a price is never required) gives the agent something concrete to recommend.",
      tier: catalogRequired ? "required" : "recommended",
      met: completeCatalog >= MIN_CATALOG_ITEMS,
      dismissible: true,
      action: "Add one product or service with a name and a short description — or mark this not-applicable if you genuinely don't sell a fixed catalog.",
    },
    {
      key: "business_hours",
      label: "Business hours configured",
      why: input.appointmentsEnabled
        ? "Appointment booking is on, and the agent offers slots only inside your open hours. With no hours set, there are no bookable slots at all."
        : "Set your open hours so the agent can greet prospects accurately and answer “are you open now?”.",
      tier: input.appointmentsEnabled ? "required" : "recommended",
      met: input.openBusinessHoursDayCount > 0,
      dismissible: false,
      action: "Set your weekly open hours (Appointments → Availability).",
    },
    {
      key: "contact_phone",
      label: "Contact phone",
      why: "Lets the agent share a real phone number when a prospect wants to call.",
      tier: "recommended",
      met: input.contactPhone != null && trimmedLength(input.contactPhone) > 0,
      dismissible: false,
      action: "Add a contact phone in Profile.",
    },
    {
      key: "website",
      label: "Website",
      why: "Lets the agent point prospects to your site.",
      tier: "recommended",
      met: input.website != null && trimmedLength(input.website) > 0,
      dismissible: false,
      action: "Add your website URL in Profile.",
    },
    {
      key: "privacy_policy_url",
      label: "Your own privacy policy URL",
      why: "The widget's consent notice links here. Until you set it, it falls back to this platform's privacy policy instead of yours.",
      tier: "recommended",
      met: input.privacyPolicyUrl != null && trimmedLength(input.privacyPolicyUrl) > 0,
      dismissible: false,
      action: "Add your privacy policy URL (Widget → Branding & language).",
    },
  ];

  const items: ReadinessItem[] = raw.map((r) => {
    const isDismissed = r.dismissible && !r.met && dismissed.has(r.key as DismissibleItemKey);
    const status: ReadinessItemStatus = r.met ? "met" : isDismissed ? "not_applicable" : "unmet";
    const blocksPublish = r.tier === "required" && status === "unmet";
    return {
      key: r.key,
      label: r.label,
      why: r.why,
      tier: r.tier,
      status,
      blocksPublish,
      dismissible: r.dismissible,
      action: r.met ? null : r.action,
    };
  });

  const blockingItems = items.filter((item) => item.blocksPublish);
  const gateApplies = !input.alreadyPublished;

  return {
    items,
    blockingItems,
    // A republish is never gated, so an already-published business can always publish.
    canPublish: input.alreadyPublished || blockingItems.length === 0,
    gateApplies,
  };
}

/** A short, human-readable reason a publish was refused, for the server gate's error. */
export function describeBlockingItems(blockingItems: ReadinessItem[]): string {
  if (blockingItems.length === 0) {
    return "Your AI isn't ready to publish yet.";
  }
  const labels = blockingItems.map((item) => item.label).join("; ");
  return `Your AI isn't ready to publish yet. Still needed: ${labels}.`;
}
