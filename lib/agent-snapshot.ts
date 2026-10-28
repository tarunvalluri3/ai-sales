import { z } from "zod";

/**
 * Draft -> Publish -> Live (2026-10-29). The shape of `agent_versions.snapshot`
 * (built in SQL by `build_agent_snapshot()`, supabase/migrations/
 * 20261107000000_agent_draft_publish.sql), plus the pure diff the dashboard
 * uses to say what a publish would change. No server-only imports: the types
 * and the change list are shared with client components.
 *
 * "Agent" == business. The snapshot holds only what the live runtime needs to
 * answer; knowledge documents appear as references (the embedded chunks are
 * copied into `live_knowledge_chunks` at publish, not stored here).
 */

const nullableString = z.string().nullable();

const catalogItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: nullableString,
  // numeric(12,2) comes back from jsonb as a JSON number.
  price: z.union([z.string(), z.number()]).nullable(),
  priceAmount: z.number().nullable(),
  category: nullableString,
  imageUrl: nullableString,
  createdAt: z.string(),
});

const faqSchema = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
  createdAt: z.string(),
});

const knowledgeRefSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceType: z.string(),
  contentHash: z.string(),
});

export const agentSnapshotSchema = z.object({
  schema: z.literal(1),
  config: z.object({
    name: z.string(),
    description: nullableString,
    contactEmail: nullableString,
    contactPhone: nullableString,
    website: nullableString,
    language: z.enum(["en", "es", "fr", "de", "pt", "hi"]),
    persona: z.object({
      welcomeText: nullableString,
      welcomeTextClosed: nullableString,
      ctaText: nullableString,
      suggestedQuestions: z.array(z.string()),
    }),
    channels: z.object({
      accentColor: nullableString,
      logoUrl: nullableString,
      position: z.enum(["bottom-right", "bottom-left"]),
      privacyPolicyUrl: nullableString,
    }),
    capabilities: z.object({
      recommendProducts: z.boolean(),
      appointments: z.boolean(),
    }),
  }),
  products: z.array(catalogItemSchema),
  services: z.array(catalogItemSchema),
  faqs: z.array(faqSchema),
  knowledge: z.array(knowledgeRefSchema),
});

export type AgentSnapshot = z.infer<typeof agentSnapshotSchema>;
export type SnapshotCatalogItem = z.infer<typeof catalogItemSchema>;
export type SnapshotFaq = z.infer<typeof faqSchema>;

/** One line in the "what will change" list. `count` feeds the "Publish changes (N)" badge. */
export type AgentChange = {
  /** Stable key, also the display grouping. */
  area: "business" | "persona" | "branding" | "capabilities" | "products" | "services" | "faqs" | "knowledge";
  label: string;
  count: number;
};

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffById<T extends { id: string }>(
  live: T[],
  draft: T[],
  isEdited: (a: T, b: T) => boolean,
): { added: number; removed: number; edited: number } {
  const liveById = new Map(live.map((item) => [item.id, item]));
  const draftIds = new Set(draft.map((item) => item.id));
  let added = 0;
  let edited = 0;
  for (const item of draft) {
    const before = liveById.get(item.id);
    if (!before) added += 1;
    else if (isEdited(before, item)) edited += 1;
  }
  const removed = live.filter((item) => !draftIds.has(item.id)).length;
  return { added, removed, edited };
}

function itemChanges(
  area: AgentChange["area"],
  counts: { added: number; removed: number; edited: number },
  singular: string,
  pluralForm = `${singular}s`,
): AgentChange[] {
  const out: AgentChange[] = [];
  if (counts.added > 0) out.push({ area, label: `${plural(counts.added, singular, pluralForm)} added`, count: counts.added });
  if (counts.edited > 0) out.push({ area, label: `${plural(counts.edited, singular, pluralForm)} edited`, count: counts.edited });
  if (counts.removed > 0) out.push({ area, label: `${plural(counts.removed, singular, pluralForm)} removed`, count: counts.removed });
  return out;
}

/**
 * What publishing `draft` would change relative to `live`, as short labelled
 * counts (not a text diff). Pure and order-stable. An empty result means the
 * two are equivalent for every field the runtime reads.
 */
export function diffAgentSnapshots(live: AgentSnapshot, draft: AgentSnapshot): AgentChange[] {
  const changes: AgentChange[] = [];
  const a = live.config;
  const b = draft.config;

  if (a.description !== b.description) changes.push({ area: "business", label: "Description edited", count: 1 });
  if (
    a.name !== b.name ||
    a.contactEmail !== b.contactEmail ||
    a.contactPhone !== b.contactPhone ||
    a.website !== b.website
  ) {
    changes.push({ area: "business", label: "Business details edited", count: 1 });
  }
  if (a.language !== b.language || !sameJson(a.persona, b.persona)) {
    changes.push({ area: "persona", label: "Persona and greeting edited", count: 1 });
  }
  if (!sameJson(a.channels, b.channels)) {
    changes.push({ area: "branding", label: "Widget branding edited", count: 1 });
  }
  if (!sameJson(a.capabilities, b.capabilities)) {
    changes.push({ area: "capabilities", label: "AI capabilities edited", count: 1 });
  }

  const catalogEdited = (x: SnapshotCatalogItem, y: SnapshotCatalogItem) =>
    !sameJson({ ...x, createdAt: "" }, { ...y, createdAt: "" });
  changes.push(...itemChanges("products", diffById(live.products, draft.products, catalogEdited), "product"));
  changes.push(...itemChanges("services", diffById(live.services, draft.services, catalogEdited), "service"));
  changes.push(
    ...itemChanges(
      "faqs",
      diffById(live.faqs, draft.faqs, (x, y) => x.question !== y.question || x.answer !== y.answer),
      "FAQ",
    ),
  );
  changes.push(
    ...itemChanges(
      "knowledge",
      diffById(live.knowledge, draft.knowledge, (x, y) => x.contentHash !== y.contentHash),
      "knowledge document",
    ),
  );

  return changes;
}

/** The number on the "Publish changes (N)" button. */
export function countChanges(changes: AgentChange[]): number {
  return changes.reduce((total, change) => total + change.count, 0);
}
