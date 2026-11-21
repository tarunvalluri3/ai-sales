import { ToastProvider } from "../dashboard/_components/toast";
import "./onboarding.css";

/**
 * `/onboarding` renders its own header/nav (WizardShell) rather than the
 * dashboard shell, so it never picked up `dashboard/layout.tsx`'s
 * `ToastProvider` -- `PlanStep` reuses `BillingPanel` as-is, which calls
 * `useToast()` for its copy-to-clipboard feedback, and threw
 * "useToast() must be used within a ToastProvider" the moment that ran
 * outside `/dashboard/*`. The wizard shares the dashboard palette and
 * primitives through .dash-shell.
 */
export default function OnboardingLayout({ children }: LayoutProps<"/onboarding">) {
  return (
    <div className="dash-shell onboarding-shell flex flex-1 flex-col">
      <ToastProvider>{children}</ToastProvider>
    </div>
  );
}
