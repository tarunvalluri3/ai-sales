/**
 * AI Sales chat widget embed script.
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

  // Owned by this loader, not the iframe -- it persists across the whole
  // conversation because this loader is what makes every /api/chat call.
  var conversationId = null;

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
  var lastKnownMessageAt = null;
  var knownMessageIds = {};
  var pollTimeoutId = null;
  var POLL_INTERVAL_MS = 6000;

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

  iframe.addEventListener("load", postViewport);

  var viewportThrottle = null;
  window.addEventListener("resize", function () {
    if (viewportThrottle) return;
    viewportThrottle = setTimeout(function () {
      viewportThrottle = null;
      postViewport();
    }, 150);
  });

  async function handleSend(requestId, text) {
    // The synchronous chat response is more current than any poll could
    // be, and this avoids two competing requests updating state at once.
    isSendInFlight = true;
    try {
      var response = await fetch(appOrigin + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          widgetKey: widgetKey,
          conversationId: conversationId || undefined,
          message: text,
        }),
      });

      var body = await response.json().catch(function () {
        return null;
      });

      if (response.ok && body && body.ok) {
        conversationId = body.data.conversationId;
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
          },
          appOrigin,
        );
        return;
      }

      var kind = "failure";
      if (response.status === 401) kind = "unauthorized";
      else if (response.status === 429) kind = "rate_limited";

      iframe.contentWindow.postMessage(
        { type: "widget:error", requestId: requestId, kind: kind },
        appOrigin,
      );
    } catch {
      iframe.contentWindow.postMessage(
        { type: "widget:error", requestId: requestId, kind: "failure" },
        appOrigin,
      );
    } finally {
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
      handleSend(data.requestId, data.text);
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
