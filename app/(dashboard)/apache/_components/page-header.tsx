import type { ReactNode } from "react";

/** Consistent page header for every /apache page: title, description, optional primary actions. Mirrors the inline pattern app/(dashboard)/dashboard pages already use, extracted into one component since /apache has ~13 pages that must all match exactly. */
export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">{title}</h1>
        {description ? <p className="text-sm text-ds-text-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
