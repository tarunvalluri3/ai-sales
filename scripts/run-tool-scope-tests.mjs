// Tool guardrail tests (guardrails Phase 3, STATE.md): tenant scoping of every
// AI tool, contact verification, and the write-tool caps.
//
// AGENTS.md rule 1 / the brief: no tool may fetch an arbitrary URL or read or
// write another business's data, and the model must never be able to pick the
// tenant. Two kinds of proof, because the server-only executors cannot all be
// imported under plain Node (next/server, Clerk and an embedding client are
// needed by some):
//   1. BEHAVIOURAL -- the executors that can be imported are run against a
//      recording fake Supabase client for business A; every query must carry
//      `business_id = A`, and business B's id must never appear in a filter.
//   2. STRUCTURAL -- for every tool file: no network call, no tenant field in
//      the model-facing schema, the executor takes `businessId` from the
//      server as its own parameter, and every table query is filtered by it.
//
// Run: npm run test:tool-scope   (needs --conditions=react-server for server-only)
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

process.env.GEMINI_EMBEDDING_DIMENSION ??= "768"; // lib/embeddings.ts validates this at import; no embedding call is made here
register("./alias-resolver-hooks.mjs", import.meta.url);

const A = "aaaaaaaa-0000-0000-0000-00000000000a";
const B = "bbbbbbbb-0000-0000-0000-00000000000b";

/** A chainable stand-in for the Supabase query builder that records every filter. */
function fakeSupabase() {
  const calls = [];
  const builder = (table) => {
    const record = { table, filters: [] };
    calls.push(record);
    const chain = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") return (resolve) => resolve({ data: [], error: null, count: 0 });
          if (prop === "maybeSingle" || prop === "single") return () => Promise.resolve({ data: null, error: null });
          return (...args) => {
            record.filters.push([String(prop), ...args]);
            return chain;
          };
        },
      },
    );
    return chain;
  };
  return { client: { from: builder }, calls };
}

const businessFiltered = (record) =>
  record.filters.some(([method, column, value]) => method === "eq" && column === "business_id" && value === A);
const mentionsB = (record) => JSON.stringify(record.filters).includes(B);

const importable = [
  ["check-product-details", "executeCheckProductDetails", [{ query: "Test Product" }]],
  ["check-faq-topic", "executeCheckFaqTopic", [{ topic: "pricing" }]],
  ["list-offerings", "executeListOfferings", []],
];

for (const [file, exportName, args] of importable) {
  test(`scope (behavioural): ${exportName} filters every query by the caller's business_id and never touches another`, async () => {
    const mod = await import(new URL(`../lib/tools/${file}.ts`, import.meta.url).href);
    const { client, calls } = fakeSupabase();
    await mod[exportName](client, A, ...args);
    assert.ok(calls.length > 0, "the tool must have queried something");
    for (const record of calls) {
      assert.ok(businessFiltered(record), `${exportName}: query on ${record.table} lacks .eq("business_id", A) -- filters: ${JSON.stringify(record.filters)}`);
      assert.ok(!mentionsB(record), `${exportName} referenced another business`);
    }
  });
}

test("scope (behavioural): a model-supplied business id in the tool arguments is ignored", async () => {
  const mod = await import(new URL("../lib/tools/check-product-details.ts", import.meta.url).href);
  const { client, calls } = fakeSupabase();
  await mod.executeCheckProductDetails(client, A, { query: "x", businessId: B, business_id: B });
  for (const record of calls) {
    assert.ok(businessFiltered(record));
    assert.ok(!mentionsB(record), "an id smuggled into the arguments must never reach a query");
  }
});

const toolFiles = readdirSync(new URL("../lib/tools/", import.meta.url)).filter((name) => name.endsWith(".ts"));
const source = (name) => readFileSync(new URL(`../lib/tools/${name}`, import.meta.url), "utf8");
const readRepo = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
const code = (text) => text.split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");

test("scope (structural): the tool set is the one this suite knows about", () => {
  assert.deepEqual([...toolFiles].sort(), [
    "book-appointment.ts",
    "check-available-slots.ts",
    "check-faq-topic.ts",
    "check-product-details.ts",
    "list-offerings.ts",
    "recommend-products.ts",
    "request-callback.ts",
    "search-knowledge-base.ts",
  ]);
});

for (const name of toolFiles) {
  test(`scope (structural): ${name} makes no network call and takes no URL from the model`, () => {
    const text = code(source(name));
    assert.doesNotMatch(text, /\bfetch\s*\(/, "tools must not fetch");
    assert.doesNotMatch(text, /https?:\/\/(?!\$\{)/, "no hardcoded external URL");
    assert.doesNotMatch(text, /\.url\(\)|z\.url|urlSchema/i, "no URL-typed argument");
  });

  test(`scope (structural): ${name} model-facing schema has no tenant field and the executor owns businessId`, () => {
    const text = code(source(name));
    const start = text.indexOf("z.object(");
    const schemaBlock = start < 0 ? "" : text.slice(start, text.indexOf("});", start) + 3);
    assert.doesNotMatch(schemaBlock, /business_?id|tenant/i, "the model must not be able to pick the tenant");
    assert.match(text, /export async function execute\w+\(\s*\w+: [^,]+,\s*businessId: string/, "executor takes businessId as a server-supplied parameter");
  });

  test(`scope (structural): ${name} every table query is filtered by business_id`, () => {
    const text = code(source(name));
    for (const query of text.split(/\.from\(/).slice(1)) {
      const chain = query.slice(0, 700);
      assert.match(chain, /business_id|businessId/, `a .from() query in ${name} has no business filter: ${chain.slice(0, 120)}`);
    }
  });
}

test("scope (structural): the dispatcher passes its own trusted businessId to every executor, never one from the arguments", () => {
  const rag = code(readRepo("lib/rag.ts"));
  const start = rag.indexOf("async function executeBusinessToolCall");
  const dispatch = rag.slice(start, start + 6000);
  const calls = dispatch.match(/execute[A-Z]\w+\([^)]*\)/g) ?? [];
  assert.ok(calls.length >= 8, `all eight executors are dispatched, found ${calls.length}`);
  for (const call of calls) {
    assert.match(call, /businessId/, call);
    assert.doesNotMatch(call, /toolCall\.args\.(business|tenant)/i);
  }
});

// ------------------------------------------------------- contact verification

const { verifyContactAgainstTranscript } = await import(new URL("../lib/guardrails/contact-check.ts", import.meta.url).href);

test("contact check: details the visitor typed are kept (formatting differences tolerated)", () => {
  const typed = ["hi, I'm Asha Rao", "call me on +91 98765 43210 or email Asha.Rao@Example.com"];
  const out = verifyContactAgainstTranscript(
    { contactName: "Asha Rao", contactEmail: "asha.rao@example.com", contactPhone: "9876543210" },
    typed,
  );
  assert.deepEqual(out.rejected, []);
  assert.equal(out.contactEmail, "asha.rao@example.com");
  assert.equal(out.contactPhone, "9876543210");
  assert.equal(out.contactName, "Asha Rao");
});

test("contact check: an email, phone or name the model made up is dropped", () => {
  const out = verifyContactAgainstTranscript(
    { contactName: "John Smith", contactEmail: "john@made-up.com", contactPhone: "5551234567" },
    ["yes please call me back", "my email is asha@example.com"],
  );
  assert.equal(out.contactEmail, null);
  assert.equal(out.contactPhone, null);
  assert.equal(out.contactName, null);
  assert.deepEqual([...out.rejected].sort(), ["email", "name", "phone"]);
});

test("contact check: the owner's address or a number from the business profile is not accepted unless the visitor typed it", () => {
  const out = verifyContactAgainstTranscript({ contactEmail: "admin-email@gmail.com", contactPhone: "9999999999" }, ["please call me back"]);
  assert.equal(out.contactEmail, null);
  assert.equal(out.contactPhone, null);
});

test("contact check: digits from two different messages are never glued into a phone number", () => {
  assert.equal(verifyContactAgainstTranscript({ contactPhone: "98765 43210" }, ["my pin is 98765", "order 43210"]).contactPhone, null);
});

test("contact check: the channel's verified identity (WhatsApp number) is accepted without being typed", () => {
  const ok = verifyContactAgainstTranscript({ contactPhone: "+919876543210" }, ["call me back"], "919876543210");
  assert.equal(ok.contactPhone, "+919876543210");
  const other = verifyContactAgainstTranscript({ contactPhone: "+919111111111" }, ["call me back"], "919876543210");
  assert.equal(other.contactPhone, null);
});

test("contact check: too-short digit strings are never matched", () => {
  assert.equal(verifyContactAgainstTranscript({ contactPhone: "123" }, ["my code is 123"]).contactPhone, null);
});

// ------------------------------------------------------------------- write caps

test("write caps: defined for exactly the two write tools; each tool verifies contacts, then checks the cap, then writes", () => {
  const caps = readRepo("lib/guardrails/write-caps.ts");
  assert.match(caps, /book_appointment: 2/);
  assert.match(caps, /request_callback: 3/);
  for (const [file, tool, write] of [
    ["lib/tools/request-callback.ts", "request_callback", "upsertLeadForConversation(supabase"],
    ["lib/tools/book-appointment.ts", "book_appointment", "createAppointment(supabase"],
  ]) {
    const text = readRepo(file);
    const verifyAt = text.indexOf("verifyContactAgainstTranscript(");
    const reserveAt = text.indexOf(`reserveWriteToolCall(businessId, conversationId, "${tool}")`);
    const writeAt = text.indexOf(write, reserveAt);
    assert.ok(verifyAt > 0 && reserveAt > verifyAt, `${file}: contacts are verified before the cap check`);
    assert.ok(writeAt > reserveAt, `${file}: the cap check must come before the write`);
    assert.match(text, /reason: "limit_reached"/);
  }
});

test("write caps: the cap counter fails open on infrastructure errors and never throws into a tool", () => {
  const caps = readRepo("lib/guardrails/write-caps.ts");
  assert.match(caps, /catch \{[\s\S]*allowed: true/);
});
