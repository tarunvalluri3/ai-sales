import { requireBusinessContext } from "@/lib/business-context";
import { Sidebar } from "./_components/sidebar";
import { MobileNav } from "./_components/mobile-nav";
import { AttentionProvider } from "./_components/attention-provider";
import { ToastProvider } from "./_components/toast";
import { DashboardHeader } from "./_components/dashboard-header";
import { ContactEmailGate } from "./_components/contact-email-gate";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const { businessName, contactEmail } = await requireBusinessContext();

  return (
    <ToastProvider>
      <AttentionProvider>
        <div className="flex min-h-0 flex-1 flex-col">
          <DashboardHeader />
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <Sidebar businessName={businessName} />
            <MobileNav businessName={businessName} />
            <main className="flex min-w-0 flex-1 flex-col">{children}</main>
          </div>
        </div>
        {/* Every business-facing email depends on contact_email, so a business
            without one silently receives nothing -- the exact failure that
            prompted this work. The value is read on the server; the gate is a
            client component only because a server layout cannot read the
            pathname, and it must not block the very page that fixes it. */}
        <ContactEmailGate hasContactEmail={Boolean(contactEmail)} />
      </AttentionProvider>
    </ToastProvider>
  );
}
