/**
 * Escapes Postgres ILIKE wildcard metacharacters (`%`, `_`) and the escape
 * character itself (`\`) in a value that will be interpolated into an
 * ILIKE pattern, so a literal `%`/`_` in user- or AI-supplied text (e.g. a
 * product named "50% Off Bundle") is matched literally instead of being
 * read as a wildcard (Phase 19b, docs/phase-19-audit-findings.md §1/§4).
 * Not a SQL-injection concern -- PostgREST already parameterizes the
 * value -- this only fixes unintended wildcard matching.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
