/**
 * Waves AI Pilot chat widget embed script.
 *
 * Usage: <script src=".../widget-loader.js" data-widget-key="..." data-position="bottom-right"></script>
 *
 * This script runs in the HOST PAGE's own JavaScript context -- a genuinely
 * different origin from this app in every real embed. It is deliberately
 * the ONLY thing that calls /api/chat: that is the only execution context
 * whose fetch() carries the host page's real Origin header, which is what
 * the server's per-business origin allowlist (docs/security.md §4) checks
 * against. The iframe it creates is a pure rendering surface with no
 * network access of its own -- see app/(widget)/widget/embed/ for the
 * postMessage protocol this talks to.
 *
 * No build step, no framework, no dependency: this file is served as-is
 * from /public.
 */
(function () {
  "use strict";

  function getOwnScript() {
    if (document.currentScript) return document.currentScript;
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (/widget-loader\.js(\?|$)/.test(scripts[i].src)) return scripts[i];
    }
    return null;
  }

  var ownScript = getOwnScript();
  if (!ownScript) {
    console.error("[ai-sales-widget] Could not locate its own <script> tag.");
    return;
  }

  var widgetKey = ownScript.getAttribute("data-widget-key");
  if (!widgetKey) {
    console.error("[ai-sales-widget] Missing required data-widget-key attribute.");
    return;
  }

  var position = ownScript.getAttribute("data-position") || "bottom-right";
  if (position !== "bottom-right" && position !== "bottom-left") {
    position = "bottom-right";
  }

  var appOrigin = new URL(ownScript.src, window.location.href).origin;

  // Phase 25b "source/page attribution": origin + pathname only, no
  // query string or fragment (which can carry tracking tokens this app
  // has no reason to store) -- the server re-derives/caps this anyway
  // (app/api/chat/route.ts's sanitizeSourceUrl()), this is just not
  // sending more than necessary in the first place. Only used by the
  // server the first time it creates a conversation for this send.
  var pageUrl = window.location.origin + window.location.pathname;
  // Phase 32 Stage E: when this script started, so each send can report how
  // long the page had been loaded. Only ever tightens a server-side limit.
  var loaderStartedAt = Date.now();
  // Widget reliability item 3: the visitor's browser time zone, so offered
  // times can show "(11:30 PM Fri, your time)". Display only; the server
  // validates it and never uses it for anything else.
  var visitorTimeZone = null;
  try {
    var zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof zone === "string" && zone.length > 0 && zone.length <= 64) visitorTimeZone = zone;
  } catch {
    visitorTimeZone = null;
  }

  var COLLAPSED_SIZE = 84;
  var MARGIN = 20;

  var iframe = document.createElement("iframe");
  iframe.src =
    appOrigin +
    "/widget/embed?key=" +
    encodeURIComponent(widgetKey) +
    "&position=" +
    encodeURIComponent(position);
  iframe.title = "Chat widget";
  iframe.style.position = "fixed";
  iframe.style.bottom = MARGIN + "px";
  iframe.style[position === "bottom-left" ? "left" : "right"] = MARGIN + "px";
  iframe.style.width = COLLAPSED_SIZE + "px";
  iframe.style.height = COLLAPSED_SIZE + "px";
  iframe.style.border = "none";
  iframe.style.background = "transparent";
  iframe.style.zIndex = "2147483000";
  iframe.style.colorScheme = "light";
  iframe.setAttribute("allowtransparency", "true");

  // Purely visual: a short size transition so the launcher <-> panel swap
  // reads as one smooth surface instead of a hard cut. Does not touch
  // scheduling/polling/postMessage logic below.
  var prefersReducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  iframe.style.transition = prefersReducedMotion ? "none" : "width 200ms ease, height 200ms ease";

  document.body.appendChild(iframe);

  // Phase 25a: "widget conversation restored from the database on page
  // refresh instead of resetting." localStorage is scoped to this
  // widget key, on the HOST page's own origin (this loader, unlike the
  // iframe, runs there) -- a returning visitor on the same device/browser
  // resumes their conversation; a different device/browser starts fresh,
  // same as any other localStorage-backed session.
  var STORAGE_KEY = "ai_sales_widget_conversation:" + widgetKey;

  function readStoredConversationId() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function storeConversationId(id) {
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Storage unavailable (private browsing, disabled storage, etc.) --
      // the conversation just won't survive a refresh this session.
    }
  }

  function clearStoredConversationId() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clean up if storage was never reachable.
    }
  }

  // Owned by this loader, not the iframe -- it persists across the whole
  // conversation because this loader is what makes every /api/chat call.
  // Seeded from localStorage so a page refresh can resume the same
  // conversation instead of silently starting a new one.
  var conversationId = readStoredConversationId();

  // Phase 25d "recent chats": a client-generated, unauthenticated
  // correlation id, scoped per widget key like STORAGE_KEY above, minted
  // once on first load and reused on every later load/send/recent-chats
  // request. This is a UX convenience for a returning visitor to find
  // their own past conversations -- never an identity or authorization
  // credential (docs/security.md §4); it is forgeable by anyone with
  // access to this browser's storage, same as the conversation id above.
  var VISITOR_STORAGE_KEY = "ai_sales_widget_visitor:" + widgetKey;

  function generateVisitorId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "v-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  var visitorId;
  try {
    visitorId = window.localStorage.getItem(VISITOR_STORAGE_KEY);
    if (!visitorId) {
      visitorId = generateVisitorId();
      window.localStorage.setItem(VISITOR_STORAGE_KEY, visitorId);
    }
  } catch {
    // Storage unavailable -- fall back to an in-memory id for this page
    // load only; "recent chats" simply won't find anything from a prior
    // visit, same degrade as conversation restore above.
    visitorId = generateVisitorId();
  }

  // Phase 15b polling state -- all owned by this loader, since it's the
  // only script that can make an authorized (real-Origin-header) request.
  //
  // Widget reliability item 8 (2026-11-20): human replies took 10-20 s to
  // appear, because polling only started after an escalation or a "human"
  // control seen in a reply -- a staff takeover of a conversation that never
  // escalated went unseen until the visitor sent again. The cadence is now:
  //   off   -- panel closed, tab hidden, no conversation yet, or a send in
  //            flight (no load for a closed widget or a background tab);
  //   FAST  -- a human controls the conversation (restore/poll/reply said
  //            control:"human") or it escalated (staff likely about to reply);
  //   SLOW  -- otherwise, so a takeover is still noticed.
  // hasHandoffSignal (escalated) stays a one-way latch per conversation;
  // isHumanControl follows the server's latest answer both ways.
  var hasHandoffSignal = false;
  var isHumanControl = false;
  var isPanelOpen = false;
  var isSendInFlight = false;
  // feat/chat-streaming: AbortController per in-flight send (keyed by its
  // requestId), so a "widget:abort" from the iframe (the visitor pressing
  // stop) cancels exactly that request's fetch and no other.
  var inflightControllers = {};
  var lastKnownMessageAt = null;
  var knownMessageIds = {};
  var pollTimeoutId = null;
  // 2.5 s fast = 120 polls / 5 min, inside /api/chat/poll's per-conversation
  // limit of 150 (the rest covers pollNow() on refocus/reopen).
  var FAST_POLL_INTERVAL_MS = 2500;
  var SLOW_POLL_INTERVAL_MS = 15000;

  /** The poll interval right now, or null when the widget must not poll at all. */
  function currentPollInterval() {
    if (!isPanelOpen || isSendInFlight || !conversationId || document.visibilityState !== "visible") {
      return null;
    }
    return isHumanControl || hasHandoffSignal ? FAST_POLL_INTERVAL_MS : SLOW_POLL_INTERVAL_MS;
  }

  function schedulePoll() {
    if (pollTimeoutId) return;
    var interval = currentPollInterval();
    if (interval === null) return;
    pollTimeoutId = setTimeout(doPoll, interval);
  }

  /** Drops an armed timer and schedules again -- used when the cadence may have changed. */
  function reschedulePoll() {
    if (pollTimeoutId) {
      clearTimeout(pollTimeoutId);
      pollTimeoutId = null;
    }
    schedulePoll();
  }

  function doPoll() {
    pollTimeoutId = null;

    // Defensive: pollNow() (an immediate poll, bypassing the normal
    // schedule) can be triggered by an event (tab refocus, panel
    // reopen) that races a send already in flight -- re-check here
    // rather than trusting every caller to have checked already.
    if (isSendInFlight || !conversationId) {
      schedulePoll();
      return;
    }

    fetch(appOrigin + "/api/chat/poll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        widgetKey: widgetKey,
        conversationId: conversationId,
        after: lastKnownMessageAt,
        // Widget reliability item 2: polls are scoped to this visitor too.
        visitorId: visitorId,
      }),
    })
      .then(function (response) {
        return response.json().catch(function () {
          return null;
        });
      })
      .then(function (body) {
        if (body && body.ok) {
          var fresh = [];
          for (var i = 0; i < body.data.messages.length; i++) {
            var m = body.data.messages[i];
            if (!knownMessageIds[m.id]) {
              knownMessageIds[m.id] = true;
              fresh.push(m);
            }
          }
          lastKnownMessageAt = body.data.asOf;
          // The server's current control decides FAST vs SLOW (both ways).
          if (body.data.control === "human") isHumanControl = true;
          else if (body.data.control === "ai") isHumanControl = false;
          if (fresh.length > 0) {
            iframe.contentWindow.postMessage(
              { type: "widget:poll_result", messages: fresh },
              appOrigin,
            );
          }
        }
        // A poll failure is invisible to the prospect -- no cursor
        // update, just try again on the next scheduled tick.
      })
      .catch(function () {
        // Same as above: silent, retried on the next tick.
      })
      .then(function () {
        schedulePoll();
      });
  }

  function pollNow() {
    if (pollTimeoutId) {
      clearTimeout(pollTimeoutId);
      pollTimeoutId = null;
    }
    doPoll();
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      // Back on the tab with the panel open: catch up at once, then resume
      // the cadence (doPoll reschedules itself).
      if (isPanelOpen && conversationId) pollNow();
    } else if (pollTimeoutId) {
      clearTimeout(pollTimeoutId);
      pollTimeoutId = null;
    }
  });

  function applyResize(width, height) {
    iframe.style.width = width + "px";
    iframe.style.height = height + "px";
    var isFullScreen = width >= window.innerWidth && height >= window.innerHeight;
    if (isFullScreen) {
      iframe.style.top = "0";
      iframe.style.left = "0";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "100%";
      iframe.style.height = "100%";
    } else {
      iframe.style.top = "";
      iframe.style.bottom = MARGIN + "px";
      iframe.style.left = "";
      iframe.style.right = "";
      iframe.style[position === "bottom-left" ? "left" : "right"] = MARGIN + "px";
    }
  }

  function postViewport() {
    iframe.contentWindow.postMessage(
      { type: "widget:viewport", width: window.innerWidth, height: window.innerHeight },
      appOrigin,
    );
  }

  // Restore coordination: the /api/chat/restore fetch below and the
  // iframe becoming READY race independently -- either can finish first,
  // so whichever finishes second is what actually sends it.
  //
  // Widget reliability item 2 (2026-11-20): "ready" used to mean the
  // iframe's "load" event. But React attaches its message listener only
  // after hydration, which can finish after "load", so a restore posted at
  // "load" was silently dropped: the visitor saw an empty chat while the AI
  // (which reads the stored conversation id) still remembered everything.
  // The iframe now says "widget:ready" once its listeners are attached.
  var iframeReady = false;
  var pendingRestore = null;

  function tryPostRestore() {
    if (!iframeReady || !pendingRestore) return;
    iframe.contentWindow.postMessage(
      { type: "widget:restore", messages: pendingRestore.messages, consentGiven: pendingRestore.consentGiven },
      appOrigin,
    );
    pendingRestore = null;
  }

  iframe.addEventListener("load", function () {
    postViewport();
  });

  // Shared by the initial page-load restore below and by
  // "widget:switch_conversation" (Phase 25d "recent chats" -- picking a
  // past conversation reuses this exact same fetch-and-restore flow
  // rather than a second mechanism). `onFailure` only runs for the
  // page-load case, where a dead stored id should be cleared; switching
  // to a conversation the prospect just picked from their own list is
  // not expected to fail the same way, and clearing knownMessageIds/
  // lastKnownMessageAt here means a poll after switching only surfaces
  // messages new to the just-restored conversation.
  function restoreConversation(id, onFailure) {
    knownMessageIds = {};
    lastKnownMessageAt = null;
    fetch(appOrigin + "/api/chat/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widgetKey: widgetKey, conversationId: id, visitorId: visitorId }),
    })
      .then(function (response) {
        return response.json().then(
          function (body) {
            return { ok: response.ok, body: body };
          },
          function () {
            return { ok: response.ok, body: null };
          },
        );
      })
      .then(function (result) {
        if (!result.ok || !result.body || !result.body.ok) {
          if (onFailure) onFailure();
          return;
        }

        var data = result.body.data;
        if (data.asOf) lastKnownMessageAt = data.asOf;
        isHumanControl = data.control === "human";
        for (var i = 0; i < data.messages.length; i++) {
          if (data.messages[i].role !== "user") {
            knownMessageIds[data.messages[i].id] = true;
          }
        }
        pendingRestore = { messages: data.messages, consentGiven: data.consentGiven === true };
        tryPostRestore();
        // A restored conversation a human already controls must poll at the
        // fast cadence right away -- the panel may already be open with a
        // slow timer armed, so reschedule rather than schedule.
        reschedulePoll();
      })
      .catch(function () {
        // A network failure here is invisible to the prospect -- the
        // stored conversationId is left in place, so the next page load
        // (or the first real send, which still carries it) tries again.
      });
  }

  if (conversationId) {
    restoreConversation(conversationId, function () {
      // The stored conversation no longer resolves (deleted, expired,
      // cross-tenant after a key rotation, etc.) -- clear it so the next
      // page load starts a genuinely fresh conversation instead of
      // retrying the same dead id forever.
      conversationId = null;
      clearStoredConversationId();
    });
  }

  var viewportThrottle = null;
  window.addEventListener("resize", function () {
    if (viewportThrottle) return;
    viewportThrottle = setTimeout(function () {
      viewportThrottle = null;
      postViewport();
    }, 150);
  });

  function postError(requestId, kind) {
    iframe.contentWindow.postMessage({ type: "widget:error", requestId: requestId, kind: kind }, appOrigin);
  }

  // Maps one SSE frame to its event object, tolerantly: a malformed frame
  // is dropped (returns null), never surfaced. Hand-kept in sync with
  // lib/chat-stream.ts's parseFrame -- this loader is plain JS with no build
  // step and cannot import it, the same deliberate duplication as the
  // postMessage shapes.
  function parseSseFrame(frame) {
    var data = "";
    var lines = frame.split("\n");
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf("data:") === 0) {
        data += lines[i].slice(lines[i].indexOf("data: ") === 0 ? 6 : 5);
      }
    }
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  // The buffered JSON path, unchanged in behaviour: an old server, the
  // human-control response (which stays JSON even for a streaming client),
  // or any non-stream reply. Mapped to widget:response / widget:error
  // exactly as this loader always did.
  function handleJsonResponse(requestId, response, body) {
    if (response.ok && body && body.ok) {
      conversationId = body.data.conversationId;
      storeConversationId(conversationId);
      if (body.data.asOf) lastKnownMessageAt = body.data.asOf;
      if (body.data.escalate) hasHandoffSignal = true;
      if (body.data.control === "human") isHumanControl = true;
      else if (body.data.control === "ai") isHumanControl = false;
      iframe.contentWindow.postMessage(
        {
          type: "widget:response",
          requestId: requestId,
          conversationId: body.data.conversationId,
          answer: body.data.answer,
          escalate: body.data.escalate,
          recommendedProducts: body.data.recommendedProducts || [],
          followUpContact: typeof body.data.followUpContact === "string" ? body.data.followUpContact : null,
        },
        appOrigin,
      );
      return;
    }
    var kind = "failure";
    // 401 = bad key, 403 = valid key but this site/agent may not use it
    // (origin not allowed, agent not published). Both mean "this chat isn't
    // available" -- the reason is logged server-side, never sent here.
    if (response.status === 401 || response.status === 403) kind = "unauthorized";
    else if (response.status === 429) kind = "rate_limited";
    postError(requestId, kind);
  }

  // Widget-open warm-up: when the visitor opens the panel (never on page
  // load), ask the server to wake the chat function and cache this
  // business's authorized context for a few seconds, so the first message
  // is not the one that pays for a cold start. Fire-and-forget: no result is
  // used, every failure is ignored, and at most one call per 30s so
  // open/close toggling cannot spam it. The server does no AI work and no
  // writes for this call (app/api/chat/warm/route.ts).
  var lastWarmUpAt = 0;
  function warmUp() {
    var now = Date.now();
    if (now - lastWarmUpAt < 30000) return;
    lastWarmUpAt = now;
    try {
      fetch(appOrigin + "/api/chat/warm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgetKey: widgetKey }),
        keepalive: true,
      }).catch(function () {});
    } catch {
      // A warm-up must never affect the widget.
    }
  }

  async function handleSend(requestId, text, consentGiven, suggested, turnstileToken) {
    // The synchronous chat response is more current than any poll could
    // be, and this avoids two competing requests updating state at once.
    isSendInFlight = true;
    // An AbortController per in-flight request, so a "widget:abort" (the
    // visitor pressing stop) can cancel exactly this fetch. This is NOT a
    // timeout -- there is still no client-side deadline here; the one
    // deadline remains the widget panel's own (use-widget-chat.ts's
    // RESPONSE_TIMEOUT_MS, derived from the server's maxDuration), which a
    // streamed turn clears on its first token.
    var controller = new AbortController();
    inflightControllers[requestId] = controller;
    try {
      var response = await fetch(appOrigin + "/api/chat", {
        method: "POST",
        // Asks for a stream; a server that doesn't stream (or the
        // human-control branch) answers with JSON and is handled below.
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({
          widgetKey: widgetKey,
          conversationId: conversationId || undefined,
          message: text,
          consentGiven: !!consentGiven,
          pageUrl: pageUrl,
          visitorId: visitorId,
          clientElapsedMs: Math.max(0, Date.now() - loaderStartedAt),
          visitorTimeZone: visitorTimeZone || undefined,
          stream: true,
          // Set only for a suggested-question chip click (analytics).
          suggested: suggested === true ? true : undefined,
          // Cloudflare Turnstile token from the iframe (production readiness
          // item 3); the server verifies it when a new conversation starts.
          turnstileToken: typeof turnstileToken === "string" && turnstileToken.length <= 2048 ? turnstileToken : undefined,
        }),
        signal: controller.signal,
      });

      var contentType = response.headers.get("content-type") || "";

      // A pre-generation failure (401/429/4xx/5xx) carries a status and a
      // JSON body, never a stream -- map it exactly as before.
      if (!response.ok) {
        var body = await response.json().catch(function () {
          return null;
        });
        handleJsonResponse(requestId, response, body);
        return;
      }

      // Not a stream (human-control, or an older server): buffered JSON.
      if (contentType.indexOf("text/event-stream") === -1 || !response.body) {
        var jsonBody = await response.json().catch(function () {
          return null;
        });
        handleJsonResponse(requestId, response, jsonBody);
        return;
      }

      // Server-Sent Events: relay each event to the iframe as it arrives.
      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";
      var sawTerminal = false;
      var sawDelta = false;
      for (;;) {
        var result = await reader.read();
        if (result.done) break;
        buffer += decoder.decode(result.value, { stream: true });
        var boundary;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          var frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          var event = parseSseFrame(frame);
          if (!event) continue;
          if (event.type === "meta") {
            if (event.conversationId) {
              conversationId = event.conversationId;
              storeConversationId(conversationId);
            }
            if (event.asOf) lastKnownMessageAt = event.asOf;
            iframe.contentWindow.postMessage(
              { type: "widget:stream_start", requestId: requestId, conversationId: conversationId },
              appOrigin,
            );
          } else if (event.type === "delta") {
            sawDelta = true;
            iframe.contentWindow.postMessage(
              { type: "widget:stream_delta", requestId: requestId, text: event.text || "" },
              appOrigin,
            );
          } else if (event.type === "ping") {
            // Widget reliability item 1: the server's keep-alive while the
            // turn is still working. Relayed so the iframe's stall clock
            // (lib/widget-turn-watch.ts) only ever catches a dead connection.
            if (!sawTerminal) {
              iframe.contentWindow.postMessage({ type: "widget:stream_ping", requestId: requestId }, appOrigin);
            }
          } else if (event.type === "retract") {
            iframe.contentWindow.postMessage(
              { type: "widget:stream_retract", requestId: requestId, text: event.text || "" },
              appOrigin,
            );
          } else if (event.type === "final") {
            sawTerminal = true;
            if (event.asOf) lastKnownMessageAt = event.asOf;
            if (event.escalate) hasHandoffSignal = true;
            iframe.contentWindow.postMessage(
              {
                type: "widget:stream_end",
                requestId: requestId,
                escalate: !!event.escalate,
                recommendedProducts: event.recommendedProducts || [],
                // Widget reliability item 7: the masked contact on file, or null.
                followUpContact: typeof event.followUpContact === "string" ? event.followUpContact : null,
              },
              appOrigin,
            );
          } else if (event.type === "error") {
            sawTerminal = true;
            postError(requestId, event.kind || "failure");
          }
        }
      }

      // The stream ended without a terminal event (the connection dropped).
      // Keep any partial answer already shown rather than erroring over it;
      // only a stream that produced nothing at all is a failure.
      if (!sawTerminal) {
        if (sawDelta) {
          iframe.contentWindow.postMessage({ type: "widget:stream_aborted", requestId: requestId, dropped: true }, appOrigin);
        } else {
          postError(requestId, "failure");
        }
      }
    } catch {
      // An abort (the visitor pressed stop, the iframe's own timeout, or the
      // page unloading) is not an error: finalize whatever streamed.
      // Widget reliability item 1: a connection that DROPS mid-read used to
      // land here as a bare failure, which deleted the partial answer already
      // on screen. Now a drop after some text keeps it (marked dropped, so the
      // iframe offers Retry); only a drop before any text is a plain failure.
      if (sawTerminal) {
        // The turn already ended cleanly; a late read error changes nothing.
      } else if (controller.signal.aborted) {
        iframe.contentWindow.postMessage({ type: "widget:stream_aborted", requestId: requestId }, appOrigin);
      } else if (sawDelta) {
        iframe.contentWindow.postMessage({ type: "widget:stream_aborted", requestId: requestId, dropped: true }, appOrigin);
      } else {
        postError(requestId, "failure");
      }
    } finally {
      delete inflightControllers[requestId];
      isSendInFlight = false;
      // The reply may have changed the cadence (escalated / human control).
      reschedulePoll();
    }
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== appOrigin || event.source !== iframe.contentWindow) return;
    var data = event.data;
    if (!data || typeof data.type !== "string") return;

    if (data.type === "widget:ready") {
      // The iframe's listeners are attached (see tryPostRestore above).
      iframeReady = true;
      postViewport();
      tryPostRestore();
    } else if (data.type === "widget:resize" && typeof data.width === "number" && typeof data.height === "number") {
      applyResize(data.width, data.height);
    } else if (data.type === "widget:send" && typeof data.requestId === "string" && typeof data.text === "string") {
      handleSend(data.requestId, data.text, data.consentGiven, data.suggested, data.turnstileToken);
    } else if (data.type === "widget:abort" && typeof data.requestId === "string") {
      // The visitor pressed stop: cancel that request's fetch. handleSend's
      // catch then relays a widget:stream_aborted so the panel keeps the
      // partial answer instead of showing an error.
      var pendingController = inflightControllers[data.requestId];
      if (pendingController) pendingController.abort();
    } else if (data.type === "widget:new_chat") {
      // Phase 25d "start new chat": clear this loader's own copy of the
      // conversation and every piece of poll state derived from it, so
      // the next "widget:send" (no conversationId attached) creates a
      // genuinely fresh conversation server-side.
      conversationId = null;
      clearStoredConversationId();
      hasHandoffSignal = false;
      isHumanControl = false;
      lastKnownMessageAt = null;
      knownMessageIds = {};
      if (pollTimeoutId) {
        clearTimeout(pollTimeoutId);
        pollTimeoutId = null;
      }
    } else if (data.type === "widget:recent_chats_request") {
      fetch(appOrigin + "/api/chat/recent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgetKey: widgetKey, visitorId: visitorId }),
      })
        .then(function (response) {
          return response.json().catch(function () {
            return null;
          });
        })
        .then(function (body) {
          var conversations = body && body.ok && Array.isArray(body.data.conversations) ? body.data.conversations : [];
          iframe.contentWindow.postMessage(
            { type: "widget:recent_chats_result", conversations: conversations },
            appOrigin,
          );
        })
        .catch(function () {
          iframe.contentWindow.postMessage(
            { type: "widget:recent_chats_result", conversations: [] },
            appOrigin,
          );
        });
    } else if (data.type === "widget:switch_conversation" && typeof data.conversationId === "string") {
      // Reuses the same restoreConversation() the page-load path uses --
      // by the time its reply arrives the iframe has already cleared its
      // own message list (see use-widget-chat.ts's switchConversation()),
      // so widget:restore's normal "only apply if currently empty" rule
      // still holds, even for a conversation with zero messages.
      conversationId = data.conversationId;
      storeConversationId(conversationId);
      hasHandoffSignal = false;
      isHumanControl = false;
      restoreConversation(conversationId, function () {
        conversationId = null;
        clearStoredConversationId();
      });
    } else if (data.type === "widget:panel_open" && typeof data.open === "boolean") {
      var wasOpen = isPanelOpen;
      isPanelOpen = data.open;
      if (isPanelOpen && !wasOpen) warmUp();
      if (isPanelOpen && !wasOpen && (hasHandoffSignal || isHumanControl)) {
        pollNow();
      } else if (!isPanelOpen && pollTimeoutId) {
        // schedulePoll()'s own guard only prevents double-scheduling --
        // it never cancels an already-armed timer, so closing the panel
        // must actively clear it here (same shape as the
        // visibilitychange-hidden branch above).
        clearTimeout(pollTimeoutId);
        pollTimeoutId = null;
      } else {
        schedulePoll();
      }
    }
  });
})();
