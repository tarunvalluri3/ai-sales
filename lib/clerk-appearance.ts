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
  "!rounded-2xl !bg-[var(--ds-surface)] !border !border-[var(--ds-border)] !shadow-[0_24px_64px_rgba(0,0,0,0.45)]";

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
