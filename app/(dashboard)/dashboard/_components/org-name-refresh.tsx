"use client";

import { useEffect, useRef } from "react";
import { useOrganization } from "@clerk/nextjs";

/**
 * The server renames the Clerk organization after the business name is saved
 * (lib/clerk-org-name.ts), but the browser's cached organization object keeps
 * the old name until it is reloaded. When the two differ, reload it once so
 * the organization switcher catches up. Renders nothing.
 */
export function OrgNameRefresh({ businessName }: { businessName: string }) {
  const { organization } = useOrganization();
  const reloadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!organization || organization.name === businessName) return;
    if (reloadedFor.current === organization.id) return;
    reloadedFor.current = organization.id;
    organization.reload().catch(() => {});
  }, [organization, businessName]);

  return null;
}
