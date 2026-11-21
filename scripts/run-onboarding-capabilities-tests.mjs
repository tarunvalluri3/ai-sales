import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(readFileSync(new URL("../" + path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  runInNewContext(outputText, {
    exports, File, FormData, URL, Uint8Array, console, process,
    require(name) {
      if (name in mocks) return mocks[name];
      if (name === "server-only") return {};
      return require(name);
    },
  });
  return exports;
}

const imagesSchema = load("lib/schemas/agent-image.ts");
const tenantA = "928247ec-cf6a-4387-a166-313ab80e0f5c";
const tenantB = "2523696c-aa0c-4e30-9e77-69251feb6b08";
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function imageMock() {
  const removed = [];
  const uploaded = [];
  const references = { products: [], services: [] };
  const bucket = {
    getPublicUrl: (path) => ({ data: { publicUrl: "https://storage.invalid/agent-images/" + path } }),
    upload: async (path) => { uploaded.push(path); return {}; },
    remove: async (paths) => { removed.push(...paths); return {}; },
  };
  const images = load("lib/agent-images.ts", {
    "@/lib/supabase/service": { createServiceSupabaseClient: () => ({ storage: { from: () => bucket } }) },
    "@/lib/supabase/server": { createServerSupabaseClient: () => ({
      from: (table) => ({
        select() { return this; }, eq() { return this; },
        limit: async () => ({ data: references[table] }),
        maybeSingle: async () => ({ data: { live_version_id: null } }),
      }),
    }) },
    "@/lib/errors": { AppError: Error },
    "@/lib/logger": { logEvent: () => assert.fail("Unexpected logging") },
    "@/lib/schemas/agent-image": imagesSchema,
  });
  return { images, removed, uploaded, references };
}

test("upload rejects unsupported types, wrong magic bytes and oversize files", async () => {
  const { images, uploaded } = imageMock();
  for (const file of [
    new File(["<svg/>"], "image.svg", { type: "image/svg+xml" }),
    new File([png], "image.jpg", { type: "image/jpeg" }),
    new File([new Uint8Array(2 * 1024 * 1024 + 1)], "image.png", { type: "image/png" }),
  ]) await assert.rejects(images.uploadAgentImage(tenantA, "products", file));
  assert.equal(uploaded.length, 0);
});

test("upload uses server tenant and generated file name; cleanup affects only unreferenced tenant files", async () => {
  const { images, removed, uploaded, references } = imageMock();
  const url = await images.uploadAgentImage(tenantA, "products", new File([png], tenantB + ".png", { type: "image/png" }));
  assert.ok(uploaded[0].startsWith(tenantA + "/products/"));
  assert.ok(!uploaded[0].includes(tenantB));
  await images.cleanupAgentImage(tenantB, url);
  references.products.push({ id: "referenced" });
  await images.cleanupAgentImage(tenantA, url);
  assert.deepEqual(removed, []);
  references.products.length = 0;
  await images.cleanupAgentImage(tenantA, url);
  assert.deepEqual(removed, uploaded);
});
