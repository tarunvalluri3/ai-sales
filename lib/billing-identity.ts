import { z } from "zod";
import { isIndianStateCode } from "@/lib/india-states";
import { gstinProblemMessage, validateGstin } from "@/lib/gstin";
import { ADDRESS_MAX_LINES, normalizeInvoiceText, unsupportedInvoiceCharacters } from "@/lib/invoice-text";

/**
 * The customer's billing identity -- name, address, state, optional GSTIN --
 * validated once, here, for every place it is accepted (checkout, plan
 * change, the billing-details form). Phase 17c. Pure and NOT "server-only".
 *
 * **Why so strict.** These four values are printed on a legal document that
 * can never be edited afterwards. So the check digit of a GSTIN is verified
 * (lib/gstin.ts), a GSTIN must agree with the chosen state, and the text may
 * only contain characters the invoice font can print
 * (lib/invoice-text.ts). A typo is cheap to fix at this form and impossible
 * to fix on an issued invoice.
 *
 * **Changes apply to FUTURE invoices only.** Nothing that stores the result
 * of this validation touches an issued invoice -- which is immutable in the
 * database, not merely by convention -- so renaming the business or moving
 * state here can never alter a document already issued.
 */

export type BillingIdentity = {
  /** The name to bill, as it should appear on the invoice. */
  name: string;
  /** Multi-line postal address. */
  address: string;
  /** GST state code -- the place of supply. */
  stateCode: string;
  /** Optional: a registered business customer's GSTIN, upper-cased and verified. */
  gstin: string | null;
};

const NAME_MAX = 200;
const ADDRESS_MIN = 10;
const ADDRESS_MAX = 600;

function printableOrIssue(value: string, label: string, ctx: z.RefinementCtx): void {
  const bad = unsupportedInvoiceCharacters(value);
  if (bad.length > 0) {
    ctx.addIssue({
      code: "custom",
      message: `${label} can only use English (Roman-script) letters, digits and common punctuation, because it is printed on a tax invoice that cannot be edited later. Please replace: ${bad.slice(0, 6).join(" ")}`,
    });
  }
}

export const billingIdentitySchema = z
  .object({
    name: z
      .string()
      .transform((value) => normalizeInvoiceText(value, { multiline: false }))
      .superRefine((value, ctx) => {
        if (value.length < 2) ctx.addIssue({ code: "custom", message: "Enter the name to put on your invoices." });
        else if (value.length > NAME_MAX) ctx.addIssue({ code: "custom", message: "That billing name is too long." });
        else printableOrIssue(value, "The billing name", ctx);
      }),
    address: z
      .string()
      .transform((value) => normalizeInvoiceText(value, { multiline: true }))
      .superRefine((value, ctx) => {
        if (value.length < ADDRESS_MIN) {
          ctx.addIssue({ code: "custom", message: "Enter your full billing address, including city and PIN code." });
        } else if (value.length > ADDRESS_MAX) {
          ctx.addIssue({ code: "custom", message: "That billing address is too long (600 characters at most)." });
        } else if (value.split("\n").length > ADDRESS_MAX_LINES) {
          ctx.addIssue({ code: "custom", message: `Please fit your billing address on ${ADDRESS_MAX_LINES} lines or fewer.` });
        } else printableOrIssue(value, "The billing address", ctx);
      }),
    stateCode: z.string().refine(isIndianStateCode, "Select your state."),
    gstin: z.string().trim(),
  })
  .superRefine((value, ctx) => {
    if (value.gstin === "") return;
    const checked = validateGstin(value.gstin, value.stateCode);
    if (!checked.ok) ctx.addIssue({ code: "custom", path: ["gstin"], message: gstinProblemMessage(checked.problem) });
  })
  .transform(
    (value): BillingIdentity => ({
      name: value.name,
      address: value.address,
      stateCode: value.stateCode,
      gstin: value.gstin === "" ? null : value.gstin.trim().toUpperCase(),
    }),
  );

/** Parses the billing-details fields of a submitted form. The first problem becomes the message. */
export function parseBillingIdentityForm(
  formData: FormData,
): { ok: true; identity: BillingIdentity } | { ok: false; error: string } {
  const parsed = billingIdentitySchema.safeParse({
    name: formData.get("billingName") ?? "",
    address: formData.get("billingAddress") ?? "",
    stateCode: formData.get("stateCode") ?? "",
    gstin: formData.get("gstin") ?? "",
  });
  if (parsed.success) return { ok: true, identity: parsed.data };
  return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your billing details and try again." };
}
