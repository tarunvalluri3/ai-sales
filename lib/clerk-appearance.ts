/**
 * Web Studio theme for Clerk's prebuilt components (SignIn, SignUp,
 * TaskChooseOrganization, OrganizationSwitcher, UserButton), so they read as
 * part of the same product. Element classes use the app's CSS variables
 * (`var(--ds-*)`), so they flip with the light/dark theme. Clerk's
 * `variables` API cannot reliably resolve CSS custom properties, so the few
 * literals below are the DARK theme values from
 * `app/(dashboard)/globals.css` and must be kept in sync by hand; every
 * element that is visible in both themes is overridden by a class instead.
 * Styling only; no auth behavior changes.
 *
 * Untyped (no `Appearance` import): `@clerk/types` isn't a resolvable
 * top-level module in this install, and `@clerk/nextjs` doesn't re-export
 * the type. Every consumer passes this straight into a component's own
 * `appearance` prop, which structurally typechecks the object there.
 */
const INPUT =
  "!rounded-none !bg-transparent !text-[var(--ds-text-primary)] !border-[var(--ds-border)] focus:!border-[var(--ds-text-primary)] !shadow-none";
const POPOVER =
  "!rounded-[1rem] !bg-[var(--ds-surface)] !border !border-[var(--ds-border)] !shadow-[0_24px_64px_rgba(0,0,0,0.45)]";

export const clerkDarkAppearance = {
  variables: {
    colorPrimary: "#dc2626",
    colorBackground: "#111110",
    colorInputBackground: "#0c0c0b",
    colorInputText: "#f5f4f0",
    colorText: "#f5f4f0",
    colorTextSecondary: "#a6a49c",
    colorNeutral: "#f5f4f0",
    colorDanger: "#dc2626",
    colorSuccess: "#8fa67e",
    colorWarning: "#c9a15a",
    borderRadius: "0",
    fontFamily: "var(--font-hanken), system-ui, sans-serif",
  },
  elements: {
    card: "!rounded-none !bg-[var(--ds-surface)] !shadow-none !border !border-[var(--ds-border)]",
    headerTitle: "!text-[var(--ds-text-primary)] !font-light",
    headerSubtitle: "!text-[var(--ds-text-secondary)]",
    footer: "!bg-transparent",
    footerActionText: "!text-[var(--ds-text-secondary)]",
    footerActionLink: "!text-[var(--ds-text-primary)] hover:!text-[var(--ds-accent)]",
    formFieldLabel: "!text-[var(--ds-text-faint)] !uppercase !tracking-[0.12em] !text-xs !font-medium",
    formFieldInput: INPUT,
    formFieldInputShowPasswordButton: "!text-[var(--ds-text-secondary)]",
    formFieldHintText: "!text-[var(--ds-text-faint)]",
    formFieldErrorText: "!text-[var(--ds-danger)]",
    identityPreviewText: "!text-[var(--ds-text-primary)]",
    identityPreviewEditButton: "!text-[var(--ds-text-primary)]",
    formButtonPrimary:
      "!rounded-none !bg-[var(--ds-primary)] !text-[var(--ds-primary-on)] hover:!bg-[var(--ds-primary-hover)] !shadow-none !uppercase !tracking-[0.18em] !text-[13px] !font-medium !h-12",
    socialButtonsBlockButton: `${INPUT} !border-[var(--ds-border-strong)]`,
    socialButtonsBlockButtonText: "!text-[var(--ds-text-primary)]",
    dividerLine: "!bg-[var(--ds-border)]",
    dividerText: "!text-[var(--ds-text-faint)]",
    otpCodeFieldInput: INPUT,
    alternativeMethodsBlockButtonText: "!text-[var(--ds-text-primary)]",
    navbarButton: "!text-[var(--ds-text-primary)]",
    profileSectionTitleText: "!text-[var(--ds-text-primary)]",
    profileSectionContent: "!text-[var(--ds-text-secondary)]",
    userButtonPopoverCard: POPOVER,
    organizationSwitcherPopoverCard: POPOVER,
  },
};

/** Slim variant for compact UI (OrganizationSwitcher, UserButton) inside the dashboard's own shell. */
export const clerkDarkCompactAppearance = {
  variables: clerkDarkAppearance.variables,
  elements: {
    ...clerkDarkAppearance.elements,
    userButtonBox: "flex-row-reverse",
    userButtonOuterIdentifier: "!text-[var(--ds-text-primary)] text-sm",
    organizationSwitcherTrigger: "!text-[var(--ds-text-primary)] hover:!bg-[var(--ds-surface-raised)] !rounded-none px-2 py-1",
    organizationPreviewMainIdentifier: "!text-[var(--ds-text-primary)] text-sm",
    organizationSwitcherTriggerIcon: "!text-[var(--ds-text-secondary)]",
  },
};

/**
 * Customer dashboard (/dashboard/*) variant: the dashboard is light-only with
 * rounded white surfaces and deep olive actions (globals.css, .dash-shell), so
 * the literals here are that palette rather than the dark Web Studio one.
 * The header trigger uses the --ds-* CSS variables so it follows the
 * dashboard's light/dark theme; the popover cards stay light because Clerk
 * 7.7.3 derives its internal shades from the `variables` values in JS, which
 * cannot resolve CSS variables.
 */
const DASHBOARD_POPOVER =
  "!rounded-[1rem] !bg-white !border !border-[#eceeec] !shadow-[0_18px_48px_rgba(21,23,19,0.14)]";

export const clerkDashboardAppearance = {
  variables: {
    colorPrimary: "#203509",
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    colorInputText: "#151713",
    colorText: "#151713",
    colorTextSecondary: "#5c6158",
    colorNeutral: "#151713",
    colorDanger: "#c2412d",
    colorSuccess: "#1f7a4c",
    colorWarning: "#8a5a00",
    borderRadius: "0.75rem",
    fontFamily: "var(--font-hanken), system-ui, sans-serif",
  },
  elements: {
    userButtonPopoverCard: DASHBOARD_POPOVER,
    organizationSwitcherPopoverCard: DASHBOARD_POPOVER,
    userButtonAvatarBox: "!size-9",
    organizationSwitcherTrigger:
      "!h-9 !rounded-full !border !border-[var(--ds-border)] !bg-[var(--ds-surface)] !px-3 !text-[var(--ds-text-primary)] hover:!bg-[var(--ds-surface-soft)]",
    organizationPreviewMainIdentifier: "!text-[var(--ds-text-primary)] !text-sm !font-medium",
    organizationSwitcherTriggerIcon: "!text-[var(--ds-text-secondary)]",
  },
};

const waveElements = {
  rootBox: "wave-clerk-root",
  cardBox: "wave-clerk-card-box",
  card: "wave-clerk-card",
  headerTitle: "wave-clerk-ink",
  headerSubtitle: "wave-clerk-muted",
  formFieldLabel: "wave-clerk-ink",
  formFieldInput: "wave-clerk-input",
  otpCodeFieldInput: "wave-clerk-input",
  formButtonPrimary: "wave-clerk-primary",
  socialButtonsBlockButton: "wave-clerk-secondary",
  socialButtonsBlockButtonText: "wave-clerk-ink",
  dividerText: "wave-clerk-muted",
  footer: "wave-clerk-footer",
  footerActionText: "wave-clerk-muted",
  footerActionLink: "wave-clerk-link",
  formFieldAction: "wave-clerk-link",
  userButtonPopoverCard: "wave-clerk-card",
  userButtonAvatarBox: "!size-9",
};

const waveVariables = {
  borderRadius: "0.75rem",
  fontFamily: "var(--font-hanken), system-ui, sans-serif",
};

// Clerk derives shades from concrete colors. These match the two .dash-shell palettes.
export const waveClerkAppearance = {
  dark: {
    elements: waveElements,
    variables: {
      ...waveVariables,
      colorPrimary: "#b2ff38",
      colorPrimaryForeground: "#11160a",
      colorBackground: "#161913",
      colorInput: "#1b1f17",
      colorInputForeground: "#eef1ea",
      colorForeground: "#eef1ea",
      colorMutedForeground: "#aab1a2",
      colorNeutral: "#eef1ea",
      colorDanger: "#f2806d",
      colorSuccess: "#4fcf8c",
      colorWarning: "#f2b84b",
    },
  },
  light: {
    elements: waveElements,
    variables: {
      ...waveVariables,
      colorPrimary: "#203509",
      colorPrimaryForeground: "#ffffff",
      colorBackground: "#ffffff",
      colorInput: "#ffffff",
      colorInputForeground: "#151713",
      colorForeground: "#151713",
      colorMutedForeground: "#5c6158",
      colorNeutral: "#151713",
      colorDanger: "#b23a26",
      colorSuccess: "#1f7a4c",
      colorWarning: "#8a5a00",
    },
  },
};
