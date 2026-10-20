import "server-only";
import { getAppUrl } from "@/lib/app-url";

/**
 * One branded shell for every email this app sends, replacing the
 * plain-text-only bodies each sender previously built by hand.
 *
 * Design constraints that drove the markup, none of them arbitrary:
 *
 * - **Tables and inline styles only.** Outlook renders through Word's HTML
 *   engine: no flexbox, no grid, no `<style>` block worth relying on.
 * - **A fluid 100%-wide table capped at 560px, plus an Outlook-only "ghost"
 *   table.** A fixed `width="560"` table forces its parent cell to 560px
 *   and overflows every phone -- `max-width` cannot clamp a table inside an
 *   auto-sized cell. Outlook ignores `max-width` entirely, so the
 *   `<!--[if mso]>` wrapper gives it the fixed width it needs instead.
 * - **The mark is the only image; the name is live text.** Most clients
 *   block remote images by default, and a header that is entirely an image
 *   shows a business a blank box. The lime mark degrades to its `alt` text
 *   and the wordmark keeps rendering either way.
 * - **Light ground, not the product's charcoal.** Several clients force
 *   their own dark-mode inversion on dark email bodies and do it badly.
 *   The logo system already defines an on-light tone for exactly this, and
 *   that is the mark PNG referenced here.
 * - **Every interpolated value is escaped.** Business names, lead names and
 *   appointment labels are all user- or prospect-supplied and reach these
 *   templates verbatim.
 */

const MARK_URL_PATH = "/brand/waves-ai-pilot-email-mark.png";

// From the logo system's on-light tone and the app's own --ds-* tokens.
const INK = "#17150f";
const MUTED = "#6b6558";
const LIME = "#d7f24e";
const PAPER = "#f6f2e8";
const CARD = "#ffffff";
const RULE = "#e3dccb";

export type BrandedEmail = { html: string; text: string };

export type BrandedEmailOptions = {
  /** The <h1>. Plain text -- escaped here. */
  heading: string;
  /** Body paragraphs, in order. Plain text -- escaped here. */
  paragraphs?: string[];
  /** Label/value rows, rendered as a bordered block. Plain text -- escaped here. */
  facts?: { label: string; value: string }[];
  /** The one action this email wants. `url` must already be absolute. */
  cta?: { label: string; url: string };
  /**
   * Small print under the rule. Use it to say who the mail is really from
   * when the recipient is a prospect rather than the business itself.
   */
  footnote?: string;
  /**
   * White-label the header for mail that speaks *for* a customer business
   * to that business's own prospect. The header then shows the business's
   * name as plain text in place of the Waves AI Pilot mark and wordmark --
   * the same rule the chat widget already follows (it shows the customer's
   * logo, never ours). Waves is still disclosed, in the footnote, so the
   * prospect is never misled about who actually sent it.
   */
  senderName?: string;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderBrandedEmail(options: BrandedEmailOptions): BrandedEmail {
  const { heading, paragraphs = [], facts = [], cta, footnote, senderName } = options;
  const markUrl = `${getAppUrl()}${MARK_URL_PATH}`;

  const paragraphHtml = paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${INK};">${escapeHtml(text)}</p>`,
    )
    .join("");

  const factsHtml = facts.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;border:1px solid ${RULE};border-radius:8px;">
         ${facts
           .map(
             (fact, index) => `<tr>
             <td style="padding:10px 14px;font-size:13px;color:${MUTED};width:38%;${index ? `border-top:1px solid ${RULE};` : ""}">${escapeHtml(fact.label)}</td>
             <td style="padding:10px 14px;font-size:14px;color:${INK};font-weight:500;${index ? `border-top:1px solid ${RULE};` : ""}">${escapeHtml(fact.value)}</td>
           </tr>`,
           )
           .join("")}
       </table>`
    : "";

  // A padded anchor rather than a VML button: it degrades to a square
  // block in Outlook instead of breaking, and needs no conditional markup.
  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
         <tr><td style="background:${LIME};border-radius:6px;">
           <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:${INK};text-decoration:none;">${escapeHtml(cta.label)}</a>
         </td></tr>
       </table>`
    : "";

  const footnoteHtml = footnote
    ? `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid ${RULE};font-size:12px;line-height:1.5;color:${MUTED};">${escapeHtml(footnote)}</p>`
    : "";

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAPER};">
    <tr><td align="center" style="padding:32px 16px;">
      <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" align="center"><tr><td><![endif]-->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;">
        <tr><td style="padding:0 0 20px;">${
          senderName
            ? `<span style="font-family:Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;letter-spacing:-0.015em;color:${INK};">${escapeHtml(senderName)}</span>`
            : `<img src="${escapeHtml(markUrl)}" width="34" height="25" alt="Waves AI Pilot" style="vertical-align:middle;border:0;">
          <span style="vertical-align:middle;margin-left:9px;font-family:Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;letter-spacing:-0.015em;">
            <span style="font-weight:600;color:${INK};">Waves</span><span style="font-weight:400;color:${MUTED};"> AI Pilot</span>
          </span>`
        }
        </td></tr>
        <tr><td style="background:${CARD};border:1px solid ${RULE};border-radius:12px;padding:28px 28px 24px;font-family:Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;font-weight:600;color:${INK};">${escapeHtml(heading)}</h1>
          ${paragraphHtml}
          ${factsHtml}
          ${ctaHtml}
          ${footnoteHtml}
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body></html>`;

  const textParts = [heading, ""];
  if (paragraphs.length) textParts.push(...paragraphs, "");
  if (facts.length) {
    textParts.push(...facts.map((fact) => `- ${fact.label}: ${fact.value}`), "");
  }
  if (cta) textParts.push(`${cta.label}: ${cta.url}`, "");
  if (footnote) textParts.push(footnote);

  return { html, text: textParts.join("\n").trimEnd() };
}
