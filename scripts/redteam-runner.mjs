// Red-team runner for scripts/run-evals.mjs (guardrails Phase 6, STATE.md).
//
// Replays every Phase 0 attack (scripts/eval-judges.mjs RED_TEAM_ATTACKS)
// against the real /api/chat route and the real model, on BOTH the buffered
// (JSON) and streamed paths, and scores them separately from the main eval
// suite as the "red-team score". Acme Test Co. only.
//
// Opt-in because it is slow and spends real model calls: 30 attacks x 2 paths
// is about 100 requests. `npm run eval` still runs only the main suite;
// `npm run eval:redteam` runs this; `--suite=all` runs both. Narrow it with
// EVAL_ONLY=A27 (attack ids or name fragments) and REDTEAM_PATHS=json.
//
// Pacing matters: the endpoint allows 30 requests per IP per 5 minutes, and
// the limiter counts REJECTED attempts too, so this paces itself to one
// request per 10.5 s and, on a 429, waits out most of the window instead of
// retrying (retrying while limited keeps you limited).
//
// Anything seeded (a poisoned knowledge chunk) is deleted in `finally`, and
// the leads/customers a callback attack creates are removed afterwards, so a
// run leaves Acme's shared fixtures as it found them.
import { RED_TEAM_ATTACKS, judgeAttack } from "./eval-judges.mjs";

const PACE_MS = 10_500;
const RATE_LIMIT_WAIT_MS = 65_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastSend = 0;

async function send({ appUrl, widgetKey }, message, { conversationId, consent, pageUrl, path }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = PACE_MS - (Date.now() - lastSend);
    if (wait > 0) await sleep(wait);
    lastSend = Date.now();

    const headers = { "Content-Type": "application/json", Origin: appUrl };
    if (path === "stream") headers.Accept = "text/event-stream";
    const response = await fetch(`${appUrl}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ widgetKey, message, conversationId, consentGiven: consent, pageUrl }),
    });
    if (response.status === 429) {
      await sleep(RATE_LIMIT_WAIT_MS);
      continue;
    }
    if (!response.ok) throw new Error(`/api/chat returned ${response.status}: ${(await response.text()).slice(0, 160)}`);

    if (!(response.headers.get("content-type") ?? "").includes("event-stream")) {
      const body = await response.json();
      if (!body.ok) throw new Error(`/api/chat error: ${JSON.stringify(body).slice(0, 160)}`);
      return { conversationId: body.data.conversationId, answer: body.data.answer };
    }

    let answer = "";
    let resolvedConversation = conversationId;
    let retracted = false;
    for (const frame of (await response.text()).split("\n\n")) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const event = JSON.parse(line.replace(/^data:\s?/, ""));
      if (event.type === "meta") resolvedConversation = event.conversationId;
      else if (event.type === "delta") answer += event.text;
      else if (event.type === "retract") {
        answer = event.text; // the widget replaces everything shown so far with this text
        retracted = true;
      } else if (event.type === "error") throw new Error(`stream error: ${event.kind}`);
    }
    return { conversationId: resolvedConversation, answer, retracted };
  }
  throw new Error("rate limited repeatedly -- wait five minutes and re-run");
}

async function cleanupConversationArtifacts(supabase, businessId, conversationId) {
  if (!conversationId) return;
  const { data: leads } = await supabase.from("leads").select("id, customer_id").eq("business_id", businessId).eq("conversation_id", conversationId);
  const leadIds = (leads ?? []).map((lead) => lead.id);
  const customerIds = (leads ?? []).map((lead) => lead.customer_id).filter(Boolean);
  if (leadIds.length > 0) {
    await supabase.from("lead_score_history").delete().eq("business_id", businessId).in("lead_id", leadIds);
    await supabase.from("leads").delete().eq("business_id", businessId).in("id", leadIds);
  }
  if (customerIds.length > 0) await supabase.from("customers").delete().eq("business_id", businessId).in("id", customerIds);
  await supabase.from("unanswered_questions").delete().eq("business_id", businessId).eq("conversation_id", conversationId);
}

async function runOne(deps, attack, path) {
  const { supabase, businessId, seedChunk, deleteChunk } = deps;
  let seeded;
  let conversationId;
  try {
    if (attack.seed) {
      seeded = await seedChunk(businessId, attack.seed.content, { sourceType: attack.seed.kind === "url" ? "url" : "manual", sourceUrl: attack.seed.sourceUrl });
    }
    const replies = [];
    for (const turn of attack.turns) {
      const result = await send(deps, turn, { conversationId, consent: attack.consent, pageUrl: attack.pageUrl, path });
      conversationId = result.conversationId;
      replies.push(result.answer);
    }

    const ctx = { otherTenantNames: deps.otherTenantNames };
    if (conversationId) {
      if (attack.secrets || attack.expectStoredText !== undefined) {
        const { data } = await supabase.from("messages").select("content").eq("business_id", businessId).eq("conversation_id", conversationId).eq("role", "user");
        ctx.storedUserMessages = (data ?? []).map((row) => row.content);
      }
      if (attack.expectNoLead || attack.consent) {
        const { count } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("conversation_id", conversationId);
        ctx.leadCount = count ?? 0;
      }
      if (attack.expectCapRespected) {
        // Needs the guardrail_events migration; without the table the cap cannot be observed and is not judged.
        const { count, error } = await supabase
          .from("guardrail_events")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId)
          .eq("conversation_id", conversationId)
          .eq("signal", "write_tool_call")
          .eq("rule", "request_callback");
        ctx.capCount = error ? 0 : (count ?? 0);
      }
    }

    const failures = judgeAttack(attack, replies, ctx);
    return failures.length === 0 ? { pass: true } : { pass: false, detail: `${failures.join("; ")}\n      replies=${JSON.stringify(replies).slice(0, 700)}` };
  } catch (error) {
    return { pass: false, detail: `error: ${error.message}` };
  } finally {
    if (seeded !== undefined) await deleteChunk(seeded);
    await cleanupConversationArtifacts(supabase, businessId, conversationId).catch(() => undefined);
  }
}

/** Runs the red-team suite and prints a PASS/FAIL line per attack and path. Returns { passed, total }. */
export async function runRedTeam(deps) {
  const only = process.env.EVAL_ONLY?.toLowerCase();
  const paths = (process.env.REDTEAM_PATHS ?? "json,stream").split(",").map((p) => p.trim()).filter((p) => p === "json" || p === "stream");
  const attacks = RED_TEAM_ATTACKS.filter(
    (attack) => !only || only.split("|").some((part) => attack.id.toLowerCase() === part || attack.name.toLowerCase().includes(part)),
  );

  const { data: others } = await deps.supabase.from("businesses").select("name").neq("id", deps.businessId);
  const context = { ...deps, otherTenantNames: (others ?? []).map((row) => row.name) };

  console.log(`\nRed-team: ${attacks.length} attack(s) x ${paths.join(" + ")} against ${deps.appUrl} (paced; this takes a while)...\n`);
  let passed = 0;
  let total = 0;
  for (const attack of attacks) {
    for (const path of paths) {
      total++;
      const label = `red-team ${attack.id} ${attack.name} [${path}]`;
      const outcome = await runOne(context, attack, path);
      if (outcome.pass) {
        passed++;
        console.log(`PASS  ${label}`);
      } else {
        console.log(`FAIL  ${label}`);
        console.log(`      ${outcome.detail}`);
      }
    }
  }
  console.log(`\nred-team score: ${passed}/${total} (${total === 0 ? 0 : Math.round((passed / total) * 100)}%)`);
  return { passed, total };
}
