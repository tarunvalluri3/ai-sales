import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type Crumb = {
  label: string;
  href?: string;
};

/** `href` omitted on the final (current page) crumb. Always starts from "Admin" (/apache) implicitly -- callers pass only the trail after it. */
export function AdminBreadcrumbs({ trail }: { trail: Crumb[] }) {
  const crumbs: Crumb[] = [{ label: "Admin", href: "/apache" }, ...trail];

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-ds-text-muted">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 ? <ChevronRight className="size-3" aria-hidden="true" /> : null}
            {crumb.href && !isLast ? (
              <Link href={crumb.href} className="transition-colors hover:text-ds-text-primary">
                {crumb.label}
              </Link>
            ) : (
              <span aria-current={isLast ? "page" : undefined} className={isLast ? "text-ds-text-secondary" : undefined}>
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
