/**
 * Presentational-only redesign of the on-demand AI sales brief -- takes
 * the exact same `{ header, narrative }` strings `generateSalesBrief()`
 * (lib/copilot.ts) has always returned and turns them into a scannable,
 * structured block instead of two raw `<pre>` dumps. Does not call the
 * server action, does not touch prompt/generation logic, does not change
 * what data is available -- purely how the same two strings are parsed
 * and laid out. Parsing is defensive: `generateSalesBrief()`'s prompt
 * fixes the section headings ("Conversation:", "What happened:",
 * "Risk:", "Recommended next step:") and the header's line shape, so
 * this recognizes them by name rather than by position -- and falls back
 * to the raw text untouched if the model ever doesn't follow the
 * template, so a format drift degrades gracefully instead of rendering
 * broken UI.
 */

import { TriangleAlert } from "lucide-react";

const NARRATIVE_SECTION_LABELS = ["Conversation:", "What happened:", "Risk:", "Recommended next step:"] as const;

type ParsedHeader = {
  status: string | null;
  interestedIn: string | null;
};

/** Only the two header facts not already shown at the top of the card (name/channel/score/qualification) -- avoids repeating information the card already states. */
function parseBriefHeader(header: string): ParsedHeader {
  const lines = header.split("\n");

  const statusLine = lines.find((line) => line.startsWith("Status: "));
  const status = statusLine?.slice("Status: ".length).trim() ?? null;

  const interestedInIndex = lines.findIndex((line) => line.trim() === "Interested in:");
  const interestedIn = interestedInIndex >= 0 ? (lines[interestedInIndex + 1]?.trim() ?? null) : null;

  return {
    status: status && status !== "—" ? status : null,
    interestedIn: interestedIn && interestedIn !== "Not specified" ? interestedIn : null,
  };
}

type ParsedNarrative = {
  matched: boolean;
  whyThisMatters: string | null;
  whatHappened: string[];
  risk: string | null;
  recommendedNextStep: string | null;
  raw: string;
};

function parseBriefNarrative(narrative: string): ParsedNarrative {
  const lines = narrative.split("\n");
  const sections = new Map<(typeof NARRATIVE_SECTION_LABELS)[number], string[]>();
  let current: (typeof NARRATIVE_SECTION_LABELS)[number] | null = null;
  let matched = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const label = NARRATIVE_SECTION_LABELS.find((candidate) => candidate.toLowerCase() === line.toLowerCase());
    if (label) {
      current = label;
      sections.set(current, []);
      matched = true;
      continue;
    }
    if (current && line.length > 0) {
      sections.get(current)?.push(line);
    }
  }

  if (!matched) {
    return { matched: false, whyThisMatters: null, whatHappened: [], risk: null, recommendedNextStep: null, raw: narrative };
  }

  const whatHappened = (sections.get("What happened:") ?? []).map((line) => line.replace(/^[-•]\s*/, ""));

  return {
    matched: true,
    whyThisMatters: (sections.get("Conversation:") ?? []).join(" ") || null,
    whatHappened,
    risk: (sections.get("Risk:") ?? []).join(" ") || null,
    recommendedNextStep: (sections.get("Recommended next step:") ?? []).join(" ") || null,
    raw: narrative,
  };
}

export function SalesBrief({ header, narrative }: { header: string; narrative: string }) {
  const { status, interestedIn } = parseBriefHeader(header);
  const parsed = parseBriefNarrative(narrative);

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-3 rounded-xl bg-ds-warning-bg px-4 py-2 text-sm text-ds-text-primary">
        <TriangleAlert className="size-5 shrink-0 text-ds-warning" strokeWidth={1.75} aria-hidden="true" />
        AI-generated · May be inaccurate · Not verified
      </p>

      {status || interestedIn ? (
        <dl className="grid grid-cols-2 gap-4 rounded-xl bg-ds-surface-soft px-4 py-3">
          {status ? (
            <div className="flex flex-col">
              <dt className="text-sm text-ds-text-secondary">Status</dt>
              <dd className="text-sm font-medium text-ds-text-primary capitalize">{status}</dd>
            </div>
          ) : null}
          {interestedIn ? (
            <div className={`flex flex-col ${status ? "border-l border-ds-border-strong pl-4" : ""}`}>
              <dt className="text-sm text-ds-text-secondary">Interested in</dt>
              <dd className="text-sm font-medium text-ds-text-primary">{interestedIn}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {parsed.matched ? (
        <div className="flex flex-col gap-4">
          {parsed.whyThisMatters ? (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium text-ds-text-primary">Why this matters</h3>
              <p className="text-sm leading-relaxed text-ds-text-primary">{parsed.whyThisMatters}</p>
            </div>
          ) : null}

          {parsed.whatHappened.length > 0 ? (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium text-ds-text-primary">What happened</h3>
              <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm leading-relaxed text-ds-text-primary">
                {parsed.whatHappened.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {parsed.risk ? (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium text-ds-text-primary">Risk</h3>
              <p className="text-sm leading-relaxed text-ds-text-primary">{parsed.risk}</p>
            </div>
          ) : null}

          {parsed.recommendedNextStep ? (
            <div className="flex flex-col gap-1 rounded-xl bg-ds-surface-soft p-4">
              <h3 className="text-sm font-medium text-ds-text-primary">Recommended next step</h3>
              <p className="text-sm leading-relaxed text-ds-text-primary">{parsed.recommendedNextStep}</p>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ds-text-primary">{parsed.raw}</p>
      )}
    </div>
  );
}
