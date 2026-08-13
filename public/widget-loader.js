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

  document.body.appendChild(iframe);

  // Owned by this loader, not the iframe -- it persists across the whole
  // conversation because this loader is what makes every /api/chat call.
  var conversationId = null;

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
    }
  });
})();
