import "server-only";
import { randomUUID } from "node:crypto";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { logEvent } from "@/lib/logger";
import { agentImageSchema, agentImagePath, detectAgentImageType, type AgentImagePurpose } from "@/lib/schemas/agent-image";

const BUCKET = "agent-images";

export async function uploadAgentImage(businessId: string, purpose: AgentImagePurpose, input: unknown) {
  if (input == null || input === "" || (input instanceof File && input.size === 0 && input.name === "")) return null;
  const parsed = agentImageSchema.safeParse(input);
  if (!parsed.success) throw new AppError("Choose a JPEG, PNG, or WebP image up to 2 MB.");
  const bytes = new Uint8Array(await parsed.data.arrayBuffer());
  const contentType = detectAgentImageType(bytes);
  if (!contentType || contentType !== parsed.data.type) throw new AppError("The file contents don’t match its image type.");
  const path = agentImagePath(businessId, purpose, randomUUID(), contentType);
  const bucket = createServiceSupabaseClient().storage.from(BUCKET);
  const { error } = await bucket.upload(path, bytes, { contentType, cacheControl: "31536000", upsert: false });
  if (error) throw new AppError("Could not upload the image. Please try again.", "agent image upload failed");
  return bucket.getPublicUrl(path).data.publicUrl;
}

function snapshotImages(snapshot: unknown): string[] {
  if (!snapshot || typeof snapshot !== "object") return [];
  const { products, services, config } = snapshot as { products?: { imageUrl?: unknown }[]; services?: { imageUrl?: unknown }[]; config?: { persona?: { agentAvatarUrl?: unknown } } };
  return [...(products ?? []).map((item) => item.imageUrl), ...(services ?? []).map((item) => item.imageUrl), config?.persona?.agentAvatarUrl]
    .filter((url): url is string => typeof url === "string");
}

export async function liveAgentImages(businessId: string): Promise<string[]> {
  const db = createServerSupabaseClient();
  const business = await db.from("businesses").select("live_version_id").eq("id", businessId).maybeSingle();
  if (business.error) throw business.error;
  if (!business.data?.live_version_id) return [];
  const version = await db.from("agent_versions").select("snapshot").eq("business_id", businessId).eq("id", business.data.live_version_id).maybeSingle();
  if (version.error || !version.data) throw new Error("Could not check live agent images.");
  return snapshotImages(version.data.snapshot);
}

export async function readLiveAgentImagesForCleanup(businessId: string): Promise<string[]> {
  try {
    return await liveAgentImages(businessId);
  } catch {
    logEvent("agent_image_cleanup_failed", businessId, {}, "error");
    return [];
  }
}

export async function cleanupAgentImage(businessId: string, url: string | null | undefined) {
  if (!url) return;
  try {
    const bucket = createServiceSupabaseClient().storage.from(BUCKET);
    const objectBase = bucket.getPublicUrl(businessId).data.publicUrl + "/";
    if (!url.startsWith(objectBase)) return;
    const suffix = url.slice(objectBase.length);
    if (!/^(?:products|avatar)\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(suffix)) return;

    const db = createServerSupabaseClient();
    const [products, services, live] = await Promise.all([
      db.from("products").select("id").eq("business_id", businessId).eq("image_url", url).limit(1),
      db.from("services").select("id").eq("business_id", businessId).eq("image_url", url).limit(1),
      liveAgentImages(businessId),
    ]);
    if (products.error || services.error) throw new Error("Could not verify image references.");
    if (products.data.length || services.data.length || live.includes(url)) return;
    const result = await bucket.remove([businessId + "/" + suffix]);
    if (result.error) throw result.error;
  } catch {
    logEvent("agent_image_cleanup_failed", businessId, {}, "error");
  }
}
