"use client";

import { useSyncExternalStore } from "react";
import { waveClerkAppearance } from "@/lib/clerk-appearance";

function subscribe(listener: () => void) {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function readLightTheme() {
  return document.documentElement.dataset.theme === "light";
}

function getServerTheme() {
  return false;
}

export function useWaveClerkAppearance() {
  const light = useSyncExternalStore(subscribe, readLightTheme, getServerTheme);
  return light ? waveClerkAppearance.light : waveClerkAppearance.dark;
}
