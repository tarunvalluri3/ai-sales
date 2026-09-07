---
target: widget-settings page
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-09-07T20-21-30Z
slug: app-dashboard-dashboard-widget-settings
---
Method: dual-agent (A: design-review sub-agent · B: detector+browser sub-agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Pending states consistent; missing warning when a key has zero allowed origins (silently non-functional) |
| 2 | Match System / Real World | 3 | Real, platform-specific install copy; but only 5 platforms covered |
| 3 | User Control and Freedom | 2 | No undo/confirm for Revoke despite its live-breaking blast radius |
| 4 | Consistency and Standards | 3 | Strong token/pattern reuse; but two visually identical "Allowed origins" textareas serve different purposes, and one form skips the shared `EmptyState` component |
| 5 | Error Prevention | 2 | Origin format only validated server-side after submit; empty-origins failure mode has no proactive warning |
| 6 | Recognition Rather Than Recall | 2 | Page's own 5-step guide has no persistent "step done" indicator even though completion is detectable |
| 7 | Flexibility and Efficiency of Use | 2 | No bulk key actions, no key nicknames, no last-used timestamp to inform rotation decisions |
| 8 | Aesthetic and Minimalist Design | 2 | 8 equal-weight cards with no grouping; install guide re-expands in full on every visit |
| 9 | Error Recovery | 3 | Errors surface in plain language near the control; origin-format error is technically worded |
| 10 | Help and Documentation | 3 | Genuinely good in-context, platform-specific install guide; capped at 5 platforms with no "other" path |
| **Total** | | **25/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment**: Content is specific, structure is generic. Copy is genuinely grounded in the product — exact platform menu paths in the install guide, precise rules for when a recommendation becomes a photo card vs. text, an explicit key-rotation workflow described in the page's own intro. But the composition is "generic settings page with cards stacked vertically": eight sibling sections (`page.tsx:42-70`) share an identical `rounded-ds-lg border border-ds-border bg-ds-surface p-5` shell and identical `text-lg font-semibold` headers, so nothing visually distinguishes an instructional card (install guide) from a status card (publish) from a configuration card (branding/capabilities). Section names ("Chat widget," "AI capabilities," "Branding & language") could belong to Intercom, Drift, or Crisp unchanged. A director's read: this looks assembled feature-by-feature rather than designed around the owner's actual task of "get my widget live and correctly configured."

**Deterministic scan**: `detect.mjs --json` against `app/(dashboard)/dashboard/widget-settings/` returned exit code 0 with zero findings across all 11 source files. No mechanical/generic-pattern violations (hardcoded non-token colors, banned utility patterns, etc.) were flagged. This is a genuine strength at the component-token level and is consistent with the LLM review's own observation that token/pattern usage is disciplined throughout. The detector's clean result and the LLM's structural findings are not in tension — the detector checks mechanical conventions, not information architecture, hierarchy, or interaction-risk calibration, which is exactly where this page's real issues live. No false positives to reconcile since there were no findings.

**Visual overlays**: Not available this run. The dev server responded with `HTTP/1.1 307` and `x-clerk-auth-status: signed-out`, redirecting to Clerk's hosted sign-in (confirmed via direct HTTP check, not fabricated), and no browser-automation tool was available in the assessment session to authenticate around it. No live-server injection or screenshots were attempted or claimed. Treat all layout/hierarchy findings above as derived from source-code reading (component structure, Tailwind classes, conditional rendering), not from a rendered screenshot.

## Overall Impression

Component-level craft is genuinely strong — role-gating, loading states, error handling, and design-token discipline are consistently well done, and the detector confirms zero mechanical violations. But the page reads as eight independently-built cards rather than one designed flow: the install guide narrates a 5-step sequence (copy snippet → paste → allow origins → publish → test) that the page's own DOM order directly contradicts, and the single highest-blast-radius action on the page — revoking a widget key, which immediately breaks a live embed on a real customer site — has less confirmation friction than deleting one FAQ document elsewhere in this same codebase. The biggest opportunity is bringing this page through the same critique→harden pass `/dashboard/knowledge` already went through: fix the sequencing/hierarchy problem and the revoke confirm-gate, and this becomes a genuinely strong page rather than a collection of well-built parts.

## What's Working

1. **Consistent, thorough role-gating.** Every mutating control across all 8 components checks `canEdit` and disables itself with a `ROLE_DENIED_TITLE` tooltip rather than silently hiding functionality (`ai-capabilities-form.tsx:138-139`, `publish-button.tsx:44-45`, `widget-branding-form.tsx:211-212`, `widget-key-list.tsx:92-93,103-104`). Easy to skip, wasn't skipped anywhere.
2. **Defensive form construction for real edge cases.** The hidden-input fallback for `appointmentSlotMinutes` when its checkbox is off (`ai-capabilities-form.tsx:113-118`), and the documented two-sibling-forms-with-`form=` pattern to avoid illegal nested `<form>`s (`widget-key-list.tsx:85-98`), both show real attention to details a less careful build would get subtly wrong.
3. **The platform-specific install guide content** (`widget-install-guide.tsx:14-62`) is genuinely useful, concrete copy naming real menu paths per platform (e.g. "Online Store → Themes… → Edit code" for Shopify) rather than a generic "add this script" instruction.

## Priority Issues

**[P0] Revoking a widget key has less confirmation friction than deleting one FAQ document, despite far higher blast radius.**
- **Why it matters**: `widget-key-list.tsx:99-109` submits Revoke on a single click with only red button styling as a warning — no `confirmMessage`, no modal, no undo. Revoking a key immediately breaks every live embed using it on a business's real website, per the page's own intro copy. Yet `DeleteButton`'s established two-step confirm pattern (`delete-button.tsx:24-29`) is already used elsewhere in this codebase for a lower-stakes action — unpublishing one knowledge document (`knowledge/page.tsx:161`). The risk/friction ratio is inverted.
- **Fix**: Reuse the existing confirm-gate pattern from `DeleteButton`/`PublishToggleButton` on the Revoke action, with copy naming the concrete consequence: "Any site using this key will stop getting chat responses immediately. Revoke anyway?"
- **Suggested command**: /impeccable harden

**[P0] The page's own documented 5-step setup workflow is contradicted by its actual section order.**
- **Why it matters**: `widget-install-guide.tsx` narrates Copy snippet → Paste → Allow origins → Publish → Test, but `page.tsx:42-70` renders Guide → Publish → Sandbox test → Create key → Key list (origins) → Branding → Questions → Capabilities. A first-time user following the guide's own instructions has to scroll past Publish and the test panel to reach the very steps (create a key, add an origin) the guide told them to do first.
- **Fix**: Reorder sections to match the guide's stated sequence (Guide → Create key → Key list/origins → Publish → Sandbox test → config sections), or make each guide step deep-link/scroll to its corresponding section.
- **Suggested command**: /impeccable layout

**[P1] No page-level hierarchy or grouping — 8 equal-weight cards force scanning the whole page to find what matters.**
- **Why it matters**: All sections share identical card styling and header weight (cognitive-load checklist fails: single focus, chunking, grouping, visual hierarchy). A returning user who just wants to add an origin to an existing key must scroll past 4-5 unrelated cards to get there.
- **Fix**: Group into labeled clusters ("Access & install," "Go live," "Customize") with a real visual break between clusters, and make settled/configured sections collapsible the way the install guide already is.
- **Suggested command**: /impeccable layout

**[P1] Install guide's platform picker offers 5 options with no path for the rest.**
- **Why it matters**: `widget-install-guide.tsx:14-62,117-131` hardcodes exactly HTML/WordPress/Shopify/Wix/Squarespace with no "other" fallback — violates the ≤4-choices guideline at a decision point and leaves any business on Webflow, Framer, Ghost, Carrd, Notion, etc. with zero tailored guidance.
- **Fix**: Trim to the ≤4 most common platforms plus an explicit "Other / custom site" tab reusing the existing generic HTML-snippet instructions (a relabel, not new content).
- **Suggested command**: /impeccable clarify

**[P2] Two visually identical "Allowed origins" textareas (create-key vs. edit-existing-key) risk confusion about which one to use.**
- **Why it matters**: `create-widget-key-form.tsx:21-31` and `widget-key-list.tsx:60-75` both render an identically-labeled, identically-styled textarea several cards apart — a user scanning for "where do I add my domain" has two visually indistinguishable candidates.
- **Fix**: Differentiate the create-form's label, e.g. "Allowed origins for this new key (optional — add later)."
- **Suggested command**: /impeccable clarify

## Persona Red Flags

**Alex (Power User)**: The install guide's `activeKey` picks the *first* non-revoked key in array order (`widget-install-guide.tsx:73`) with no selector — Alex managing 2+ live keys/sites can't tell the guide which one to show a snippet for and must abandon the guide to hunt through `WidgetKeyList` manually. No bulk key actions, no key nicknames (identified only by raw token + creation date), and no last-used timestamp — so before clicking the unguarded Revoke button, Alex has no data confirming the old key is actually safe to kill.

**Sam (Accessibility-Dependent User)**: `CopyKeyButton`'s success state swap (`copy-key-button.tsx:14-22`) has no `aria-live` region, unlike every other success/error state on the page (which consistently use `role="alert"`) — a screen-reader user gets no confirmation the copy worked. The accent-color swatch writes the paired text input's value via direct DOM mutation (`widget-branding-form.tsx:68-71`) rather than a controlled React update, which risks the change going unannounced to assistive tech tracking the text field's accessible value. And Revoke's total lack of a confirm step disproportionately harms anyone relying on assistive tech, where a misfired activation has no recovery step before the (live-breaking) consequence lands.

## Minor Observations

- `PublishButton` is actionable with zero widget keys created — clicking "Publish" "succeeds" in a state that serves nothing, with no guard tying publish-readiness to key existence.
- `SuggestedQuestionsForm`'s empty state (`suggested-questions-form.tsx:146-149`) is a bespoke paragraph rather than the shared `EmptyState` component `WidgetKeyList` uses on the same page.
- Reorder buttons in `suggested-questions-form.tsx:105-122` use plain Unicode ▲/▼ glyphs while `CopyKeyButton` uses SVG icons elsewhere on the same page — small visual-consistency mismatch.
- Dashboard-side date formatting (`widget-key-list.tsx:48-50`) hardcodes `en-US` regardless of the widget's own configured visitor-facing language — likely fine if the dashboard UI is always English, but worth confirming that's intentional.

## Questions to Consider

- If Revoke is meant to be a routine part of the documented key-rotation workflow, should it really carry *less* friction than every other irreversible, live-impacting action already hardened elsewhere in this codebase (`/dashboard/knowledge`'s delete/unpublish confirms)?
- The install guide's `activeKey` logic assumes exactly one "current" key matters — is running two simultaneously-active keys for two sites ever actually expected, and if so, shouldn't the one component whose job is "help you install" let you pick which one you're installing?
- `/dashboard/knowledge` recently went through a full critique → harden → clarify → distill → polish arc that fixed nearly identical issues (undifferentiated action weight, missing confirm gates, inconsistent empty-state components). Was Widget Settings deliberately left out of that pass, or is it simply next in line?
