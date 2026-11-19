/*
 * A macOS-style window around REAL Waves AI Pilot dashboard screenshots
 * (light theme, 2x captures of a 1360x674 layout; contact details masked).
 *
 * A "layer" is a rectangle of the screenshot lifted out of the page: the
 * same image is redrawn, cropped, on top of the base and raised with a lime
 * edge and a shadow while the rest dims -- so a real component inside the
 * real product comes forward. Layers reuse the already-loaded image.
 *
 * Rects are in 1360x674 layout pixels.
 */

import type { CSSProperties, ReactNode } from "react";

export const SRC_W = 1360;
export const SRC_H = 674;
const DIR = "/marketing/screens";
const srcSet = (name: string) => `${DIR}/${name}-2000.webp 2000w, ${DIR}/${name}@2x.webp 2720w`;

export type ShotName =
  | "overview"
  | "conversation-sources"
  | "conversation-booking"
  | "conversation-handoff"
  | "leads"
  | "instagram";

export type Shot = { name: ShotName; alt: string };
export type Rect = { x: number; y: number; w: number; h: number; r?: number };

function Layer({ name, rect, on, delay, sizes }: { name: ShotName; rect: Rect; on: boolean; delay: number; sizes: string }) {
  const { x, y, w, h, r = 14 } = rect;
  const style: CSSProperties = {
    left: `${(x / SRC_W) * 100}%`,
    top: `${(y / SRC_H) * 100}%`,
    width: `${(w / SRC_W) * 100}%`,
    height: `${(h / SRC_H) * 100}%`,
    borderRadius: `calc(${r / SRC_W} * 100cqw * var(--zr, 1))`,
    transitionDelay: on ? `${delay}ms` : "0ms",
  };
  return (
    <div aria-hidden="true" className="site-layer" data-on={on} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element -- srcset of fixed 2x captures, already optimised WebP */}
      <img
        src={`${DIR}/${name}-2000.webp`}
        srcSet={srcSet(name)}
        sizes={sizes}
        alt=""
        width={SRC_W}
        height={SRC_H}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="absolute max-w-none select-none"
        style={{ width: `${(SRC_W / w) * 100}%`, left: `${(-x / w) * 100}%`, top: `${(-y / h) * 100}%` }}
      />
    </div>
  );
}

export function MacWindow({
  shots,
  active = 0,
  layers = {},
  lit = [],
  url = "aipilot.waveswebstudio.in/dashboard",
  priority = false,
  sizes = "(min-width: 1024px) 900px, 100vw",
  focus,
  zoomed = true,
  className = "",
  children,
}: {
  shots: readonly Shot[];
  active?: number;
  layers?: Record<number, readonly Rect[]>;
  lit?: readonly number[];
  url?: string;
  priority?: boolean;
  sizes?: string;
  focus?: { s: number; x: number; y: number };
  zoomed?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const activeLayers = layers[active] ?? [];
  const anyLit = lit.length > 0 && activeLayers.length > 0;

  return (
    <div className={`site-mac ${className}`}>
      <div className="site-mac-bar" aria-hidden="true">
        <span className="site-mac-dots">
          <i style={{ background: "#FF5F57" }} />
          <i style={{ background: "#FEBC2E" }} />
          <i style={{ background: "#28C840" }} />
        </span>
        <span className="site-mac-url">
          <svg viewBox="0 0 12 12" width="9" height="9" aria-hidden="true">
            <path d="M3.5 5V3.75a2.5 2.5 0 0 1 5 0V5M3 5h6v4.5H3z" fill="none" stroke="currentColor" strokeWidth="1.1" />
          </svg>
          {url}
        </span>
      </div>
      <div className="site-mac-screen">
        <div
          className="site-mac-zoom"
          data-focus={focus ? "true" : undefined}
          data-zoomed={zoomed}
          style={focus ? ({ "--zs": focus.s, "--zx": `${focus.x}%`, "--zy": `${focus.y}%` } as CSSProperties) : undefined}
        >
          {shots.map((shot, i) => (
            <div
              key={shot.name}
              aria-hidden={i === active ? undefined : "true"}
              className={`site-mac-shot ${i === 0 ? "relative" : "absolute inset-0"}`}
              data-on={i === active}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- see Layer */}
              <img
                src={`${DIR}/${shot.name}-2000.webp`}
                srcSet={srcSet(shot.name)}
                sizes={sizes}
                alt={shot.alt}
                width={SRC_W}
                height={SRC_H}
                loading={priority && i === 0 ? "eager" : "lazy"}
                fetchPriority={priority && i === 0 ? "high" : undefined}
                decoding="async"
                draggable={false}
                className="block h-auto w-full select-none"
              />
            </div>
          ))}
          <div aria-hidden="true" className="site-mac-dim" data-on={anyLit} />
          {shots.map((shot, i) =>
            (layers[i] ?? []).map((rect, j) => (
              <Layer
                key={`${shot.name}-${j}`}
                name={shot.name}
                rect={rect}
                on={i === active && lit.includes(j)}
                delay={j * 140}
                sizes={sizes}
              />
            )),
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Zoom target for small screens: centre of the rects, scaled to fit them. */
export function focusFor(rects: readonly Rect[], max = 1.9) {
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  const s = Math.max(1, Math.min(max, SRC_W / ((x1 - x0) * 1.15), SRC_H / ((y1 - y0) * 1.15)));
  return {
    s: +s.toFixed(3),
    x: +((((x0 + x1) / 2) / SRC_W) * 100).toFixed(2),
    y: +((((y0 + y1) / 2) / SRC_H) * 100).toFixed(2),
  };
}

/** The real screens used across the site, with their lift-out rects. */
export const SCREENS = {
  overview: {
    shot: { name: "overview", alt: "Waves AI Pilot dashboard overview: conversations, leads, conversion rate, recent activity and lead pipeline" },
    rects: [
      { x: 288, y: 182, w: 245, h: 120, r: 24 },
      { x: 553, y: 182, w: 245, h: 120, r: 24 },
      { x: 818, y: 182, w: 245, h: 120, r: 24 },
      { x: 995, y: 333, w: 333, h: 341, r: 24 },
    ],
  },
  sources: {
    shot: { name: "conversation-sources", alt: "A conversation where the AI reply shows the approved sources it used" },
    rects: [{ x: 672, y: 344, w: 348, h: 330, r: 14 }],
  },
  leads: {
    shot: { name: "leads", alt: "Leads table with an AI-assessed hot lead and its details panel" },
    rects: [
      { x: 308, y: 381, w: 503, h: 89, r: 0 },
      { x: 848, y: 182, w: 480, h: 492, r: 24 },
    ],
  },
  booking: {
    shot: { name: "conversation-booking", alt: "A conversation where the AI confirms a call for Wednesday at 10:30 AM" },
    rects: [
      { x: 672, y: 288, w: 348, h: 115, r: 16 },
      { x: 1057, y: 265, w: 287, h: 293, r: 16 },
      { x: 1057, y: 570, w: 287, h: 104, r: 16 },
    ],
  },
  handoff: {
    shot: { name: "conversation-handoff", alt: "A conversation in human-controlled mode with a team reply being written" },
    rects: [
      { x: 592, y: 140, w: 434, h: 44, r: 22 },
      { x: 588, y: 619, w: 440, h: 55, r: 16 },
    ],
  },
  instagram: {
    shot: { name: "instagram", alt: "Instagram channel connected in Waves AI Pilot" },
    rects: [{ x: 288, y: 182, w: 567, h: 393, r: 24 }],
  },
} as const satisfies Record<string, { shot: Shot; rects: readonly Rect[] }>;
