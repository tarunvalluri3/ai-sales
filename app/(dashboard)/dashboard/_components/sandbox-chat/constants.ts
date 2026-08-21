/**
 * The `conversations.source` value that marks a row as sandbox-only
 * (Phase 25c "test your AI before publishing"). Never client input --
 * actions.ts is the only call site that sets it. Lives in its own file,
 * not actions.ts, because a "use server" file may only export async
 * functions.
 */
export const SANDBOX_CONVERSATION_SOURCE = "dashboard_test";
