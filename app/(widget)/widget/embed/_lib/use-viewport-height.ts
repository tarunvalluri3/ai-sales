"use client";

import { useEffect, useState } from "react";

/**
 * Tracks window.visualViewport.height (this iframe's own, not the host
 * page's) so the panel can shrink to sit above an on-screen mobile keyboard
 * instead of being covered by it. The iframe's own box size -- set by
 * widget-loader.js on the host page -- doesn't change when the keyboard
 * opens or the mobile browser's address bar collapses/expands; its
 * visualViewport does. Returns null when unsupported (very old browsers)
 * or before the first effect run, in which case callers should fall back
 * to their existing 100%/h-full sizing.
 *
 * Deliberately starts at null (not read synchronously in the useState
 * initializer) -- that value is also what the server renders, so React's
 * first client render still matches the server-rendered markup; the real
 * value is only applied after hydration, in the effect below.
 */
export function useViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    function update() {
      setHeight(viewport!.height);
    }

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return height;
}
