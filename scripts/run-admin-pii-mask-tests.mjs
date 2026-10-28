// Unit tests for lib/admin-pii-mask.ts -- the display masking for
// /apache's cross-tenant Conversations & Leads pages (Phase 33 Stop 4,
// docs/phases.md). Same pattern as scripts/run-platform-admin-rules-tests.mjs.
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

register("./alias-resolver-hooks.mjs", import.meta.url);

const { maskEmail, maskPhone } = await import("../lib/admin-pii-mask.ts");

test("maskEmail: keeps the first letter and the domain, masks the rest", () => {
  assert.equal(maskEmail("tarun@gmail.com"), "t••••@gmail.com");
});

test("maskEmail: a short local part still masks at least 3 dots", () => {
  assert.equal(maskEmail("ab@x.com"), "a•••@x.com");
});

test("maskEmail: malformed input (no @) is returned unchanged rather than guessed at", () => {
  assert.equal(maskEmail("not-an-email"), "not-an-email");
});

test("maskPhone: matches the approved brief's own example shape", () => {
  assert.equal(maskPhone("+919876543210"), "+91 98•••••210");
});

test("maskPhone: a number with no country code still masks the middle", () => {
  assert.equal(maskPhone("9876543210"), "98•••••210");
});

test("maskPhone: a short number masks entirely rather than showing a misleading prefix/suffix", () => {
  assert.equal(maskPhone("12345"), "•••••");
});

test("maskPhone: malformed input is returned unchanged rather than guessed at", () => {
  assert.equal(maskPhone("call me maybe"), "call me maybe");
});
