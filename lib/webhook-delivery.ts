import "server-only";
import crypto from "node:crypto";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/logger";
import type { WebhookEndpoint } from "@/lib/supabase/types";

/**
 * Phase 24's outbound webhook delivery queue -- same claim/backoff/
 * dead-letter shape as lib/ingestion-queue.ts (Phase 23), reused
 * deliberately rather than reinvented. Triggered the same two ways:
 * an after() call right after a qualifying lead is created (near-instant
 * common case) and the shared daily cron backstop
 * (app/api/cron/process-ingestion-queue/route.ts, which now sweeps both
 * queues in one invocation -- Vercel's Hobby plan caps cron jobs, so
 * this app deliberately runs one daily cron route that does everything
 * the immediate triggers might have missed, rather than one cron job per
 * queue).
 */

const MAX_DELIVERIES_PER_RUN = 10;
const MAX_DELIVERY_ATTEMPTS = 5;
const BACKOFF_BASE_SECONDS = 60;
const MAX_BACKOFF_SECONDS = 60 * 60;
const DELIVERY_TIMEOUT_MS = 10_000;

export type ProcessWebhooksResult = {
  processed: number;
  succeeded: number;
  failed: number;
  deadLettered: number;
};

function backoffSeconds(attempts: number): number {
  return Math.min(BACKOFF_BASE_SECONDS * 2 ** (attempts - 1), MAX_BACKOFF_SECONDS);
}

function errorMessageOnly(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

function signPayload(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

type WebhookDeliveryRow = {
  id: string;
  business_id: string;
  endpoint_id: string;
  event_type: string;
  payload: unknown;
  attempts: number;
};

export async function processWebhookDeliveries(): Promise<ProcessWebhooksResult> {
  const supabase = createServiceSupabaseClient();

  const { data: deliveries, error: claimError } = await supabase.rpc("claim_webhook_deliveries", {
    p_limit: MAX_DELIVERIES_PER_RUN,
  });

  if (claimError) {
    logEvent("webhook_delivery_claim_failed", "unknown", {}, "error");
    return { processed: 0, succeeded: 0, failed: 0, deadLettered: 0 };
  }

  const claimed = (deliveries ?? []) as WebhookDeliveryRow[];
  let succeeded = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const delivery of claimed) {
    const { data: endpoint } = await supabase
      .from("webhook_endpoints")
      .select("*")
      .eq("id", delivery.endpoint_id)
      .maybeSingle<WebhookEndpoint>();

    if (!endpoint || endpoint.status !== "active") {
      // The endpoint was deleted or disabled since this delivery was
      // enqueued -- nothing to deliver to, not a retryable failure.
      await supabase
        .from("webhook_deliveries")
        .update({ status: "failed", last_error: "Endpoint no longer active.", updated_at: new Date().toISOString() })
        .eq("id", delivery.id);
      deadLettered++;
      continue;
    }

    try {
      const body = JSON.stringify(delivery.payload);
      const signature = signPayload(endpoint.secret, body);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(endpoint.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Event": delivery.event_type,
            "X-Webhook-Signature": signature,
          },
          body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        throw new Error(`Endpoint responded with status ${response.status}`);
      }

      await supabase
        .from("webhook_deliveries")
        .update({ status: "complete", updated_at: new Date().toISOString(), delivered_at: new Date().toISOString() })
        .eq("id", delivery.id);

      succeeded++;
      logEvent("webhook_delivery_succeeded", delivery.business_id, { deliveryId: delivery.id });
    } catch (error) {
      const attempts = delivery.attempts + 1;
      const isDeadLetter = attempts >= MAX_DELIVERY_ATTEMPTS;

      await supabase
        .from("webhook_deliveries")
        .update({
          status: isDeadLetter ? "failed" : "pending",
          attempts,
          last_error: errorMessageOnly(error),
          next_attempt_at: new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", delivery.id);

      failed++;
      if (isDeadLetter) deadLettered++;
      logEvent(
        isDeadLetter ? "webhook_delivery_dead_lettered" : "webhook_delivery_retry_scheduled",
        delivery.business_id,
        { deliveryId: delivery.id, attempts },
        isDeadLetter ? "error" : undefined,
      );
    }
  }

  return { processed: claimed.length, succeeded, failed, deadLettered };
}
