/**
 * Phase 33 Stop 5 (docs/phases.md): pure logic behind the Feature Flags
 * section -- flag-key format and the global-default/per-tenant-override
 * resolution order -- kept separate from lib/feature-flags.ts (the
 * database-touching I/O layer) so it is unit-testable without a database,
 * same split as lib/platform-admin-rules.ts/lib/platform-admin.ts and
 * lib/admin-pii-mask.ts.
 */

/** Dot-separated lowercase segments (e.g. "widget.new_chat_bubble") -- matches this codebase's existing snake_case/dot convention for category-like keys (notification_preferences.category). */
const FLAG_KEY_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const FLAG_KEY_MAX_LENGTH = 100;

export function isValidFlagKey(key: string): boolean {
  return key.length > 0 && key.length <= FLAG_KEY_MAX_LENGTH && FLAG_KEY_PATTERN.test(key);
}

/**
 * A per-tenant override always wins when present; otherwise the flag's
 * global default applies. `null`/`undefined` means "no override row for
 * this tenant", not "explicitly disabled" -- those are different states
 * (clearing an override is a real action, lib/feature-flag-actions.ts's
 * `clearTenantOverride`).
 */
export function resolveFlagEnabled(defaultEnabled: boolean, override: boolean | null | undefined): boolean {
  return override ?? defaultEnabled;
}
