import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { graphRequest } from "@/lib/meta-graph";
import { getWhatsappAccessToken } from "@/lib/whatsapp-token";
import { logEvent } from "@/lib/logger";
import { DEFAULT_WHATSAPP_TEMPLATE_LANGUAGE, WHATSAPP_TEMPLATES, type WhatsappTemplateKind } from "@/lib/whatsapp-templates";
import {
  buildTemplateCreateBody,
  normaliseTemplateStatus,
  parseTemplateList,
  type TemplateStatus,
  type TemplateStatusUpdate,
} from "@/lib/whatsapp-embedded-signup-rules";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

/**
 * Per-business WhatsApp message templates (production readiness item 6).
 *
 * Templates belong to each business's own WhatsApp Business Account (WABA), so
 * each business needs its own approved copy of our appointment templates
 * (lib/whatsapp-templates.ts). This module:
 *   - SUBMITS any of them the WABA doesn't have yet (POST
 *     /<WABA_ID>/message_templates, UTILITY, positional params with examples);
 *   - SYNCS their review status from Meta (GET /<WABA_ID>/message_templates);
 *   - applies Meta's `message_template_status_update` webhook.
 * Results live in public.whatsapp_template_statuses, shown on the WhatsApp page.
 *
 * Names: the configured WHATSAPP_TEMPLATE_* name if set, else the suggested
 * name. Sending still uses the configured names (lib/whatsapp-templates.ts),
 * so set each WHATSAPP_TEMPLATE_* to the suggested name to use what this submits.
 */

export function templateLanguage(): string {
  return process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || DEFAULT_WHATSAPP_TEMPLATE_LANGUAGE;
}

export function templateNameFor(kind: WhatsappTemplateKind): string {
  const definition = WHATSAPP_TEMPLATES[kind];
  return process.env[definition.envVar]?.trim() || definition.suggestedName;
}

const KINDS = Object.keys(WHATSAPP_TEMPLATES) as WhatsappTemplateKind[];
const MAX_PAGES = 5;

type ConnectionForTemplates = { waba_id: string };

async function loadConnection(supabase: ServiceSupabaseClient, businessId: string) {
  const { data } = await supabase
    .from("whatsapp_connections")
    .select("waba_id")
    .eq("business_id", businessId)
    .maybeSingle<ConnectionForTemplates>();
  if (!data) return null;
  const token = await getWhatsappAccessToken(supabase, businessId);
  return token ? { wabaId: data.waba_id, token } : null;
}

async function upsertStatus(
  supabase: ServiceSupabaseClient,
  row: {
    businessId: string;
    wabaId: string;
    name: string;
    language: string;
    status: TemplateStatus;
    category?: string | null;
    rejectedReason?: string | null;
    metaTemplateId?: string | null;
    lastError?: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("whatsapp_template_statuses").upsert(
    {
      business_id: row.businessId,
      waba_id: row.wabaId,
      template_name: row.name,
      language: row.language,
      status: row.status,
      category: row.category ?? null,
      rejected_reason: row.rejectedReason ?? null,
      meta_template_id: row.metaTemplateId ?? null,
      last_error: row.lastError ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id,template_name,language" },
  );
  if (error) logEvent("whatsapp_template_status_write_failed", row.businessId, { code: error.code ?? "unknown" }, "error");
}

export type TemplateSyncResult =
  | { ok: true; statuses: Record<string, TemplateStatus> }
  | { ok: false; reason: "not_connected" | "meta_error"; metaMessage?: string | null };

/** Reads the WABA's templates and records the status of each of ours. */
export async function syncWhatsappTemplateStatuses(
  supabase: ServiceSupabaseClient,
  businessId: string,
): Promise<TemplateSyncResult> {
  const connection = await loadConnection(supabase, businessId);
  if (!connection) return { ok: false, reason: "not_connected" };

  const language = templateLanguage();
  const found = new Map<string, ReturnType<typeof parseTemplateList>[number]>();
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query: Record<string, string> = { fields: "id,name,language,status,category,rejected_reason", limit: "100" };
    if (after) query.after = after;
    const result = await graphRequest<{ data?: unknown; paging?: { cursors?: { after?: string }; next?: string } }>(
      "GET",
      `/${connection.wabaId}/message_templates`,
      { token: connection.token, query },
    );
    if (!result.ok) {
      logEvent("whatsapp_template_sync_failed", businessId, { status: result.status, metaCode: result.error?.code ?? null }, "error");
      return { ok: false, reason: "meta_error", metaMessage: result.error?.error_user_msg ?? result.error?.message ?? null };
    }
    for (const entry of parseTemplateList(result.data)) {
      if (entry.language === language) found.set(entry.name, entry);
    }
    after = result.data.paging?.next ? result.data.paging?.cursors?.after ?? null : null;
    if (!after) break;
  }

  const statuses: Record<string, TemplateStatus> = {};
  for (const kind of KINDS) {
    const name = templateNameFor(kind);
    const entry = found.get(name);
    if (entry) {
      statuses[name] = entry.status;
      await upsertStatus(supabase, {
        businessId,
        wabaId: connection.wabaId,
        name,
        language,
        status: entry.status,
        category: entry.category,
        rejectedReason: entry.rejectedReason,
        metaTemplateId: entry.id,
      });
    } else {
      // Keep a SUBMIT_FAILED row (and its error) until a submit succeeds.
      const { data: existing } = await supabase
        .from("whatsapp_template_statuses")
        .select("status")
        .eq("business_id", businessId)
        .eq("template_name", name)
        .eq("language", language)
        .maybeSingle<{ status: string }>();
      const keep = existing?.status === "SUBMIT_FAILED";
      statuses[name] = keep ? "SUBMIT_FAILED" : "NOT_SUBMITTED";
      if (!keep) await upsertStatus(supabase, { businessId, wabaId: connection.wabaId, name, language, status: "NOT_SUBMITTED" });
    }
  }
  return { ok: true, statuses };
}

export type TemplateSubmitResult =
  | { ok: true; submitted: string[]; failed: string[]; alreadyPresent: string[] }
  | { ok: false; reason: "not_connected" | "meta_error"; metaMessage?: string | null };

/**
 * Submits every one of our templates the WABA doesn't have yet (status
 * NOT_SUBMITTED or SUBMIT_FAILED). Rejected templates are NOT resubmitted
 * automatically -- Meta refuses a duplicate name; they need an edit or a new
 * name, which the status panel tells the owner.
 */
export async function submitWhatsappTemplates(
  supabase: ServiceSupabaseClient,
  businessId: string,
): Promise<TemplateSubmitResult> {
  const sync = await syncWhatsappTemplateStatuses(supabase, businessId);
  if (!sync.ok) return sync;
  const connection = await loadConnection(supabase, businessId);
  if (!connection) return { ok: false, reason: "not_connected" };

  const language = templateLanguage();
  const submitted: string[] = [];
  const failed: string[] = [];
  const alreadyPresent: string[] = [];
  for (const kind of KINDS) {
    const name = templateNameFor(kind);
    const current = sync.statuses[name];
    if (current !== "NOT_SUBMITTED" && current !== "SUBMIT_FAILED") {
      alreadyPresent.push(name);
      continue;
    }
    const definition = WHATSAPP_TEMPLATES[kind];
    const result = await graphRequest<{ id?: string; status?: string; category?: string }>(
      "POST",
      `/${connection.wabaId}/message_templates`,
      { token: connection.token, json: buildTemplateCreateBody({ name, language, body: definition.body, example: definition.example }) },
    );
    if (result.ok) {
      submitted.push(name);
      await upsertStatus(supabase, {
        businessId,
        wabaId: connection.wabaId,
        name,
        language,
        status: normaliseTemplateStatus(result.data.status) ?? "PENDING",
        category: result.data.category ?? "UTILITY",
        metaTemplateId: result.data.id ?? null,
      });
    } else {
      failed.push(name);
      const metaMessage = (result.error?.error_user_msg ?? result.error?.message ?? "Meta refused the template.").slice(0, 300);
      logEvent("whatsapp_template_submit_failed", businessId, { template: name, status: result.status, metaCode: result.error?.code ?? null }, "error");
      await upsertStatus(supabase, { businessId, wabaId: connection.wabaId, name, language, status: "SUBMIT_FAILED", lastError: metaMessage });
    }
  }
  logEvent("whatsapp_templates_submitted", businessId, { submitted: submitted.length, failed: failed.length });
  return { ok: true, submitted, failed, alreadyPresent };
}

/** Applies `message_template_status_update` webhook changes to every business on that WABA. Never throws. */
export async function applyTemplateStatusUpdates(
  supabase: ServiceSupabaseClient,
  updates: TemplateStatusUpdate[],
): Promise<void> {
  for (const update of updates) {
    const { data: connections } = await supabase
      .from("whatsapp_connections")
      .select("business_id")
      .eq("waba_id", update.wabaId);
    for (const connection of (connections ?? []) as { business_id: string }[]) {
      await upsertStatus(supabase, {
        businessId: connection.business_id,
        wabaId: update.wabaId,
        name: update.name,
        language: update.language,
        status: update.status,
        rejectedReason: update.status === "REJECTED" ? update.reason : null,
        metaTemplateId: update.templateId,
      });
      logEvent("whatsapp_template_status_changed", connection.business_id, { template: update.name, status: update.status });
    }
  }
}

/** Scheduler job: refresh template statuses for connected businesses (the webhook is the fast path). */
export async function syncAllWhatsappTemplateStatuses(): Promise<{ businesses: number; failed: number }> {
  const supabase = createServiceSupabaseClient();
  const { data } = await supabase
    .from("whatsapp_connections")
    .select("business_id")
    .eq("status", "connected")
    .order("updated_at", { ascending: true, nullsFirst: true })
    .limit(50);
  let failed = 0;
  const rows = (data ?? []) as { business_id: string }[];
  for (const row of rows) {
    const result = await syncWhatsappTemplateStatuses(supabase, row.business_id);
    if (!result.ok) failed++;
  }
  return { businesses: rows.length, failed };
}
