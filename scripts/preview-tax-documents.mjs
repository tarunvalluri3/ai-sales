// Renders sample GST documents to PDF files so the layout can be looked at.
// Uses obviously fictional sample parties -- never the real supplier config
// and never the database -- so it is safe to run anywhere.
//
// Run: node scripts/preview-tax-documents.mjs <output-directory>
import { register } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

register("./alias-resolver-hooks.mjs", import.meta.url);

const { renderTaxDocumentPdf } = await import(new URL("../lib/invoice-pdf.ts", import.meta.url).href);

const outDir = process.argv[2];
if (!outDir) {
  console.error("usage: node scripts/preview-tax-documents.mjs <output-directory>");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const supplier = {
  name: "SAMPLE SUPPLIER (preview only)",
  address: "1 Sample Road, Sample Nagar, Hyderabad 500001",
  gstin: "36BYQPT2686E1ZR",
  stateName: "Telangana",
  stateCode: "36",
};

const base = {
  kind: "tax_invoice",
  isTest: false,
  number: "WAP/2026-27/0001",
  dateIso: "2026-10-21",
  issuedAtIso: "2026-10-21T10:00:00.000Z",
  original: null,
  reasonLabel: null,
  supplier,
  recipient: {
    name: "Sample Customer Pvt Ltd",
    address: "42 Example Street\nSomewhere Nagar\nBengaluru 560001",
    gstin: null,
    stateName: "Telangana",
    stateCode: "36",
  },
  placeOfSupply: { stateName: "Telangana", stateCode: "36" },
  description: "Waves AI Pilot Growth plan - monthly subscription (21 Oct 2026 to 20 Nov 2026)",
  sacCode: "998314",
  supply: "intra-state",
  gstRatePercent: 18,
  taxablePaise: 338_898,
  cgstPaise: 30_501,
  sgstPaise: 30_501,
  igstPaise: null,
  totalPaise: 399_900,
  paymentReference: "pay_SamplePayment0001",
  refundReference: null,
};

const longName = "The Extraordinarily Long-Named Sample Trading & Allied Services Private Limited (Formerly Known As Sample Traders)";
const longAddress =
  "Flat No. 1204, Tower C, Example Heights Apartments, Opposite The Very Large Sample Shopping Mall And Cinema Complex, Beside The Old Sample Railway Station Road, Kondapur Main Road, Hitech City Extension, Serilingampally Mandal, Ranga Reddy District, Hyderabad 500084\nLandmark: near the blue water tank\nAcSuperLongTokenWithNoSpacesAtAllToProveThatWrappingBreaksIt1234567890123456789012345678901234567890";

const samples = {
  "invoice-intra-state.pdf": base,
  "invoice-inter-state-gstin.pdf": {
    ...base,
    number: "WAP/2026-27/0002",
    recipient: {
      name: "Sample Buyer Industries Pvt Ltd",
      address: "9 Example Park, Andheri East, Mumbai 400093",
      gstin: "27AAPFU0939F1ZV",
      stateName: "Maharashtra",
      stateCode: "27",
    },
    placeOfSupply: { stateName: "Maharashtra", stateCode: "27" },
    supply: "inter-state",
    cgstPaise: null,
    sgstPaise: null,
    igstPaise: 61_002,
  },
  "invoice-long-name-and-address.pdf": {
    ...base,
    number: "WAP/2026-27/0003",
    recipient: { ...base.recipient, name: longName, address: longAddress },
    description: `${base.description} - and a deliberately long description to prove the line item wraps inside its column instead of running into the SAC code beside it`,
  },
  "invoice-scale-annual-large-amount.pdf": {
    ...base,
    number: "WAP/2026-27/0004",
    description: "Waves AI Pilot Scale plan - annual subscription (21 Oct 2026 to 20 Oct 2027)",
    taxablePaise: 8_473_730 + 0,
    cgstPaise: 762_635 - 1 + 0,
    sgstPaise: 762_635 + 0,
    totalPaise: 9_999_000,
  },
  "invoice-test-mode.pdf": { ...base, isTest: true, number: "TST/2026-27/0001" },
  "credit-note-partial.pdf": {
    ...base,
    kind: "credit_note",
    number: "WAC/2026-27/0001",
    dateIso: "2026-10-25",
    original: { number: "WAP/2026-27/0001", dateIso: "2026-10-21" },
    reasonLabel: "Duplicate or incorrect charge",
    taxablePaise: 84_746,
    cgstPaise: 7_627,
    sgstPaise: 7_627,
    totalPaise: 100_000,
    refundReference: "rfnd_SampleRefund0001",
  },
};

for (const [file, view] of Object.entries(samples)) {
  const bytes = await renderTaxDocumentPdf(view);
  writeFileSync(path.join(outDir, file), bytes);
  console.log(file, bytes.length, "bytes");
}
