/**
 * Dark, lime-accented theme for Clerk's prebuilt components (SignIn,
 * SignUp, TaskChooseOrganization, OrganizationSwitcher, UserButton), so
 * they read as part of the same product as the rest of the app rather than
 * a default Clerk-branded widget. Literal hex values, mirroring
 * `app/(dashboard)/globals.css`'s `--ds-*` tokens -- Clerk's `variables`
 * API does not reliably resolve CSS custom properties, so these must be
 * kept in sync by hand. Styling only; no auth behavior changes.
 *
 * Untyped (no `Appearance` import): `@clerk/types` isn't a resolvable
 * top-level module in this install, and `@clerk/nextjs` doesn't re-export
 * the type. Every consumer passes this straight into a component's own
 * `appearance` prop, which structurally typechecks the object there.
 */
export const clerkDarkAppearance = {
  variables: {
    colorPrimary: "#d7f24e",
    colorBackground: "#17150f",
    colorInputBackground: "#1e1b13",
    colorInputText: "#f2ede1",
    colorText: "#f2ede1",
    colorTextSecondary: "#a8a190",
    colorNeutral: "#f2ede1",
    colorDanger: "#e0664f",
    colorSuccess: "#9ecb4f",
    colorWarning: "#d9a94f",
    borderRadius: "0.625rem",
    fontFamily: "var(--font-geist-sans), Arial, Helvetica, sans-serif",
  },
  elements: {
    card: "!bg-[#17150f] shadow-none border border-[#f2ede11a]",
    headerTitle: "!text-[#f2ede1]",
    headerSubtitle: "!text-[#a8a190]",
    footer: "!bg-transparent",
    footerActionText: "text-[#a8a190]",
    footerActionLink: "text-[#d7f24e] hover:text-[#e8ff5e]",
    formFieldLabel: "!text-[#a8a190]",
    formFieldInput: "!bg-[#1e1b13] !text-[#f2ede1] !border-[#f2ede11a]",
    formFieldInputShowPasswordButton: "!text-[#a8a190]",
    formFieldHintText: "!text-[#746e5f]",
    formFieldErrorText: "!text-[#e0664f]",
    identityPreviewText: "!text-[#f2ede1]",
    identityPreviewEditButton: "!text-[#d7f24e]",
    formButtonPrimary: "!bg-[#d7f24e] !text-[#14130c] hover:!bg-[#e8ff5e] !shadow-none normal-case",
    socialButtonsBlockButton: "!bg-[#1e1b13] !text-[#f2ede1] !border-[#f2ede11a]",
    socialButtonsBlockButtonText: "!text-[#f2ede1]",
    dividerLine: "!bg-[#f2ede11a]",
    dividerText: "!text-[#746e5f]",
    otpCodeFieldInput: "!bg-[#1e1b13] !text-[#f2ede1] !border-[#f2ede11a]",
    alternativeMethodsBlockButtonText: "!text-[#f2ede1]",
    navbarButton: "!text-[#f2ede1]",
    profileSectionTitleText: "!text-[#f2ede1]",
    profileSectionContent: "!text-[#a8a190]",
  },
};

/** Slim variant for compact UI (OrganizationSwitcher, UserButton) inside the dashboard's own dark shell. */
export const clerkDarkCompactAppearance = {
  variables: clerkDarkAppearance.variables,
  elements: {
    ...clerkDarkAppearance.elements,
    userButtonBox: "flex-row-reverse",
    userButtonOuterIdentifier: "text-[#f2ede1] text-sm",
    organizationSwitcherTrigger: "text-[#f2ede1] hover:!bg-[#262218] rounded-md px-2 py-1",
    organizationPreviewMainIdentifier: "text-[#f2ede1] text-sm",
    organizationSwitcherTriggerIcon: "text-[#a8a190]",
  },
};
