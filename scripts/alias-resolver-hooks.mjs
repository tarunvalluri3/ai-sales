// Node module-resolution hook (node:module's register() API) that
// resolves this project's TypeScript `@/*` path alias (declared in
// tsconfig.json for Next.js/webpack) to a real file, purely so plain
// Node (via `node --test`, no bundler) can import pure `lib/*.ts` modules
// directly for unit testing -- e.g. scripts/run-copilot-lifecycle-tests.mjs.
// Touches no source file: everything under lib/ keeps using `@/lib/...`
// exactly as the rest of the codebase does.
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSIONS = [".ts", ".tsx", ".mts"];

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const relative = specifier.slice(2);
    const absoluteNoExt = path.join(ROOT, relative);
    const withExtension = EXTENSIONS.map((ext) => absoluteNoExt + ext).find((candidate) => existsSync(candidate));
    if (withExtension) {
      return nextResolve(pathToFileURL(withExtension).href, context);
    }
  }
  return nextResolve(specifier, context);
}
