---
target: leads page
total_score: 19
max_score: 36
na_heuristics: 10
p0_count: 2
p1_count: 1
timestamp: 2026-09-08T21-16-05Z
slug: app-dashboard-dashboard-leads-page-tsx
---
Method: dual-agent (A: general-purpose · B: general-purpose)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Status select disables while pending, but a successful save gives no confirmation — only an error path is visible (status-select.tsx:31-46) |
| 2 | Match System / Real World | 3 | Plain-language labels throughout; reads naturally |
| 3 | User Control and Freedom | 1 | Status change auto-submits on `onChange` with zero friction and no undo (status-select.tsx:33) |
| 4 | Consistency and Standards | 2 | Card pattern is bespoke to this page and lacks the tab/filter mechanism the sibling Conversations page uses for the same "which items need attention" problem |
| 5 | Error Prevention | 2 | Server-side Zod validation is solid, but no confirmation before a destructive-feeling transition like "lost" |
| 6 | Recognition Rather Than Recall | 3 | All lead info sits in the card, no click-through needed for basics |
| 7 | Flexibility and Efficiency | 0 | No filter, sort, search, or bulk action exists on the one page an agent works daily to triage |
| 8 | Aesthetic and Minimalist Design | 3 | Cards are uncluttered individually, but `qualification_reason` and `notes` share identical visual weight with no truncation |
| 9 | Error Recovery | 2 | Error surfaces inline (`role="alert"`) but with a generic message and no differentiated retry guidance |
| 10 | Help and Documentation | n/a | Reasonable for an internal admin list; the qualification `title` tooltip is a fine minimal substitute |
| **Total** | | **19/36** | **Poor (53%)** |

Renormalized to 36 (heuristic 10 scored n/a). 53% lands in the Acceptable-to-Poor boundary — closer to Poor because the two failing heuristics (3 and 7) are exactly the ones a daily-use triage tool depends on.

## Design Specificity Verdict

**LLM assessment**: Mostly a generic bordered-card CRM list — the container shape is interchangeable with the Conversations page next to it, and would work unchanged for tickets, orders, or any other row-per-record list. What *is* specific: the AI-disclaimer copy ("qualification is an AI-generated signal, not verified truth"), the qualification badge's `title` tooltip, and the honest "no longer available" fallback when a matched product/service was since deleted (page.tsx:22-26). Those are real domain thought. But the page is missing the one thing that would make it feel authored for *lead triage specifically*: the Conversations page one click away already solved "which of these need attention" with a tabbed "Needs attention / All" split and arrow-key tab navigation (conversations-list.tsx:118-171) — Leads has no equivalent, despite being arguably the higher-stakes surface.

**Deterministic scan**: `detect.mjs` ran clean — exit code 0, zero findings across `page.tsx`, `status-select.tsx`, and `state-views.tsx`. No hardcoded colors (every color class uses the `ds-*` token prefix), no duplicate/typo classNames, no missing `aria-label`s. Manual structural pass on top of the detector found two touch-target gaps: the status `<select>` at status-select.tsx:34 renders at roughly 30-32px tall, and the "View conversation" link at page.tsx:90-95 has no vertical padding, giving it a ~20px tap target — both below the 44x44pt guideline. No false positives to report since the detector returned nothing.

**Visual overlays**: Not available this run — no dev server was running, and the page sits behind Clerk auth plus a per-tenant business-context lookup, so a live authenticated walkthrough wasn't practical. Both assessments worked from source and Tailwind class inspection instead of a rendered screenshot.

## Overall Impression

The page is honest and safe — it never lies about AI uncertainty and never shows stale data as fact — but it's built for a world where a business has three leads, not three hundred. The single biggest opportunity is closing the gap with its own sibling page: Conversations already has the filter/tab pattern this page needs, so this isn't a new pattern to invent, just one to extend.

## What's Working

- **Honest AI-uncertainty handling**: the qualification badge always pairs its color with a text label and a `title="AI-assessed signal -- not verified"` tooltip (page.tsx:70-75), and the page-level copy repeats the same warning (page.tsx:48-50) — this is the PRODUCT.md rule ("qualification... must never be the sole gate... human must always be able to override") actually showing up in the UI, not just the schema.
- **Graceful stale-reference handling**: when a lead's matched product/service has since been deleted, the page says "no longer available" instead of a dangling ID or a silently wrong name (page.tsx:84), with the reasoning documented inline.
- **Server-enforced, UI-reflected permissions**: `StatusSelect` disables and explains itself (`title={canEdit ? undefined : ROLE_DENIED_TITLE}`) for viewers who lack edit rights (status-select.tsx:31-32) rather than showing a control that would fail silently on submit.

## Priority Issues

**[P0] No filter, sort, or search on the primary daily-use list**
Why it matters: A sales agent triaging leads has no way to isolate "new" from "converted"/"lost" without scanning the entire list top to bottom — this is a working-memory failure the moment the list passes a dozen rows, and it gets worse every day leads accumulate.
Fix: Add a status filter (reuse the Conversations page's tab pattern: "Needs attention"-equivalent default view vs. "All"), and default-sort by status/recency rather than raw fetch order.
Suggested command: /impeccable layout

**[P0] Status changes auto-submit instantly with no confirmation and no undo**
Why it matters: `onChange` calls `requestSubmit()` immediately (status-select.tsx:33) on a business-critical field (moving a lead to "converted" or "lost"). A misclick has real consequences and there's no toast confirming success, no undo, and the only visible feedback path is the error span.
Fix: Add a success toast/inline confirmation on save, and consider a lightweight confirm step specifically for the "lost" transition since it's the one that's hard to walk back mentally even though the data itself is editable.
Suggested command: /impeccable harden

**[P1] `qualification_reason` and `notes` render as unbounded, equal-weight plain text**
Why it matters: both lines use near-identical `text-sm`/muted-color styling with no truncation (page.tsx:86-87) — a long AI-generated reason or a long human note stretches every card and breaks scan rhythm. It also blurs the AI-vs-human distinction the rest of the page is otherwise careful about: two sentences of untrusted AI output and trusted human notes sit at the same visual weight, with nothing but proximity separating them.
Fix: Clamp both fields with an expand affordance (the Conversations list already does this — see `truncate` classes at conversations-list.tsx:282-288), and give the AI reason a distinct visual treatment (icon, label, or quote styling) so it reads as clearly separate from human-authored notes.
Suggested command: /impeccable clarify

**[P2] No bulk actions for repetitive per-lead status updates**
Why it matters: An agent processing many leads in one sitting repeats the exact same single-select interaction, and each change triggers a full `revalidatePath` (actions.ts:49) — there's no way to batch-move several stale "new" leads to "contacted" at once.
Fix: Add row selection plus a bulk-status toolbar for the common batch transitions.
Suggested command: /impeccable optimize

**[P3] Touch targets below 44x44pt on two interactive elements**
Why it matters: the status `<select>` (~30-32px tall, status-select.tsx:34) and the "View conversation" link (~20px tap area, page.tsx:90-95) are both undersized for comfortable mobile/touch use.
Fix: Increase vertical padding on both to reach the 44px minimum.
Suggested command: /impeccable adapt

## Persona Red Flags

**Alex (Power User / sales agent)**: No sort/filter/search exists anywhere in the file, and no bulk status update — confirmed absent by direct comparison with the Conversations page, which has both a tabbed filter and arrow-key tab navigation. Every single status change triggers a full server round-trip and page revalidate, which will feel sluggish when working through a long queue. High risk of Alex just not using this page and asking for a CSV export instead.

**Sam (Accessibility-dependent)**: `StatusSelect` does the right things — `aria-label="Lead status"` and consistent `focus-visible` rings across every interactive element in these files. But the qualification badge conveys its "how much do I trust this?" nuance partly through a `title` attribute (page.tsx:71), which isn't reliably exposed by screen readers on hover-only trigger and has no `aria-describedby` link tying it to the page-level disclaimer. Each lead is a bare `<li>`/`<p>` with no heading, so a screen-reader user can't jump lead-to-lead via heading navigation — they must tab through every field of every card sequentially.

**Riley (Stress tester)**: A long `qualification_reason` or `notes` value stretches its card indefinitely — no `line-clamp`, no `max-h`, no truncate, unlike every text line in the Conversations list which explicitly truncates. There's no pagination or virtualization visible in `page.tsx`, so a business with hundreds of leads gets one enormous, unbounded list.

## Minor Observations

- The header sentence fuses the lead count with the full AI-disclaimer clause into one dense, run-on line (page.tsx:48-50) — consider splitting count and disclaimer visually.
- Status text is title-cased via a CSS `capitalize` class rather than a display-label map (status-select.tsx:34,37) — functionally fine, but couples display casing to styling rather than data.
- `Source: {lead.source ?? "—"}` renders as raw text with no badge styling (page.tsx:89), inconsistent with how the Conversations page treats its similar tag-like metadata.

## Questions to Consider

- If Leads is the page agents use "daily to triage" (per PRODUCT.md's own workflow description), why does it currently have less interactivity than the Conversations page one click away?
- Does showing the AI's `qualification_reason` at the same visual weight as human-written `notes` actually satisfy "AI output is untrusted," or does one disclaimer sentence at the top of the page just get skimmed past on lead #40?
- What does this page look like at 500 leads with no pagination — is that a real near-term scenario for this product, or premature to solve now?
