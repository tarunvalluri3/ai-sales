"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
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
    // Lets the loader (which owns polling, Phase 15b) know whether the
    // panel is currently open -- it never polls while closed. Sent on
    // every isOpen change, including the initial `false` on mount.
    postToParent({ type: "widget:panel_open", open: isOpen });
  }, [isOpen]);

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

  return (
    <AnimatePresence initial={false} mode="wait">
      {isOpen ? (
        <div key="panel" className="h-full w-full p-0 sm:p-0">
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
      ) : (
        <div key="launcher" className="flex h-full w-full items-center justify-center">
          <LauncherButton ref={launcherButtonRef} isOpen={false} onToggle={() => setIsOpen(true)} />
        </div>
      )}
    </AnimatePresence>
  );
}
