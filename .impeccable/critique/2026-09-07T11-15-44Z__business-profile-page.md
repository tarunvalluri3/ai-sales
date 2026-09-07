---
target: business profile page
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-07T11-15-44Z
slug: business-profile-page
---
Method: dual-agent (A: design-review sub-agent · B: detector/browser-evidence sub-agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Success message lacks `aria-live`/`role="status"` — error has `role="alert"`, success doesn't (asymmetric). |
| 2 | Match System / Real World | 4 | Plain-language labels; subtitle correctly frames the form around a real outcome. |
| 3 | User Control and Freedom | 2 | No cancel/reset on the edit form — only a page reload backs out of an in-progress edit. |
| 4 | Consistency and Standards | 3 | Read-only branch hand-rolls its own `<dl>` instead of reusing the shared `PermissionNotice` component used on `widget-settings`. |
| 5 | Error Prevention | 4 | Delete gated by exact-name match, disabled client-side *and* re-checked server-side — real defense in depth. |
| 6 | Recognition Rather Than Recall | 4 | Delete confirmation shows the exact required string right above the input. |
| 7 | Flexibility and Efficiency | 2 | No inline/as-you-type validation, no autosave — errors surface only after a full submit round-trip. |
| 8 | Aesthetic and Minimalist Design | 3 | Danger zone renders fully expanded on every visit, adding baseline weight to routine edits. |
| 9 | Error Recovery | 2 | Only the first Zod issue is shown, in one line below all five fields, with no per-field `aria-invalid`/`aria-describedby`. |
| 10 | Help and Documentation | 3 | No tooltips, but danger-zone copy is self-documenting enough to substitute. |
| **Total** | | **30/40** | **Good** |

## Design Specificity Verdict

**LLM assessment**: Mostly generic, with one genuinely authored line carrying all the specificity. The field set itself — name, description, contact email/phone, website, plus a boilerplate export/delete "danger zone" — is the shape any SaaS settings page ships unchanged; nothing in the layout or interaction pattern signals "AI sales employee product." The exception is the subtitle, *"This is what your AI sales employee tells prospects about who you are"* (`page.tsx:26`) — verified against `lib/rag.ts`'s `formatBusinessProfileContext` (lines 112–119), where these exact fields are interpolated into the AI's system prompt. That's a well-earned, product-specific line doing real work, but it's isolated: nothing else on the page (no live preview of the resulting prompt block, no per-field "used in your AI's introduction" hint) reinforces or exploits that connection. Specific intent, generic execution.

**Deterministic scan**: `detect.mjs --json` against all three files returned `[]`, exit code 0 — zero mechanical findings. No false positives to reconcile since nothing fired.

**Visual overlays**: Not available this run — no browser automation tool is exposed in this session, so no live dev-server inspection, script injection, or on-page overlay was possible. This critique is source/markup-only; computed contrast, real focus-ring appearance, and actual screen-reader behavior are unverified.

## Overall Impression

The page is competently built and the one dangerous operation on it (business deletion) is genuinely well-guarded — type-the-exact-name, disabled-until-match, and an independent server-side re-check. But the page reads as a generic settings form wearing one good sentence of product specificity, and it structures itself so that a routine "update our phone number" visit ends every single time on a fully-armed, red-bordered delete button. The biggest opportunity: collapse the danger zone behind disclosure so the common case never sees it, and let the page's own promise — "this is what your AI tells prospects" — actually show up as something more than a subtitle.

## What's Working

1. **The delete confirmation is genuinely well-executed**, not just decorative: type-the-exact-name pattern, client-side disabled gating, and an independent server-side re-check explicitly commented as "the client's disabled-until-matching button is a UX nicety, not the real guard." This is the right way to gate an irreversible, multi-tenant-destructive action.
2. **The subtitle earns its place.** It ties the form directly to a verified real effect downstream (the AI's system prompt) rather than being decorative copy — rare for a settings page to make a true, specific claim about what filling in a field actually does.
3. **The read-only member gets full visibility, not a lockout.** Rather than hiding the page or showing a blocked state, non-admins see every field's value via a definition list — appropriate for a surface where even a read-only user needs to know what their AI is representing to prospects.

## Priority Issues

**[P1] Danger zone is never progressively disclosed**
- **Why it matters**: Both "Export your data" and the full delete-confirmation UI (label, input, submit button) render fully expanded at all times. Every routine visit to fix a phone number ends the scroll on a fully-armed destructive-action UI — a peak-end violation and a needless anxiety/visual-noise cost for the common case.
- **Fix**: Collapse the danger zone behind a closed-by-default disclosure (`<details>` or an explicit "Danger zone ▸" toggle), or require an intermediate "I want to delete this business" click before the confirm-name field and button render at all.
- **Suggested command**: `/impeccable layout`

**[P1] Validation surfaces only the first error, with no per-field attachment**
- **Why it matters**: `updateBusinessProfileAction` returns only the first Zod issue, rendered as one line below all five fields; no input carries `aria-invalid` or `aria-describedby`. A user who mistypes two fields fixes one, resubmits, and only then discovers the next problem. Screen-reader users get no indication of *which* control a message refers to at all.
- **Fix**: Report all validation issues at once, and wire each offending input to its own message via `aria-invalid="true"` + `aria-describedby`.
- **Suggested command**: `/impeccable harden`

**[P2] No grouping or heading within the profile form**
- **Why it matters**: Five fields render as one flat list with identical styling and no fieldset/legend or subheading — exceeding the ≤4-per-chunk guideline. The form section also has no `<h2>`, unlike both danger-zone sections, producing an inconsistent heading outline (h1 → *nothing* → h2 → h2) that makes a screen-reader user navigating by headings skip the entire edit form as if it weren't a distinct region.
- **Fix**: Add an `<h2>` for the profile-form section and split fields into "Identity" (name, description) and "Contact" (email, phone, website) subgroups.
- **Suggested command**: `/impeccable layout`

**[P2] Success feedback isn't announced to assistive tech**
- **Why it matters**: The error message has `role="alert"`; the success message doesn't have any `aria-live`/`role="status"`. A screen-reader user who successfully saves gets silence — indistinguishable from nothing having happened.
- **Fix**: Add `role="status"` (polite) to the success message.
- **Suggested command**: `/impeccable audit`

**[P3] Read-only view duplicates rather than reuses the shared "permission notice" pattern**
- **Why it matters**: `widget-settings` reuses a shared `PermissionNotice` component for non-editors; the profile page instead hand-rolls its own `<dl>` and differently-worded copy for the same "you can view, not edit" concept — a consistency gap and a maintenance fork across dashboard pages.
- **Fix**: Standardize on one component/copy for the read-only-member pattern across pages.
- **Suggested command**: `/impeccable polish`

## Persona Red Flags

**Alex (Power User)**: No autosave or inline validation forces a full submit-cycle to discover an error. No cancel/discard control to bail out of an in-progress edit short of reloading. No "last exported" timestamp, so Alex can't tell from the UI alone when data was last pulled.

**Sam (Accessibility-Dependent)**: Silent success state means no confirmation a save worked. Only-first-error reporting with no `aria-describedby` means Sam can't tell which of five fields is invalid without trial and error. The disabled delete button has no accompanying live-region text explaining *why* it's disabled when tabbed to before typing the confirmation name.

**Jordan (First-Timer / read-only member)**: The subtitle correctly renders for Jordan too, so the "what this is for" framing isn't lost. But Jordan's only path to a change is a bare instruction — "Ask your organization admin to make changes" — with no admin name, contact link, or request-access affordance. A dead end, not a next step.

## Minor Observations

- The phone placeholder (`+1 555 123 4567`) is US-shaped even though the validating regex is intentionally international — nothing hints other formats are accepted.
- `description` has a hard 500-character limit with no visible counter — a user pasting a longer paragraph loses the tail silently with no on-screen signal.
- Export and delete buttons are correctly differentiated by weight (outlined neutral vs. filled red) — a good, understated risk-signaling choice worth preserving if the danger zone is restructured.

## Questions to Consider

- What if the profile form showed a live preview of the exact "Business profile" block the AI actually receives — turning an abstract settings form into a direct view of "this is what your AI says," which the subtitle already promises but never shows?
- What if "Export your data" and "Delete this business" lived behind a single closed-by-default disclosure, so a routine profile edit never renders a live delete button at all?
- What if the read-only member view reused the exact same form markup as the editable one (fields simply non-interactive) instead of a separately maintained `<dl>`, removing the consistency fork entirely?
