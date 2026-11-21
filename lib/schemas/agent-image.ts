import { z } from "zod";

export const MAX_AGENT_IMAGE_BYTES = 2 * 1024 * 1024;
const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type AgentImagePurpose = "products" | "avatar";
type ImageType = keyof typeof extensions;

export const agentImageSchema = z.file().min(1).max(MAX_AGENT_IMAGE_BYTES)
  .mime(["image/jpeg", "image/png", "image/webp"]);

export function detectAgentImageType(bytes: Uint8Array): ImageType | null {
  const matches = (signature: number[], offset = 0) =>
    signature.every((byte, index) => bytes[offset + index] === byte);
  if (matches([255, 216, 255])) return "image/jpeg";
  if (matches([137, 80, 78, 71, 13, 10, 26, 10])) return "image/png";
  if (matches([82, 73, 70, 70]) && matches([87, 69, 66, 80], 8) &&
      (matches([86, 80, 56, 32], 12) || matches([86, 80, 56, 76], 12) || matches([86, 80, 56, 88], 12))) {
    return "image/webp";
  }
  return null;
}

export function agentImagePath(businessId: string, purpose: AgentImagePurpose, id: string, type: ImageType) {
  return [z.uuid().parse(businessId), purpose, z.uuid().parse(id) + "." + extensions[type]].join("/");
}
