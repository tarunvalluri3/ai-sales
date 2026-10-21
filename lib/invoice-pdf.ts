import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { GEIST_REGULAR_TTF, GEIST_SEMIBOLD_TTF } from "@/lib/invoice-pdf-fonts";
import { formatIsoDate, formatPaiseAmount, paiseInWords, RUPEE_SIGN } from "@/lib/invoice-format";
import { CREDIT_NOTE_REASON_LABEL, type CreditNoteRow, type InvoiceRow } from "@/lib/invoice-core";
import { unsupportedInvoiceCharacters } from "@/lib/invoice-text";

/**
 * Renders a GST tax invoice or credit note as a PDF, on demand, from the
 * snapshot stored when it was issued (Phase 17c). Pure of I/O and NOT
 * "server-only": the download route, the email sender, the preview script
 * and the tests all call `renderTaxDocumentPdf`.
 *
 * **One source of truth, nothing to keep in sync.** Nothing is stored but
 * the immutable row. The PDF is a pure function of it, with the creation
 * date pinned to the document's own issue time and no random ids, so the
 * same invoice renders to the same bytes years later -- even if the
 * customer has since renamed itself or changed state, because the row holds
 * the details as they were.
 *
 * **Library: pdf-lib.** Pure JavaScript with no native module, no
 * filesystem read and no headless browser, so it behaves identically in a
 * Vercel serverless function, in CI and in a local script. (The headless
 * Chromium this repo already bundles for page rendering would be a
 * 50 MB cold start for a one-page document.) It has no layout engine, so
 * the small amount of layout an invoice needs -- columns, wrapping, page
 * breaks -- is written out below, where it can be read and tested.
 *
 * **Font: Geist, embedded** (lib/invoice-pdf-fonts.ts), because the standard
 * PDF fonts cannot show the rupee sign and an invoice that prints
 * "Rs." or a box for it is wrong. The glyph coverage of every character the
 * customer may type is asserted in scripts/run-invoice-tests.mjs.
 */

/** Everything the layout prints, flattened from either kind of stored row. */
export type TaxDocumentView = {
  kind: "tax_invoice" | "credit_note";
  /** A document for a Razorpay TEST-mode payment: stamped, and never a tax document. */
  isTest: boolean;
  number: string;
  /** ISO date, IST. */
  dateIso: string;
  issuedAtIso: string;
  original: { number: string; dateIso: string } | null;
  reasonLabel: string | null;
  supplier: { name: string; address: string; gstin: string; stateName: string; stateCode: string };
  recipient: { name: string; address: string; gstin: string | null; stateName: string; stateCode: string };
  placeOfSupply: { stateName: string; stateCode: string };
  description: string;
  sacCode: string;
  supply: "intra-state" | "inter-state";
  gstRatePercent: number;
  taxablePaise: number;
  cgstPaise: number | null;
  sgstPaise: number | null;
  igstPaise: number | null;
  totalPaise: number;
  paymentReference: string;
  refundReference: string | null;
};

export function invoiceToView(row: InvoiceRow): TaxDocumentView {
  return {
    kind: "tax_invoice",
    isTest: row.is_test,
    number: row.invoice_number,
    dateIso: row.invoice_date,
    issuedAtIso: row.issued_at,
    original: null,
    reasonLabel: null,
    supplier: {
      name: row.supplier_name,
      address: row.supplier_address,
      gstin: row.supplier_gstin,
      stateName: row.supplier_state_name,
      stateCode: row.supplier_state_code,
    },
    recipient: {
      name: row.customer_name,
      address: row.customer_address,
      gstin: row.customer_gstin,
      stateName: row.customer_state_name,
      stateCode: row.customer_state_code,
    },
    placeOfSupply: { stateName: row.place_of_supply_state_name, stateCode: row.place_of_supply_state_code },
    description: row.service_description,
    sacCode: row.sac_code,
    supply: row.supply_type,
    gstRatePercent: row.gst_rate_percent,
    taxablePaise: row.taxable_paise,
    cgstPaise: row.cgst_paise,
    sgstPaise: row.sgst_paise,
    igstPaise: row.igst_paise,
    totalPaise: row.total_paise,
    paymentReference: row.razorpay_payment_id,
    refundReference: null,
  };
}

export function creditNoteToView(row: CreditNoteRow): TaxDocumentView {
  return {
    kind: "credit_note",
    isTest: row.is_test,
    number: row.credit_note_number,
    dateIso: row.credit_note_date,
    issuedAtIso: row.issued_at,
    original: { number: row.original_invoice_number, dateIso: row.original_invoice_date },
    reasonLabel: CREDIT_NOTE_REASON_LABEL[row.reason],
    supplier: {
      name: row.supplier_name,
      address: row.supplier_address,
      gstin: row.supplier_gstin,
      stateName: row.supplier_state_name,
      stateCode: row.supplier_state_code,
    },
    recipient: {
      name: row.customer_name,
      address: row.customer_address,
      gstin: row.customer_gstin,
      stateName: row.customer_state_name,
      stateCode: row.customer_state_code,
    },
    placeOfSupply: { stateName: row.place_of_supply_state_name, stateCode: row.place_of_supply_state_code },
    description: row.service_description,
    sacCode: row.sac_code,
    supply: row.supply_type,
    gstRatePercent: row.gst_rate_percent,
    taxablePaise: row.taxable_paise,
    cgstPaise: row.cgst_paise,
    sgstPaise: row.sgst_paise,
    igstPaise: row.igst_paise,
    totalPaise: row.total_paise,
    paymentReference: row.razorpay_payment_id,
    refundReference: row.razorpay_refund_id,
  };
}

/* ------------------------------------------------------------------ *
 * Text measurement and wrapping
 * ------------------------------------------------------------------ */

/**
 * Wraps `text` to `maxWidth` points. Honours explicit newlines (an address
 * is several lines), breaks at spaces, and -- the case that otherwise
 * overflows the page -- breaks a single word that is wider than the column
 * (a 60-character token with no spaces) character by character.
 */
export function wrapText(text: string, font: Pick<PDFFont, "widthOfTextAtSize">, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(" ").filter((word) => word !== "");
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line === "" ? word : `${line} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line !== "") {
        out.push(line);
        line = "";
      }
      // The word alone is too wide for a line: split it by characters.
      let chunk = "";
      for (const char of word) {
        if (chunk !== "" && font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
          out.push(chunk);
          chunk = char;
        } else {
          chunk += char;
        }
      }
      line = chunk;
    }
    if (line !== "") out.push(line);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 46;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const BOTTOM_LIMIT = MARGIN + 28; // room for the page footer

const INK = rgb(0.09, 0.082, 0.059);
const TEST_RED = rgb(0.7, 0.1, 0.1);
const MUTED = rgb(0.42, 0.396, 0.345);
const RULE = rgb(0.84, 0.82, 0.76);
const BAND = rgb(0.965, 0.949, 0.91);

type Fonts = { regular: PDFFont; semibold: PDFFont };

class Flow {
  pdf: PDFDocument;
  fonts: Fonts;
  page: PDFPage;
  y: number;
  pageCount = 1;

  constructor(pdf: PDFDocument, fonts: Fonts) {
    this.pdf = pdf;
    this.fonts = fonts;
    this.page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  /** Starts a new page unless `height` points still fit above the footer. */
  ensure(height: number): void {
    if (this.y - height >= BOTTOM_LIMIT) return;
    this.page = this.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pageCount += 1;
    this.y = PAGE_HEIGHT - MARGIN;
  }

  text(
    value: string,
    x: number,
    options: { size: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: "left" | "right"; width?: number },
  ): void {
    const font = options.bold ? this.fonts.semibold : this.fonts.regular;
    const drawX =
      options.align === "right" && options.width !== undefined
        ? x + options.width - font.widthOfTextAtSize(value, options.size)
        : x;
    this.page.drawText(value, { x: drawX, y: this.y - options.size, size: options.size, font, color: options.color ?? INK });
  }

  rule(color = RULE, thickness = 0.6): void {
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: PAGE_WIDTH - MARGIN, y: this.y }, thickness, color });
  }
}

const LEADING = 1.38;

function lineHeight(size: number): number {
  return size * LEADING;
}

/** Draws wrapped lines at the current y inside a column and returns the height used. */
function drawColumn(
  flow: Flow,
  lines: Array<{ text: string; size: number; bold?: boolean; color?: ReturnType<typeof rgb> }>,
  x: number,
  width: number,
): number {
  const startY = flow.y;
  let used = 0;
  for (const entry of lines) {
    const font = entry.bold ? flow.fonts.semibold : flow.fonts.regular;
    for (const wrapped of wrapText(entry.text, font, entry.size, width)) {
      flow.page.drawText(wrapped, {
        x,
        y: startY - used - entry.size,
        size: entry.size,
        font,
        color: entry.color ?? INK,
      });
      used += lineHeight(entry.size);
    }
  }
  return used;
}

/** The height a column of lines will take, without drawing it. */
function measureColumn(
  flow: Flow,
  lines: Array<{ text: string; size: number; bold?: boolean }>,
  width: number,
): number {
  let used = 0;
  for (const entry of lines) {
    const font = entry.bold ? flow.fonts.semibold : flow.fonts.regular;
    used += wrapText(entry.text, font, entry.size, width).length * lineHeight(entry.size);
  }
  return used;
}

function money(paise: number): string {
  return `${RUPEE_SIGN}${formatPaiseAmount(paise)}`;
}

function halfRateLabel(ratePercent: number): string {
  const half = ratePercent / 2;
  return Number.isInteger(half) ? String(half) : half.toFixed(1);
}

/**
 * Refuses text the embedded font has no glyph for. Everything the customer
 * can type is held to lib/invoice-text.ts's allow-list when it is entered
 * and when the invoice is built, so this should be unreachable -- it exists
 * so that, if it ever is reached, the failure is a thrown error and not an
 * empty box printed on a legal document.
 */
export function assertPrintable(view: TaxDocumentView): void {
  const texts = [
    view.number, view.description, view.sacCode, view.reasonLabel ?? "",
    view.supplier.name, view.supplier.address, view.supplier.gstin, view.supplier.stateName,
    view.recipient.name, view.recipient.address, view.recipient.gstin ?? "", view.recipient.stateName,
    view.placeOfSupply.stateName, view.paymentReference, view.refundReference ?? "",
    view.original?.number ?? "",
  ];
  const bad = texts.flatMap((text) => unsupportedInvoiceCharacters(text));
  if (bad.length > 0) {
    throw new Error(`invoice-pdf: refusing to print characters the font cannot draw: ${[...new Set(bad)].join(" ")}`);
  }
}

/** Renders the document. Returns the PDF bytes. */
export async function renderTaxDocumentPdf(view: TaxDocumentView): Promise<Uint8Array> {
  assertPrintable(view);
  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.registerFontkit(fontkit);

  const regular = await pdf.embedFont(GEIST_REGULAR_TTF, { subset: true });
  const semibold = await pdf.embedFont(GEIST_SEMIBOLD_TTF, { subset: true });
  const fonts: Fonts = { regular, semibold };

  const isCredit = view.kind === "credit_note";
  const title = view.isTest ? (isCredit ? "Test Credit Note" : "Test Invoice") : isCredit ? "Credit Note" : "Tax Invoice";
  const issuedAt = new Date(view.issuedAtIso);

  pdf.setTitle(`${title} ${view.number}`);
  pdf.setAuthor(view.supplier.name);
  pdf.setSubject(`${title} for ${view.recipient.name}`);
  pdf.setCreator(view.supplier.name);
  pdf.setProducer("Waves AI Pilot");
  pdf.setCreationDate(issuedAt);
  pdf.setModificationDate(issuedAt);

  const flow = new Flow(pdf, fonts);

  /* ---- Title and document identity ---- */
  flow.text(title, MARGIN, { size: 22, bold: true });
  const identityX = PAGE_WIDTH - MARGIN - 210;
  const identity = [
    { label: isCredit ? "Credit note no." : "Invoice no.", value: view.number },
    { label: isCredit ? "Credit note date" : "Invoice date", value: formatIsoDate(view.dateIso) },
  ];
  let identityY = flow.y;
  for (const item of identity) {
    flow.page.drawText(item.label, { x: identityX, y: identityY - 9, size: 8.5, font: regular, color: MUTED });
    const valueWidth = semibold.widthOfTextAtSize(item.value, 10.5);
    flow.page.drawText(item.value, {
      x: PAGE_WIDTH - MARGIN - valueWidth,
      y: identityY - 10,
      size: 10.5,
      font: semibold,
      color: INK,
    });
    identityY -= 17;
  }
  flow.y -= 46;
  flow.rule(INK, 1);
  flow.y -= 16;

  /* ---- Test-mode stamp: such a document must never pass for a tax document ---- */
  if (view.isTest) {
    const stamp = "TEST DOCUMENT - NOT A TAX INVOICE. Issued for a test-mode payment: nothing was supplied and no GST is payable on it.";
    const stampLines = wrapText(stamp, semibold, 9, CONTENT_WIDTH - 20);
    const stampHeight = stampLines.length * lineHeight(9) + 14;
    flow.page.drawRectangle({
      x: MARGIN,
      y: flow.y - stampHeight,
      width: CONTENT_WIDTH,
      height: stampHeight,
      borderColor: TEST_RED,
      borderWidth: 1.2,
      color: rgb(1, 0.95, 0.95),
    });
    stampLines.forEach((line, index) => {
      flow.page.drawText(line, {
        x: MARGIN + 10,
        y: flow.y - 7 - 9 - index * lineHeight(9),
        size: 9,
        font: semibold,
        color: TEST_RED,
      });
    });
    flow.y -= stampHeight + 14;
  }

  /* ---- Supplier and recipient ---- */
  const gap = 24;
  const columnWidth = (CONTENT_WIDTH - gap) / 2;
  const supplierLines = [
    { text: "SUPPLIER", size: 7.5, bold: true, color: MUTED },
    { text: view.supplier.name, size: 11, bold: true },
    { text: view.supplier.address, size: 9 },
    { text: `GSTIN: ${view.supplier.gstin}`, size: 9 },
    { text: `State: ${view.supplier.stateName} (code ${view.supplier.stateCode})`, size: 9 },
  ];
  const recipientLines = [
    { text: isCredit ? "CREDITED TO" : "BILL TO", size: 7.5, bold: true, color: MUTED },
    { text: view.recipient.name, size: 11, bold: true },
    { text: view.recipient.address, size: 9 },
    ...(view.recipient.gstin ? [{ text: `GSTIN: ${view.recipient.gstin}`, size: 9 }] : []),
    { text: `State: ${view.recipient.stateName} (code ${view.recipient.stateCode})`, size: 9 },
  ];
  const blockHeight = Math.max(
    measureColumn(flow, supplierLines, columnWidth),
    measureColumn(flow, recipientLines, columnWidth),
  );
  flow.ensure(blockHeight + 60);
  drawColumn(flow, supplierLines, MARGIN, columnWidth);
  drawColumn(flow, recipientLines, MARGIN + columnWidth + gap, columnWidth);
  flow.y -= blockHeight + 10;

  /* ---- Place of supply, reverse charge, references ---- */
  flow.rule();
  flow.y -= 10;
  const referenceLines: Array<{ text: string; size: number; bold?: boolean; color?: ReturnType<typeof rgb> }> = [
    { text: `Place of supply: ${view.placeOfSupply.stateName} (code ${view.placeOfSupply.stateCode})`, size: 9 },
    { text: "Reverse charge: No", size: 9 },
  ];
  if (view.original) {
    referenceLines.push({
      text: `Against Tax Invoice no. ${view.original.number} dated ${formatIsoDate(view.original.dateIso)}`,
      size: 9,
      bold: true,
    });
  }
  if (view.reasonLabel) referenceLines.push({ text: `Reason: ${view.reasonLabel}`, size: 9 });
  referenceLines.push({
    text: `Payment reference: ${view.paymentReference}${view.refundReference ? `   Refund reference: ${view.refundReference}` : ""}`,
    size: 8.5,
    color: MUTED,
  });
  const referenceHeight = measureColumn(flow, referenceLines, CONTENT_WIDTH);
  flow.ensure(referenceHeight + 20);
  flow.y -= drawColumn(flow, referenceLines, MARGIN, CONTENT_WIDTH);
  flow.y -= 12;

  /* ---- The line item ---- */
  const sacWidth = 70;
  const amountWidth = 118;
  const descriptionWidth = CONTENT_WIDTH - sacWidth - amountWidth - 24;
  const descriptionLines = wrapText(view.description, regular, 9.5, descriptionWidth);
  const rowHeight = Math.max(descriptionLines.length * lineHeight(9.5), lineHeight(9.5)) + 14;
  flow.ensure(rowHeight + 24 + 160);

  const headerTop = flow.y;
  flow.page.drawRectangle({ x: MARGIN, y: headerTop - 22, width: CONTENT_WIDTH, height: 22, color: BAND });
  const headerBaseline = headerTop - 15;
  flow.page.drawText("Description of service", { x: MARGIN + 8, y: headerBaseline, size: 8.5, font: semibold, color: INK });
  flow.page.drawText("SAC", { x: MARGIN + 8 + descriptionWidth + 12, y: headerBaseline, size: 8.5, font: semibold, color: INK });
  const amountHeader = isCredit ? "Taxable value credited" : "Taxable value";
  flow.page.drawText(amountHeader, {
    x: PAGE_WIDTH - MARGIN - 8 - semibold.widthOfTextAtSize(amountHeader, 8.5),
    y: headerBaseline,
    size: 8.5,
    font: semibold,
    color: INK,
  });
  flow.y = headerTop - 22 - 8;

  let descY = flow.y;
  for (const line of descriptionLines) {
    flow.page.drawText(line, { x: MARGIN + 8, y: descY - 9.5, size: 9.5, font: regular, color: INK });
    descY -= lineHeight(9.5);
  }
  flow.page.drawText(view.sacCode, { x: MARGIN + 8 + descriptionWidth + 12, y: flow.y - 9.5, size: 9.5, font: regular, color: INK });
  const taxableText = money(view.taxablePaise);
  flow.page.drawText(taxableText, {
    x: PAGE_WIDTH - MARGIN - 8 - regular.widthOfTextAtSize(taxableText, 9.5),
    y: flow.y - 9.5,
    size: 9.5,
    font: regular,
    color: INK,
  });
  flow.y -= rowHeight - 8;
  flow.rule();
  flow.y -= 14;

  /* ---- Totals ---- */
  const totalsWidth = 250;
  const totalsX = PAGE_WIDTH - MARGIN - totalsWidth;
  const rows: Array<{ label: string; value: string }> = [{ label: "Taxable value", value: money(view.taxablePaise) }];
  if (view.supply === "intra-state") {
    const half = halfRateLabel(view.gstRatePercent);
    rows.push({ label: `CGST @ ${half}%`, value: money(view.cgstPaise ?? 0) });
    rows.push({ label: `SGST @ ${half}%`, value: money(view.sgstPaise ?? 0) });
  } else {
    rows.push({ label: `IGST @ ${view.gstRatePercent}%`, value: money(view.igstPaise ?? 0) });
  }
  flow.ensure(rows.length * 18 + 40 + 70);
  for (const row of rows) {
    flow.text(row.label, totalsX, { size: 9.5, color: MUTED });
    flow.text(row.value, totalsX, { size: 9.5, align: "right", width: totalsWidth });
    flow.y -= 18;
  }
  flow.page.drawLine({
    start: { x: totalsX, y: flow.y - 1 },
    end: { x: PAGE_WIDTH - MARGIN, y: flow.y - 1 },
    thickness: 0.8,
    color: INK,
  });
  flow.y -= 9;
  flow.text(isCredit ? "Total credited" : "Total", totalsX, { size: 12, bold: true });
  flow.text(money(view.totalPaise), totalsX, { size: 12, bold: true, align: "right", width: totalsWidth });
  flow.y -= 26;

  /* ---- Amount in words and the closing line ---- */
  const wordsLines = wrapText(`Amount in words: ${paiseInWords(view.totalPaise)}`, regular, 9.5, CONTENT_WIDTH);
  flow.ensure(wordsLines.length * lineHeight(9.5) + 60);
  for (const line of wordsLines) {
    flow.text(line, MARGIN, { size: 9.5 });
    flow.y -= lineHeight(9.5);
  }
  flow.y -= 12;
  flow.rule();
  flow.y -= 10;
  flow.text(
    `This is a computer-generated ${isCredit ? "credit note" : "invoice"} and does not require a signature.`,
    MARGIN,
    { size: 8.5, color: MUTED },
  );

  /* ---- Page footers ---- */
  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    const footer = `${view.supplier.name}   |   GSTIN ${view.supplier.gstin}   |   ${view.number}   |   Page ${index + 1} of ${pages.length}`;
    const width = regular.widthOfTextAtSize(footer, 7.5);
    page.drawText(footer, { x: (PAGE_WIDTH - width) / 2, y: MARGIN - 6, size: 7.5, font: regular, color: MUTED });
  });

  return pdf.save();
}
