import { z } from "zod";

/** Shared Zod fields for manually authored knowledge documents. */

export const knowledgeTitleSchema = z
  .string()
  .trim()
  .min(1, "Enter a title.")
  .max(200, "Title must be 200 characters or fewer.");

export const knowledgeContentSchema = z
  .string()
  .trim()
  .min(1, "Enter some content.")
  .max(20000, "Content must be 20,000 characters or fewer.");
