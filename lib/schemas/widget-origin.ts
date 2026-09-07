import { z } from "zod";

export const originSchema = z.string().trim().refine(
  (value) => {
    try {
      return new URL(value).origin === value;
    } catch {
      return false;
    }
  },
  { message: "Enter just your website's address, like https://example.com (not https://example.com/page or a trailing slash)." },
);

/** Parses the newline/comma-separated origins textarea into a deduped, validated list. Empty input is valid (zero origins) -- the key just fails closed until one is added. */
export function parseOrigins(raw: string): { origins?: string[]; error?: string } {
  const candidates = raw
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const unique = [...new Set(candidates)];
  for (const candidate of unique) {
    const parsed = originSchema.safeParse(candidate);
    if (!parsed.success) {
      return { error: `"${candidate}" is not a valid origin. ${parsed.error.issues[0]?.message ?? ""}` };
    }
  }

  return { origins: unique };
}
