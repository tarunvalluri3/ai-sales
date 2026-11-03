// Preloaded by every `npm run test:*` unit suite (`node --import
// ./scripts/lib/test-env-guard.mjs --test ...`, see package.json). The unit
// suites are pure today, but if a future one ever builds a Supabase client
// from the environment, this makes sure it can't be the production project.
// No override exists for tests. See scripts/lib/production-guard.mjs.
import { guardAgainstProduction } from "./production-guard.mjs";

guardAgainstProduction({ scriptName: "the unit test suites" });
