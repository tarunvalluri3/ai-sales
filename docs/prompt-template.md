# Implementation prompt contract

Read this only when writing a prompt file. Prompts live in `prompts/` with descriptive kebab-case names, e.g. `prompts/clerk-authentication.md`, `prompts/knowledge-ingestion.md`, `prompts/rag-pipeline.md`.

A prompt is an implementation contract, not a vague instruction. If a section does not apply, write "None" rather than deleting it — the absence is itself information.

After writing the prompt, **stop** and reply exactly:

`I prepared the implementation prompt at prompts/<file-name>.md. Is this good to execute?`

---

## Template

```markdown
# <Title>

## Goal
One paragraph. What will be true after this is implemented that is not true now.

## Current phase
Phase N — <name>. Confirmed from STATE.md.

## User request
The original request, quoted or closely restated.

## Skills and docs read
Exact paths. Note anything referenced but not found on disk.

## Existing code inspected
Files actually opened, and what was found. Not a guess at what exists.

## Relevant existing architecture
Patterns, conventions, and constraints this work must fit into.

## Decisions and assumptions
Every choice made that the user did not specify. Flag anything that should
become a decision entry in STATE.md.

## Open decisions this depends on
Decision IDs from STATE.md §4 that must be resolved first. If any are open,
say so here and do not proceed past them.

## Dependencies / packages required
Name, why, and confirmation it is not already in package.json.

## Files likely to change
Created, modified, deleted.

## Database changes
Migrations, tables, columns, indexes, constraints, RLS policies.
Exact migration commands.

## Server / client boundaries
What runs server-only. What reaches the client. Which secrets are involved.

## Implementation requirements
The actual specification. Numbered, concrete, testable.

## Security requirements
Tenant scoping, identity validation, secret handling, input validation.
Reference docs/security.md sections rather than restating them.

## Error handling
Failure modes and the intended user-facing behavior for each.

## Acceptance criteria
Checklist. Each item objectively verifiable.

## Automated checks
Exact commands to run, including tenant-isolation tests where applicable.

## Manual testing steps
Exact pages, requests, and interactions. Include the negative cases —
what should fail, and how you confirm it fails.

## Out of scope
What this deliberately does not do, and which phase it belongs to instead.
```

---

## Additional sections for UI prompts

Append these when the work has meaningful UI:

```markdown
## Visual interpretation
How the request translates into a visual approach, given existing decisions.

## Layout and hierarchy
## Typography and spacing
## Components
Reused vs. new. Justify each new one.

## Responsive behavior
Breakpoints and what changes at each.

## States
Default · loading · empty · error · disabled · success

## Interaction behavior
## Accessibility
Keyboard navigation, focus order, labels, contrast, screen reader behavior.
```

---

## Anti-patterns

- Restating `AGENTS.md` at length instead of pointing at it
- "Inspected the codebase" without naming files
- Acceptance criteria that cannot be objectively checked
- Silently widening scope beyond the user's request
- Omitting the negative test cases
- Writing the prompt and implementing in the same turn
