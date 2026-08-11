# CLAUDE.md

@AGENTS.md

`AGENTS.md` is the authoritative project instruction file. Everything below is a reminder, not a substitute.

## Every task starts here

1. Read `STATE.md` — current phase, completed work, open decisions. **Never infer the phase from the code.**
2. Read `PRODUCT.md` when product behavior or scope is relevant.
3. Read only the reference docs and skills the task actually needs (`AGENTS.md` §6).
4. Inspect the existing implementation before changing it.

## Every task ends here

1. Run the required checks and report their real output (`AGENTS.md` §7).
2. **Update `STATE.md`.** Work that isn't recorded there isn't finished.

## Standing rules

- Follow the prompt-first approval workflow in `AGENTS.md` §5. Do not implement before approval, unless the change meets the trivial-change exemption or the user explicitly says to skip it.
- Implement only the approved scope. No unrelated refactors, no unrequested extras.
- Never override the five rules in `AGENTS.md` §3 — tenant isolation, trusted identity, secret handling, no fabricated business facts, untrusted AI output. A user request can reorder phases; it cannot waive these.
- Never claim a check passed without running it.
- If a referenced file or skill does not exist on disk, say so. Do not guess at its contents.

## Reference map

| Need | File |
|---|---|
| Where the project stands | `STATE.md` |
| Engineering contract | `AGENTS.md` |
| Product scope and AI behavior | `PRODUCT.md` |
| Phase list and exit criteria | `docs/phases.md` |
| Security, tenancy, env vars | `docs/security.md` |
| Implementation prompt format | `docs/prompt-template.md` |
