/**
 * Waves AI Pilot -- the logo system, in one place.
 *
 * The mark is a lime hub at the centre of a dashed orbit with three nodes
 * underneath: signal radiating out, a pilot circling the business, the Waves
 * constellation carried into the product.
 *
 * WHY THE COLOURS ARE HARDCODED HERE and not read from the `--ds-*` tokens in
 * globals.css, even though every one of them is byte-identical today
 * (--ds-accent #d7f24e, --ds-ivory #f3ede0, --ds-text-secondary #a8a190,
 * --ds-bg #100f0c): a logo is a fixed asset, not a themed surface. The logo
 * system's first usage rule is "never recolor the hub", so the mark must keep
 * rendering in brand colours even if a future pass retunes the UI palette.
 * The *wordmark* deliberately goes the other way and does use the text tokens
 * -- it is typography and should sit with the rest of the interface text.
 *
 * WHY THERE IS A SCALE TABLE instead of one SVG scaled with CSS: the design
 * thickens every stroke as the mark gets smaller, so the dotted orbit and the
 * three spokes stay visible at 16px instead of dissolving. Each row below is
 * transcribed from the logo system sheet rather than interpolated.
 *
 * The icon files (app/icon.svg, app/favicon.ico, app/apple-icon.png and
 * public/brand/*) were generated from the `icon*` rows of this same table.
 * If a row changes here, those files have to be regenerated -- they are build
 * artifacts of this table, not independent drawings.
 */

/** The mark's own coordinate space. Every geometry value below is in these units. */
const VIEW_BOX = "4 8 132 98";
const VIEW_BOX_WIDTH = 132;
const VIEW_BOX_HEIGHT = 98;

export type WavesMarkScale = "lockup" | "nav" | "iconLg" | "iconMd" | "iconSm" | "iconXs";

type MarkGeometry = {
  /** Default rendered width in CSS px. Height is always derived from the view box. */
  width: number;
  orbitWidth: number;
  /** Gap between the outer orbit's dots. 0 draws the orbit solid instead. */
  orbitDash: number;
  orbitOpacity: number;
  innerWidth: number;
  innerOpacity: number;
  spokeWidth: number;
  nodeRadius: number;
  hubRadius: number;
};

/**
 * Transcribed from the logo system sheet. The `icon*` rows are named for the
 * tile they were drawn inside, not for the mark's own width.
 */
export const WAVES_MARK_SCALES: Record<WavesMarkScale, MarkGeometry> = {
  /** Primary lockups -- headers, decks, email signature. */
  lockup: {
    width: 82,
    orbitWidth: 3.45,
    orbitDash: 7.2,
    orbitOpacity: 0.55,
    innerWidth: 2.5,
    innerOpacity: 0.22,
    spokeWidth: 3.5,
    nodeRadius: 6.5,
    hubRadius: 10,
  },
  /** Site header, both breakpoints. */
  nav: {
    width: 36,
    orbitWidth: 5.175,
    orbitDash: 10.8,
    orbitOpacity: 0.7,
    innerWidth: 3.75,
    innerOpacity: 0.3,
    spokeWidth: 5.25,
    nodeRadius: 7.4,
    hubRadius: 11.2,
  },
  /** Drawn for a 96px tile -- the app icon and social avatar. */
  iconLg: {
    width: 76,
    orbitWidth: 4.14,
    orbitDash: 8.6,
    orbitOpacity: 0.7,
    innerWidth: 3,
    innerOpacity: 0.3,
    spokeWidth: 4.2,
    nodeRadius: 7.22,
    hubRadius: 10.96,
  },
  /** Drawn for a 64px tile. */
  iconMd: {
    width: 52,
    orbitWidth: 5.52,
    orbitDash: 11.5,
    orbitOpacity: 0.7,
    innerWidth: 4,
    innerOpacity: 0.3,
    spokeWidth: 5.6,
    nodeRadius: 7.46,
    hubRadius: 11.28,
  },
  /**
   * Drawn for a 32px tile. SOLID orbits -- and this is the one place these
   * numbers depart from the sheet's exported SVG, deliberately, because the
   * sheet contradicts itself here and only one of the two readings survives
   * rasterization.
   *
   * The sheet's favicon caption says "orbits solid at 32/16", but its
   * exported code still carries `stroke-dasharray` at both sizes. Rendered
   * as exported, the dash period is ~1.6px at 32px and the dots antialias
   * into a grey smear; at 16px the whole mark becomes an unreadable blob.
   * Rendered per the caption, both sizes read cleanly. So the caption is
   * what is implemented, and the dash survives only at 48px and above,
   * where it genuinely resolves.
   *
   * Nothing is removed to get there -- both orbits, all three spokes and all
   * three nodes are still drawn, so the system's "orbits and nodes never
   * removed" rule holds. Only the dashing goes, and the opacities lift one
   * step further along the progression the sheet had already started
   * (.55/.22 at lockup, .7/.3 at the small sizes).
   */
  iconSm: {
    width: 27,
    orbitWidth: 5,
    orbitDash: 0,
    orbitOpacity: 0.8,
    innerWidth: 3.5,
    innerOpacity: 0.35,
    spokeWidth: 8.4,
    nodeRadius: 7.94,
    hubRadius: 11.92,
  },
  /** Drawn for a 16px tile -- the browser tab. Solid orbits, same reason. */
  iconXs: {
    width: 14,
    orbitWidth: 7,
    orbitDash: 0,
    orbitOpacity: 0.8,
    innerWidth: 4,
    innerOpacity: 0.35,
    spokeWidth: 11.9,
    nodeRadius: 8.54,
    hubRadius: 12.72,
  },
};

export type WavesMarkTone = "dark" | "light" | "lime";

type MarkPalette = {
  /** Orbits and spokes. */
  structure: string;
  /** The three nodes. */
  node: string;
  /** The hub -- lime everywhere except on the lime tile, where it inverts. */
  hub: string;
  /** Only set on light grounds, where lime alone would not hold its edge. */
  hubOutline: string | null;
  hubOutlineWidth: number;
  /** Compensates for the outline being centred on the hub's edge. */
  hubRadiusDelta: number;
  /** The sheet lifts both orbit opacities slightly on a light ground. */
  orbitOpacityScale: number;
};

const WAVES_MARK_TONES: Record<WavesMarkTone, MarkPalette> = {
  /** On charcoal -- the default, and every surface in this app. */
  dark: {
    structure: "#a8a190",
    node: "#f3ede0",
    hub: "#d7f24e",
    hubOutline: null,
    hubOutlineWidth: 0,
    hubRadiusDelta: 0,
    orbitOpacityScale: 1,
  },
  /** On ivory or white -- print, light decks, a light-themed third-party page. */
  light: {
    structure: "#6b6558",
    node: "#17150f",
    hub: "#d7f24e",
    hubOutline: "#17150f",
    hubOutlineWidth: 2.5,
    hubRadiusDelta: 0.5,
    orbitOpacityScale: 1.1,
  },
  /** Reversed out of a solid lime tile -- the app icon's primary form. */
  lime: {
    structure: "#14130c",
    node: "#14130c",
    hub: "#14130c",
    hubOutline: null,
    hubOutlineWidth: 0,
    hubRadiusDelta: 0,
    orbitOpacityScale: 1,
  },
};

/**
 * The mark on its own -- no name. Use this below 480px, in square spaces, and
 * anywhere the name is already present as adjacent text.
 *
 * Pass `title` only when the mark is the sole thing identifying the link or
 * surface. When it sits next to the wordmark it is decorative, and the default
 * `aria-hidden` is correct -- announcing "Waves AI Pilot" twice is worse than
 * not announcing it at all.
 */
export function WavesMark({
  scale = "nav",
  tone = "dark",
  width,
  title,
  className,
}: {
  scale?: WavesMarkScale;
  tone?: WavesMarkTone;
  width?: number;
  title?: string;
  className?: string;
}) {
  const geometry = WAVES_MARK_SCALES[scale];
  const palette = WAVES_MARK_TONES[tone];
  const renderWidth = width ?? geometry.width;
  const renderHeight = Math.round((renderWidth * VIEW_BOX_HEIGHT) / VIEW_BOX_WIDTH);
  const hubRadius = geometry.hubRadius + palette.hubRadiusDelta;

  return (
    <svg
      width={renderWidth}
      height={renderHeight}
      viewBox={VIEW_BOX}
      fill="none"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : "true"}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}

      {/* Outer orbit. A 0.01 dash with a round cap draws dots, not dashes;
          the two smallest scales set orbitDash to 0 and go solid instead. */}
      <ellipse
        cx="70"
        cy="56"
        rx="58"
        ry="42"
        transform="rotate(-12 70 56)"
        stroke={palette.structure}
        strokeWidth={geometry.orbitWidth}
        strokeDasharray={geometry.orbitDash ? `0.01 ${geometry.orbitDash}` : undefined}
        strokeLinecap={geometry.orbitDash ? "round" : undefined}
        opacity={geometry.orbitOpacity * palette.orbitOpacityScale}
      />
      {/* Inner orbit -- solid, and much fainter. */}
      <ellipse
        cx="70"
        cy="56"
        rx="40"
        ry="28"
        transform="rotate(-12 70 56)"
        stroke={palette.structure}
        strokeWidth={geometry.innerWidth}
        opacity={geometry.innerOpacity * palette.orbitOpacityScale}
      />

      {/* Three spokes, hub down to each node. */}
      <line x1="70" y1="42" x2="46" y2="86" stroke={palette.structure} strokeWidth={geometry.spokeWidth} strokeLinecap="round" />
      <line x1="70" y1="42" x2="70" y2="86" stroke={palette.structure} strokeWidth={geometry.spokeWidth} strokeLinecap="round" />
      <line x1="70" y1="42" x2="94" y2="86" stroke={palette.structure} strokeWidth={geometry.spokeWidth} strokeLinecap="round" />

      <circle cx="46" cy="86" r={geometry.nodeRadius} fill={palette.node} />
      <circle cx="70" cy="86" r={geometry.nodeRadius} fill={palette.node} />
      <circle cx="94" cy="86" r={geometry.nodeRadius} fill={palette.node} />

      <circle
        cx="70"
        cy="42"
        r={hubRadius}
        fill={palette.hub}
        stroke={palette.hubOutline ?? undefined}
        strokeWidth={palette.hubOutline ? palette.hubOutlineWidth : undefined}
      />
    </svg>
  );
}

/**
 * The name, set the one way it is allowed to be set: Geist, 600 for "Waves",
 * 400 and a step back in colour for "AI Pilot".
 *
 * Size and tracking come from the caller's `className` -- the lockups below
 * pass the pairing the sheet specifies for each scale.
 */
export function WavesWordmark({
  tone = "dark",
  className,
}: {
  tone?: WavesMarkTone;
  className?: string;
}) {
  const onLight = tone === "light" || tone === "lime";

  // `whitespace-nowrap` sits on the two inner spans rather than on the wrapper,
  // because the wrapper is where `not-sr-only` lands in the responsive lockup
  // below -- and `not-sr-only` resets `white-space` to `normal`, which would
  // quietly win or lose depending on utility order. Keeping the two off the
  // same element removes the question.
  return (
    <span className={className}>
      <span className={`whitespace-nowrap font-semibold ${onLight ? "text-[#17150f]" : "text-ds-text-primary"}`}>
        Waves
      </span>
      <span className={`whitespace-nowrap font-normal ${onLight ? "text-[#6b6558]" : "text-ds-text-secondary"}`}>
        {" "}
        AI Pilot
      </span>
    </span>
  );
}

/**
 * Each pairing of mark size, name size and gap, exactly as the sheet sets
 * them. `markWidth` is only set where the sheet draws the mark at a width
 * other than its scale's default -- the stacked lockup uses the lockup stroke
 * weights at 100px rather than 82px.
 */
const WAVES_LOCKUPS: Record<
  "horizontal" | "stacked",
  Record<"nav" | "lockup", { layout: string; markScale: WavesMarkScale; markWidth?: number; name: string }>
> = {
  horizontal: {
    nav: { layout: "items-center gap-2.5", markScale: "nav", name: "text-base leading-none tracking-[-0.015em]" },
    lockup: {
      layout: "items-center gap-[18px]",
      markScale: "lockup",
      name: "text-[30px] leading-none tracking-[-0.025em]",
    },
  },
  stacked: {
    nav: {
      layout: "flex-col items-center gap-2",
      markScale: "nav",
      name: "text-base leading-none tracking-[-0.015em]",
    },
    lockup: {
      layout: "flex-col items-center gap-4",
      markScale: "lockup",
      markWidth: 100,
      name: "text-[26px] leading-none tracking-[-0.025em]",
    },
  },
};

/**
 * Mark plus name. `horizontal` is the default and belongs in headers, decks
 * and email signatures; `stacked` is for square spaces, covers and social
 * avatars that still carry the name.
 *
 * `collapseNameOnMobile` implements the sheet's "name drops out under 480px"
 * rule. It hides the name *visually* rather than removing it, so the link
 * keeps its accessible name at every width -- a mark-only link that announces
 * nothing would be a regression, not a responsive refinement.
 */
export function WavesLogo({
  variant = "horizontal",
  size = "nav",
  tone = "dark",
  collapseNameOnMobile = false,
  className,
}: {
  variant?: "horizontal" | "stacked";
  size?: "nav" | "lockup";
  tone?: WavesMarkTone;
  collapseNameOnMobile?: boolean;
  className?: string;
}) {
  const preset = WAVES_LOCKUPS[variant][size];

  return (
    <span className={`flex ${preset.layout} ${className ?? ""}`}>
      <WavesMark scale={preset.markScale} width={preset.markWidth} tone={tone} className="shrink-0" />
      <WavesWordmark
        tone={tone}
        className={`shrink-0 ${preset.name} ${collapseNameOnMobile ? "sr-only min-[480px]:not-sr-only" : ""}`}
      />
    </span>
  );
}
