// Unit tests for lib/feature-flags-rules.ts -- the pure flag-key
// validation and override-resolution logic behind /apache's Feature Flags
// section (Phase 33 Stop 5, docs/phases.md). Same pattern as
// scripts/run-platform-admin-rules-tests.mjs.
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

register("./alias-resolver-hooks.mjs", import.meta.url);

const { isValidFlagKey, resolveFlagEnabled } = await import("../lib/feature-flags-rules.ts");

test("isValidFlagKey: accepts a plain lowercase key", () => {
  assert.equal(isValidFlagKey("new_chat_bubble"), true);
});

test("isValidFlagKey: accepts dot-separated segments", () => {
  assert.equal(isValidFlagKey("widget.new_chat_bubble"), true);
});

test("isValidFlagKey: rejects uppercase", () => {
  assert.equal(isValidFlagKey("Widget.NewChatBubble"), false);
});

test("isValidFlagKey: rejects a leading digit", () => {
  assert.equal(isValidFlagKey("1_new_flag"), false);
});

test("isValidFlagKey: rejects an empty string", () => {
  assert.equal(isValidFlagKey(""), false);
});

test("isValidFlagKey: rejects a trailing dot", () => {
  assert.equal(isValidFlagKey("widget."), false);
});

test("resolveFlagEnabled: an override wins over the global default, either direction", () => {
  assert.equal(resolveFlagEnabled(false, true), true);
  assert.equal(resolveFlagEnabled(true, false), false);
});

test("resolveFlagEnabled: no override (null or undefined) falls back to the global default", () => {
  assert.equal(resolveFlagEnabled(true, null), true);
  assert.equal(resolveFlagEnabled(false, undefined), false);
});
