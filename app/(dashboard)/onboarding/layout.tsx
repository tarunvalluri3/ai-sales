import { ToastProvider } from "../dashboard/_components/toast";

/**
 * `/onboarding` renders its own header/nav (WizardShell) rather than the
 * dashboard shell, so it never picked up `dashboard/layout.tsx`'s
 * `ToastProvider` -- `PlanStep` reuses `BillingPanel` as-is, which calls
 * `useToast()` for its copy-to-clipboard feedback, and threw
 * "useToast() must be used within a ToastProvider" the moment that ran
 * outside `/dashboard/*` (found live copying the widget embed snippet on
 * the review step, 2026-10-29 bugfix, STATE.md). Only the provider is
 * needed here, not the rest of the dashboard chrome.
 */
export default function OnboardingLayout({ children }: LayoutProps<"/onboarding">) {
  return <ToastProvider>{children}</ToastProvider>;
}
