import { requireBusinessContext } from "@/lib/business-context";
import { Sidebar } from "./_components/sidebar";
import { MobileNav } from "./_components/mobile-nav";
import { AttentionProvider } from "./_components/attention-provider";
import { ToastProvider } from "./_components/toast";

/**
 * `<main>` is the dashboard's one true scroll container (2026-09-11
 * follow-up, after three failed attempts to give the conversations page
 * specifically a "fixed shell, only its own content scrolls" feel via
 * `sticky` tricks and, worse, a `document.documentElement.style.overflow`
 * mutation that leaked across routes when its cleanup didn't reliably
 * run before the next page rendered -- a real, user-caught regression
 * that broke scrolling app-wide. Root problem: `body` (app/(dashboard)/layout.tsx)
 * is `min-h-full`, not a bounded height, so nothing below it in the tree
 * can get a real "rest of the viewport" size without either fighting
 * that (fragile) or fixing it structurally here (robust).
 *
 * This row is bounded to exactly `100vh - SiteHeader's pinned height`
 * (`--header-height`, globals.css) at every breakpoint -- on mobile,
 * `MobileNav`'s own bar and `<main>` are plain flex siblings within this
 * same bounded row, so flexbox automatically gives `<main>` "whatever's
 * left" with no separate calc needed. `<main>` owns `overflow-y-auto`:
 * every other dashboard page's content scrolls exactly as it already did
 * (this only moves scrollbar ownership from the page/`body` to `<main>`,
 * invisible to a normal CRUD page), while a page that sizes its own
 * content to `h-full` (the conversations inbox) never triggers it at
 * all -- its own internal panes scroll instead, achieving a real fixed
 * shell with no per-route JS, no leak risk, nothing to clean up.
 */
export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const { businessName } = await requireBusinessContext();

  return (
    <ToastProvider>
      <AttentionProvider>
        <div className="flex h-[calc(100vh_-_var(--header-height))] min-h-0 flex-1 flex-col md:flex-row">
          <Sidebar businessName={businessName} />
          <MobileNav businessName={businessName} />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">{children}</main>
        </div>
      </AttentionProvider>
    </ToastProvider>
  );
}
