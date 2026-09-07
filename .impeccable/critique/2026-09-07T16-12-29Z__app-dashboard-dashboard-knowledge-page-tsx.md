---
target: knowledge page
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-09-07T16-12-29Z
slug: app-dashboard-dashboard-knowledge-page-tsx
---
Method: dual-agent (A: ad83100a1b1fbba71 · B: a59e2cbfe3be213f0)

# Critique: Knowledge dashboard page

`app/(dashboard)/dashboard/knowledge/page.tsx` and its form/action components — the screen where a business owner manages the approved knowledge their AI sales employee draws on.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Ingestion pills exist but don't poll — a background pending→complete transition is invisible until the owner manually refreshes |
| 2 | Match System / Real World | 3 | Draft/Published and status pills map reasonably to the owner's mental model |
| 3 | User Control and Freedom | 1 | Delete fires immediately on click, no confirm, no undo — for content the AI is actively citing to prospects |
| 4 | Consistency and Standards | 3 | Action buttons share one consistent style, but the action row mixes text-links and pill badges with no grouping |
| 5 | Error Prevention | 1 | No confirmation before deleting or unpublishing live AI-facing content, and no warning about what it's currently powering |
| 6 | Recognition Rather Than Recall | 2 | The ingestion failure reason lives only in a `title` tooltip — invisible on touch, easy to miss on desktop |
| 7 | Flexibility and Efficiency | 2 | No bulk actions, no filter/search as the list grows |
| 8 | Aesthetic and Minimalist Design | 3 | Individual rows are dense but not cluttered |
| 9 | Error Recovery | 2 | Failed ingestion shows a pill + hidden tooltip + bare "Retry" link, no actionable explanation of what went wrong |
| 10 | Help and Documentation | 2 | No inline help on what "publish" actually does beyond one paragraph at the top |
| **Total** | | **22/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment**: This reads as a well-engineered but visually generic admin-CRUD screen. Nothing in typography, iconography, color, or layout signals "this is the memory of your AI salesperson." The only product-specific touch is the intro copy ("This is what your AI sales employee is allowed to know...") — a genuinely good line, but it sits on top of a stock rounded-card-plus-list-rows-plus-pill-badges pattern that any SaaS admin table uses. Strip the copy and this could be an inventory manager, a CMS post list, or a support-ticket queue.

**Deterministic scan**: `detect.mjs` returned exit code 0 with zero findings across `page.tsx`, `knowledge-form.tsx`, and `_components/`. No mechanical violations (spacing tokens, contrast, banned patterns) were flagged — the issues here are structural/IA, not mechanical, which the detector isn't built to catch. No false positives to report since nothing fired.

**Visual overlays**: Not available. No browser automation tool is exposed in this session and no dev server was confirmed running, so no live overlay could be injected. This is a source-level critique only.

## Overall Impression

The page is functionally solid and the copy shows real product thinking, but it's over-dense and under-protected: three parallel "add knowledge" entry points fight for attention before the owner has even looked at what they already have, and the two most consequential actions on the page — delete and unpublish — happen on a single unconfirmed click. The biggest opportunity is treating this page like what it actually is: the control surface for what a real employee is allowed to say to real prospects, not a generic records list.

## What's Working

- **The framing copy** (page.tsx:54-56) correctly sets stakes ("this is what your AI is allowed to know") instead of a bland "Manage Knowledge" header — rare for this pattern.
- **Consistent action-button styling** across the five action components (retry, refresh, extract, publish, delete) gives the row a coherent visual language even though the row itself is crowded.
- **The ingestion status model** (pending/processing/complete/failed via `ingestion-status-pill.tsx`) is a sensible, consistently-applied state machine — the underlying logic is sound even where its presentation isn't.

## Priority Issues

**[P0] No confirmation before delete or unpublish**
- Why it matters: these actions remove content the AI is live-quoting to prospects right now. One accidental click has real, customer-facing consequences with no undo.
- Fix: add a confirm step before delete and unpublish — at minimum a native confirm, ideally an inline "Are you sure?" affordance that also tells the owner what's at stake.
- Suggested command: /impeccable harden

**[P1] Ingestion failure reason is hidden in a hover tooltip**
- Why it matters: `ingestion_last_error` only surfaces via a `title` attribute (ingestion-status-pill.tsx:34) — invisible on touch devices, easy to miss on desktop. The owner can't self-diagnose a fixable URL/format problem and will file a support ticket instead.
- Fix: surface the error as visible text under the failed pill, or in an expandable row detail.
- Suggested command: /impeccable clarify

**[P1] Action row can expose up to 6 simultaneous controls**
- Why it matters: a failed, published URL document can show Retry, Refresh, Extract now, Publish/Unpublish, Edit, and Delete at once, all equal-weight text links — well past the 4-option cognitive-load threshold, with no primary action distinguished.
- Fix: consolidate into one primary action plus an overflow (kebab) menu for the secondary/diagnostic ones.
- Suggested command: /impeccable distill

**[P2] Three "add knowledge" forms open by default, side by side**
- Why it matters: manual entry, file upload, and URL import all render as equal-weight cards (page.tsx:136-159) before the owner has scanned what they already have — forces a three-way decision at the very start of the task, violating single-focus and progressive disclosure.
- Fix: collapse to tabs, or one "Add knowledge" entry point that reveals the method choice on demand.
- Suggested command: /impeccable layout

**[P3] No success confirmation beyond a badge color shift**
- Why it matters: publish, unpublish, and retry all resolve silently except for a pill/badge changing color — the "did it work?" moment goes unanswered at actions the owner should feel confident about.
- Fix: a brief toast or inline success confirmation on these actions.
- Suggested command: /impeccable polish

## Persona Red Flags

**Jordan (First-Timer)**: Lands on the page and hits three equally-weighted "add knowledge" cards before seeing any guidance on which to use first (page.tsx:136-159) — decision paralysis at the very first action. After submitting, gets only a "Processing queued" pill with no explanation of what that means or how long to wait. If ingestion fails, the pill turns red with a bare "Retry" link (retry-ingestion-button.tsx:30) and no indication of whether retrying will just fail again.

**Sam (Accessibility-Dependent)**: The failure reason carried in the `title` tooltip (ingestion-status-pill.tsx:34) is not reliably exposed to screen readers and is entirely unreachable on touch — a critical diagnostic is functionally invisible to this persona. Async actions announce failure after the fact but nothing announces a successful publish, so screen-reader users get confirmation of bad outcomes and silence on good ones.

## Minor Observations

- Content preview is `line-clamp-2` with no "view full document" affordance from the list itself (page.tsx:88) — requires a full navigation to the edit page just to read further.
- No summary count ("3 published / 2 drafts") at the top of the list.
- `refreshIntervalHours` on the URL-import form (url-import-form.tsx:44-58) has no unit-aware helper text — a raw number with no sense of what 1 vs 720 means.
- The edit page's raw chunk-text viewer (`[id]/edit/page.tsx:47-57`) looks like a debugging tool for engineers that leaked into a non-technical owner's UI, with no explanation of what it's for.

## Questions to Consider

1. Should this page really let delete/unpublish fire on one click while the AI is live-quoting that content to prospects, or does that need a hard stop before anything else here ships?
2. Is showing raw embedding chunks to a small-business owner actually useful, or is that internal tooling that shouldn't be customer-facing?
3. If manual entry, file upload, and URL import all matter equally, why force a three-way choice before the owner has even seen what they already have?
</content>
