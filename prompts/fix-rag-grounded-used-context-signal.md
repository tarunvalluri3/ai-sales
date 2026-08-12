# Fix: `grounded` should mean "the answer used retrieved context," not "context was retrieved"

## Goal

After this is implemented, `askSalesEmployee()`'s `grounded` field is true only when the model's answer actually drew on the retrieved knowledge chunks — not merely when the retriever happened to find at least one chunk. Test 7 from `prompts/phase-9-gemini-sales-employee.md` (a general-knowledge question, correctly declined) currently shows `grounded: true` with source chunk IDs displayed, which misrepresents an undecided/declined answer as data-backed. This closes that gap.

## Current phase

Phase 9 — Gemini AI Sales Employee (already implemented and pending the user's manual verification). This is a small, scoped follow-up fix discovered during that manual testing, per `STATE.md` §1/§3.

## User request

During Phase 9 manual testing, the user found that Test 7 (a general-knowledge question, e.g. "what's the capital of France?", correctly declined per the persona) still displayed "Grounded in retrieved knowledge" with source chunk IDs shown, even though the answer explicitly said the information wasn't available. `grounded` was computed purely from "did the retriever return ≥1 document," not from whether the model's answer actually used that context. The user chose option (b) from the two proposed fixes: add a model-self-reported `usedContext: boolean` to the structured-output schema, distinct from whether retrieval found chunks at all, and asked for this as its own small follow-up prompt with a manual test plan that explicitly re-runs Test 7 to confirm the fix, not just assumes it from the schema change existing.

## Skills and docs read

- `STATE.md` — current phase, Phase 9's implementation details.
- `AGENTS.md` — prompt-first workflow (this change touches the AI pipeline's response schema and system prompt, so it is not trivial-change-exempt even though it's small — `AGENTS.md` §5's exemption explicitly excludes "AI pipeline, prompt, or retrieval change").
- `docs/security.md` §8 — AI output is untrusted input; `usedContext` is being added to the same self-reported, non-authorizing category as the existing `escalate`/`escalationReason` fields, not a new trust boundary.
- `docs/architecture.md`'s "AI orchestration: retrieval-to-generation pipeline (Phases 8-9)" section — describes the current `grounded` semantics this fix corrects.

## Existing code inspected

- `lib/rag.ts` — `SalesEmployeeResponseSchema` (Zod: `answer`, `escalate`, `escalationReason`); `askSalesEmployee()` currently sets `grounded: true` unconditionally on the "chunks were retrieved" branch (i.e. whenever `documents.length > 0`), independent of anything the model returns. The zero-chunk hard bypass (`documents.length === 0` → `FALLBACK_MESSAGE`, `grounded: false`, no model call) is untouched by this fix — that guarantee stays exactly as-is.
- `app/dashboard/ai-test/actions.ts`/`ask-form.tsx` — the only current consumer of `grounded`; `ask-form.tsx` renders "Grounded in retrieved knowledge." vs. "No matching knowledge -- fallback response." based on it.

## Relevant existing architecture

- `escalate`/`escalationReason` already establish the precedent this fix follows: a model-self-reported boolean signal, validated by the response schema, used only for display/UI purposes, never for tenant scoping or authorization (`docs/security.md` §8).
- The zero-chunk hard bypass (Phase 8, preserved through Phase 9) remains the actual anti-fabrication guarantee — this fix only changes the signal for the "chunks were retrieved, model was invoked" branch, not that guarantee.

## Decisions and assumptions

1. **Field name stays `grounded`; its definition changes, not its name.** `grounded` becomes `documents.length > 0 && result.usedContext` instead of just `documents.length > 0`. The only current consumer (`ask-form.tsx`) already treats `grounded` as "should I show this as backed by real data" — fixing the definition to actually mean that is a smaller, equally correct change versus renaming the field and updating every call site for no added clarity.
2. **`usedContext` is model-self-reported via the same `withStructuredOutput()` call already in place** — no second model call, no extra latency. It is added as a new field on `SalesEmployeeResponseSchema`, described clearly enough that the model can reliably distinguish "I used the reference context to answer" from "I received context but declined/didn't need it" (e.g. the category-4 fallback text, or a persona-restriction decline like the competitor/general-knowledge cases).
3. **`usedContext` is trusted at the same level as `escalate`** — a UI/debug signal only, never used for tenant scoping, authorization, or any decision with real-world effect. If the model mis-reports it, the failure mode is a wrong badge in an internal test tool, not a security or data-isolation issue.
4. **The zero-chunk hard bypass is untouched.** That path never calls the model and returns `grounded: false` unconditionally, exactly as today — `usedContext` isn't relevant there.
5. **No change to `escalate`/`escalationReason` behavior or to the system prompt's persona/escalation instructions** — only the addition of the `usedContext` instruction and field.

## Open decisions this depends on

None.

## Dependencies / packages required

None new.

## Files likely to change

- `lib/rag.ts` — `SalesEmployeeResponseSchema` gains `usedContext: z.boolean()`; `SYSTEM_TEMPLATE` gains an instruction defining it; `askSalesEmployee()`'s grounded-branch return value changes from `grounded: true` to `grounded: documents.length > 0 && result.usedContext` (retrieval already guarantees `documents.length > 0` on this branch, so effectively `grounded: result.usedContext`, but keep both terms for clarity/defensiveness in case this function's branching is ever refactored).
- `docs/architecture.md` — update the "AI orchestration" section's description of `grounded`'s meaning.
- No change to `app/dashboard/ai-test/actions.ts`/`ask-form.tsx` — `state.grounded` already reads correctly once the underlying value is correct; the existing "Grounded in retrieved knowledge." / fallback label text stays accurate under the new definition without edits.

## Database changes

None.

## Server / client boundaries

Unchanged from Phase 9 — `lib/rag.ts` stays `server-only`; `usedContext` is exactly as safe to render client-side as `escalate` (no secret, no internal detail).

## Implementation requirements

1. Add to `SalesEmployeeResponseSchema`: `usedContext: z.boolean().describe("True if the answer above actually used the reference context to answer the question. False if the reference context was irrelevant, unused, or the question fell into category 4 (unknown) and was declined rather than answered from context.")`.
2. Add one instruction line to `SYSTEM_TEMPLATE`, near the existing escalate instruction: explain `usedContext` the same way the schema field's `.describe()` does, so the model has a plain-language definition in the prompt itself, not just the schema description.
3. In `askSalesEmployee()`'s grounded branch, change the returned `grounded` value to `documents.length > 0 && result.usedContext` (equivalently `result.usedContext`, given the branch's precondition — pick whichever reads clearer, both are correct) and add `usedContext: result.usedContext` if it's useful to expose separately from `grounded`... **decide during implementation whether to expose `usedContext` as its own field on `SalesEmployeeResponse` in addition to fixing `grounded`, or only use it internally to compute `grounded`.** Exposing it separately costs nothing and gives future debugging (including a repeat of this exact investigation) a more granular signal than a single collapsed boolean — recommended, but flag if there's a reason not to.
4. No change to the zero-chunk branch's return shape beyond whatever `SalesEmployeeResponse`'s type requires for consistency (e.g. if `usedContext` is added as an exposed field, the zero-chunk branch returns `usedContext: false` there too, matching `grounded: false`).

## Security requirements

Unchanged from Phase 9 — `usedContext` is untrusted model output (`AGENTS.md` §3 rule 5, `docs/security.md` §8), used only for display, never for authorization or tenant decisions.

## Error handling

Unchanged — `usedContext` is validated by the same Zod schema and `withStructuredOutput()` call already wrapped in the existing `AppError` try/catch; a schema-conformance failure is already handled.

## Acceptance criteria

- [ ] Test 7 (general-knowledge question, e.g. "what's the capital of France?") shows `grounded: false` (or however the UI surfaces the corrected value) — the primary regression this fix exists to prove, not just infer from the schema change existing.
- [ ] A real, answerable product question (e.g. Phase 9 Test 1/5) still shows `grounded: true` — confirming the fix doesn't over-correct and start showing `false` for answers that genuinely did use retrieved context.
- [ ] The zero-knowledge-business case (Phase 8/9 regression test) is unaffected: still `grounded: false`, still no model call.
- [ ] `npm run lint` passes with zero errors/warnings.
- [ ] `npx tsc --noEmit` passes.
- [ ] `npm run build` passes.

## Automated checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

## Manual testing steps

1. **Primary regression — must be re-run, not assumed fixed:** repeat Phase 9's Test 7 (a general-knowledge question unrelated to the business or any competitor) on a business that has some knowledge chunks (so the retriever likely returns something via embedding similarity, exercising the actual gap). Confirm the answer is still correctly declined, and confirm `grounded` now reads `false` — this is the exact case that exposed the original bug and is the one that has to be proven fixed.
2. Ask a real, answerable question from that business's own knowledge. Confirm `grounded: true` — proving the fix distinguishes the two cases rather than just always returning `false`.
3. Repeat the zero-knowledge-business test (no chunks at all). Confirm still `grounded: false` and still no Gemini call, unchanged from before this fix.
4. Spot-check `escalate` still behaves correctly on at least one of Phase 9's escalation test cases (e.g. "can I speak to a person?"), confirming this change didn't disturb the existing structured-output field.

## Out of scope

- Any change to `escalate`/`escalationReason` behavior.
- Any change to the zero-chunk hard bypass.
- Any UI/label wording change beyond what's needed to reflect the corrected `grounded` value (the existing "Grounded in retrieved knowledge." / fallback label text already reads correctly once the value itself is correct).
- Item 1 from the same testing round (the stale-looking server log) — being investigated separately by the user, not part of this fix.
