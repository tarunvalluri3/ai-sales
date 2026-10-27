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
  // Polling is a one-way latch, not gated on control alone: it starts the
  // first time a response shows escalate:true OR control:"human" (see
  // prompts/phase-15b-staff-reply-and-live-polling.md's Decision 2), and
  // then stays on for the rest of this session rather than toggling on
  // and off with control changes.
  var hasHandoffSignal = false;
  var isPanelOpen = false;
  var isSendInFlight = false;
  // feat/chat-streaming: AbortController per in-flight send (keyed by its
  // requestId), so a "widget:abort" from the iframe (the visitor pressing
  // stop) cancels exactly that request's fetch and no other.
  var inflightControllers = {};
  var lastKnownMessageAt = null;
  var knownMessageIds = {};
  var pollTimeoutId = null;
  var POLL_INTERVAL_MS = 3000;

  function schedulePoll() {
    if (pollTimeoutId) return;
    if (
      !hasHandoffSignal ||
      !isPanelOpen ||
      isSendInFlight ||
      !conversationId ||
      document.visibilityState !== "visible"
    ) {
      return;
    }
    pollTimeoutId = setTimeout(doPoll, POLL_INTERVAL_MS);
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
      if (hasHandoffSignal && isPanelOpen) pollNow();
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
  // iframe's own "load" event race independently -- either can finish
  // first. The restore message is only postable once the iframe has
  // actually loaded (its React tree needs to be mounted to receive it),
  // so whichever finishes second is what actually sends it.
  var iframeLoaded = false;
  var pendingRestoreMessages = null;

  function tryPostRestore() {
    if (!iframeLoaded || !pendingRestoreMessages) return;
    iframe.contentWindow.postMessage(
      { type: "widget:restore", messages: pendingRestoreMessages },
      appOrigin,
    );
    pendingRestoreMessages = null;
  }

  iframe.addEventListener("load", function () {
    iframeLoaded = true;
    postViewport();
    tryPostRestore();
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
      body: JSON.stringify({ widgetKey: widgetKey, conversationId: id }),
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
        if (data.control === "human") hasHandoffSignal = true;
        for (var i = 0; i < data.messages.length; i++) {
          if (data.messages[i].role !== "user") {
            knownMessageIds[data.messages[i].id] = true;
          }
        }
        pendingRestoreMessages = data.messages;
        tryPostRestore();
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
      if (body.data.escalate || body.data.control === "human") {
        hasHandoffSignal = true;
      }
      iframe.contentWindow.postMessage(
        {
          type: "widget:response",
          requestId: requestId,
          conversationId: body.data.conversationId,
          answer: body.data.answer,
          escalate: body.data.escalate,
          recommendedProducts: body.data.recommendedProducts || [],
        },
        appOrigin,
      );
      return;
    }
    var kind = "failure";
    if (response.status === 401) kind = "unauthorized";
    else if (response.status === 429) kind = "rate_limited";
    postError(requestId, kind);
  }

  async function handleSend(requestId, text, consentGiven) {
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
          stream: true,
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
          iframe.contentWindow.postMessage({ type: "widget:stream_aborted", requestId: requestId }, appOrigin);
        } else {
          postError(requestId, "failure");
        }
      }
    } catch {
      // An abort (the visitor pressed stop, or the page is unloading) is not
      // an error: finalize whatever streamed. Anything else is a failure.
      if (controller.signal.aborted) {
        iframe.contentWindow.postMessage({ type: "widget:stream_aborted", requestId: requestId }, appOrigin);
      } else {
        postError(requestId, "failure");
      }
    } finally {
      delete inflightControllers[requestId];
      isSendInFlight = false;
      schedulePoll();
    }
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== appOrigin || event.source !== iframe.contentWindow) return;
    var data = event.data;
    if (!data || typeof data.type !== "string") return;

    if (data.type === "widget:resize" && typeof data.width === "number" && typeof data.height === "number") {
      applyResize(data.width, data.height);
    } else if (data.type === "widget:send" && typeof data.requestId === "string" && typeof data.text === "string") {
      handleSend(data.requestId, data.text, data.consentGiven);
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
      restoreConversation(conversationId, function () {
        conversationId = null;
        clearStoredConversationId();
      });
    } else if (data.type === "widget:panel_open" && typeof data.open === "boolean") {
      var wasOpen = isPanelOpen;
      isPanelOpen = data.open;
      if (isPanelOpen && !wasOpen && hasHandoffSignal) {
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
