import { requireBusinessContext } from "@/lib/business-context";
import { Sidebar } from "./_components/sidebar";
import { MobileNav } from "./_components/mobile-nav";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const { businessName } = await requireBusinessContext();

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <Sidebar businessName={businessName} />
      <MobileNav businessName={businessName} />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
