"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWidgetChat } from "../_lib/use-widget-chat";
import { parseFromParentMessage, postToParent } from "../_lib/post-message";
import { LauncherButton } from "./launcher-button";
import { Panel } from "./panel";

const NARROW_BREAKPOINT_PX = 480;
const COLLAPSED_SIZE_PX = 84;
const PANEL_WIDTH_PX = 380;
const PANEL_HEIGHT_PX = 600;
const VIEWPORT_MARGIN_PX = 24;

export function WidgetApp() {
  const [isOpen, setIsOpen] = useState(false);
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });
  const launcherButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const chat = useWidgetChat();

  useEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      launcherButtonRef.current?.focus();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== window.parent) return;
      const message = parseFromParentMessage(event.data);
      if (message?.type === "widget:viewport") {
        setViewport({ width: message.width, height: message.height });
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    const isNarrow = viewport.width < NARROW_BREAKPOINT_PX;

    if (!isOpen) {
      postToParent({ type: "widget:resize", width: COLLAPSED_SIZE_PX, height: COLLAPSED_SIZE_PX });
      return;
    }

    if (isNarrow) {
      postToParent({ type: "widget:resize", width: viewport.width, height: viewport.height });
      return;
    }

    const height = Math.min(PANEL_HEIGHT_PX, viewport.height - VIEWPORT_MARGIN_PX * 2);
    postToParent({ type: "widget:resize", width: PANEL_WIDTH_PX, height });
  }, [isOpen, viewport]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  if (!isOpen) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <LauncherButton ref={launcherButtonRef} isOpen={false} onToggle={() => setIsOpen(true)} />
      </div>
    );
  }

  return (
    <div className="h-full w-full p-0 sm:p-0">
      <Panel
        messages={chat.messages}
        isAwaitingResponse={chat.isAwaitingResponse}
        isCoolingDown={chat.isCoolingDown}
        panelError={chat.panelError}
        onSend={chat.sendMessage}
        onRetry={chat.retryMessage}
        onClose={handleClose}
      />
    </div>
  );
}
