---
target: widget-settings page
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-09-08T07-28-33Z
slug: app-dashboard-dashboard-widget-settings
---
Method: dual-agent (A: design-review sub-agent · B: detector+browser sub-agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Create/update key forms never reset after success — no clear "done" moment, invites accidental duplicate submits |
| 2 | Match System / Real World | 4 | "Origins," platform-specific paste locations, key-rotation language all map to how an owner actually thinks about this |
| 3 | User Control and Freedom | 2 | Collapsing a Customize card silently discards unsaved edits in uncontrolled fields — a real, newly-introduced data-loss path |
| 4 | Consistency and Standards | 2 | The 4 new collapse-toggle buttons are the only interactive elements on the page with no `focus-visible` outline |
| 5 | Error Prevention | 2 | Nothing prevents the collapse/data-loss trap or a double-submitted Create Key form |
| 6 | Recognition Rather Than Recall | 3 | Snippet/key/instructions all visible together; undercut slightly by unpredictable toggle-button accessible names |
| 7 | Flexibility and Efficiency of Use | 3 | Collapse lets a returning admin hide finished sections; platform picker stays within the ≤4 choice limit |
| 8 | Aesthetic and Minimalist Design | 3 | Numbered 1/2/3 scaffold reads clearly; Branding card still surfaces 7 fields at once when open |
| 9 | Error Recovery | 3 | Error copy is specific and actionable; nothing explains a collapse-triggered silent revert, because the product doesn't know it can happen |
| 10 | Help and Documentation | 4 | The install guide doubles as genuinely good, platform-specific, honestly-gated help |
| **Total** | | **29/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment**: Grounded, not generic. The copy is specifically tied to this product's real workflow — key-rotation guidance in the intro, platform-specific install steps with real menu paths, AI-capabilities copy describing actual chaining behavior. The step-completion badges added in the last pass are tied to real server-observable state (an active key exists, an origin is set, `published_at` is non-null) and explicitly decline to fake a signal for steps 2 and 5 where none exists — genuine anti-fabrication discipline applied to UI, not just AI output.

**Deterministic scan**: `detect.mjs --json` returned exit code 0, zero findings across the widget-settings directory. The new collapsible-toggle pattern (`type="button"` inside a `<form>`) and the new "✓ Done" badges (plain text, not color-only) were manually cross-checked against detector rule intent and found clean — no false negative apparent. No false positives to reconcile since nothing was flagged.

**Visual overlays**: Not available this run — the local dev server was not running at all (`localhost:3000` refused every connection, confirmed via `curl` and `Get-NetTCPConnection`), a harder block than the expected Clerk-auth redirect. All findings below come from source-code reading, not a rendered screenshot.

## Overall Impression

Real, measurable improvement since the last pass — 25/40 → 29/40 — and the two highest-stakes actions on the page (Revoke, Publish) are both genuinely well-handled: explicit consequences, honest state labeling, safe-to-repeat framing. But the fix pass's own headline feature, making the Customize cards collapsible to reduce density, introduces a new problem more serious than what it solved: collapsing a card unmounts its uncontrolled fields, so a user who edits several fields and then collapses the card (an easy, large click target sitting right above those fields) loses that input silently. The four new collapse-toggle buttons are also the only interactive elements on the page missing the codebase's standard focus-visible treatment. Both are net-new regressions from the collapse feature itself, not carryover debt.

## What's Working

1. **Honest, non-fabricated step-completion badges** — the install guide explicitly declines to fake a "done" signal for steps 2 and 5 where no server-side signal exists, and the three badges it does show are each tied to real state (`step1Done`/`step3Done`/`step4Done`). Directly consistent with this product's own no-fabrication principle, applied to UI copy.
2. **Widget-key card information density** — the combined "Created … · Revoked … · Last used …" line is compact, correctly conditional, and gives an admin real signal for whether a key is safe to revoke, directly serving the page's own documented rotation workflow.
3. **Revoke and Publish are both genuinely well-supported emotional moments** — Revoke's confirm step names the exact consequence ("Any site using this key will stop getting chat responses immediately"), and Publish clearly separates Draft/Live with reassurance that re-publishing is safe.

## Priority Issues

**[P0] Collapsing a Customize card silently discards unsaved edits in uncontrolled fields.**
- **Why it matters**: All three Customize cards unmount their body on collapse (`{open ? (<>...</>) : null}`). Several fields are uncontrolled (`defaultValue`/`defaultChecked`): `logoUrl`, `position`, `language`, `ctaText`, both welcome-text fields in the branding form, plus `recommendProductsEnabled` and `appointmentSlotMinutes` in AI Capabilities. The collapse toggle is a large click target sitting directly above these fields — an admin who edits several fields, then clicks the header (to re-read the description, or by habit) and reopens the card, gets their edits silently reverted with zero warning. This is a genuine data-loss path introduced by the collapse feature itself.
- **Fix**: Either lift these fields to controlled state (matching how `accentColor` already is), or don't unmount on collapse — use `hidden` + CSS instead of a conditional render, so the DOM nodes and their live values survive.
- **Suggested command**: `/impeccable harden`

**[P1] Collapse-toggle buttons have no visible focus indicator.**
- **Why it matters**: The four new collapse buttons are the only interactive elements on this page without the `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent` classes every other button here carries. A keyboard-only or low-vision user loses visible focus tracking the instant they reach any of these four toggles.
- **Fix**: Add the same focus-visible classes already used everywhere else in this file set.
- **Suggested command**: `/impeccable audit`

**[P1] Collapse-toggle buttons' accessible name includes the entire description paragraph.**
- **Why it matters**: Each toggle wraps both the title and the full descriptive sentence inside one interactive element, so a screen reader announces the whole concatenated string every time focus lands there — a long, unpredictable announcement that trains screen-reader users to skip past (and potentially miss) real content.
- **Fix**: Move the description paragraph outside the `<button>`, leaving only the title + Hide/Show indicator inside it.
- **Suggested command**: `/impeccable audit`

**[P2] Create/update widget key forms never reset after success.**
- **Why it matters**: `CreateWidgetKeyForm` shows "Key created." but leaves the nickname/origins fields populated with no reset and no post-success disable — a user unsure whether the click registered (the button looks unchanged) may click Create again and silently create a duplicate key.
- **Fix**: Reset the form (or clear state) on `state.success`, and/or briefly disable the submit button post-success.
- **Suggested command**: `/impeccable harden`

**[P3] Inconsistent nickname field labeling between create and edit.**
- **Why it matters**: The create form's label includes an example ("Nickname (optional, e.g. 'Marketing site')"); the edit form's is bare ("Nickname"). Minor, purely cosmetic inconsistency.
- **Fix**: Reuse the same label string in both places.
- **Suggested command**: `/impeccable clarify`

## Persona Red Flags

**Alex (Power User)**: Hits the P0 collapse/data-loss bug hardest — exactly the profile who edits several fields quickly, then collapses a finished section to scan the rest of the page, and won't notice a silent revert until a later visit shows the old value. Also the most likely to hit the P2 duplicate-key risk when rotating several keys back-to-back.

**Sam (Accessibility)**: Directly hit by both P1 findings — no focus ring on any of the four new collapse controls disorients keyboard navigation on a page that otherwise respects focus-visible everywhere, and the verbose/unpredictable accessible names on those same buttons make screen-reader navigation worse specifically because of this pass's new UI, not preexisting debt.

## Minor Observations

- `CopyKeyButton` puts `aria-live="polite"` directly on the `<button>` rather than a dedicated status region — functional, but re-announces the whole button (including its icon) on state change rather than just the label swap.
- The numbered "1. / 2. / 3." section scaffold is unique to this page among dashboard pages checked — likely intentional given this page's sequential, wizard-like nature, but worth confirming it's not accidental drift from sibling settings pages' visual language.
- The accent-color text input's `pattern` attribute has no inline validation message; a malformed hex only surfaces after submit via the server-side error.
- The AI Capabilities hidden `appointmentSlotMinutes` fallback compounds with the P0 bug: toggling appointments on, changing the slot length, then collapsing/reopening loses the typed length (reverts to the initial value) while the checkbox itself (controlled) survives — an inconsistent partial-revert that would be confusing to debug.

## Questions to Consider

- If the whole point of making these cards collapsible was to reduce density on a page that scored partly on that problem, why does every card default to open? First-time load is identical in density to before the fix pass — the feature only pays off on a second visit, and even then at real risk of costing the user their edits.
- Does the generic "3. Customize" label do real information-architecture work, or is it just a container for whatever wasn't "setup" or "publish"? Would a returning user actually think "I need to change my launcher CTA text" and know to look there?
- The Publish card doesn't cross-reference a key's own "no allowed origins" warning — could an admin plausibly see "Published / Live" and a key card's origin warning at the same time without the page connecting the two for them?
