"use client";

import { useMemo, useState } from "react";
import { DataTable, TableRow, TableCell, type SortState } from "@/app/(dashboard)/dashboard/_components/data-table";
import { Badge } from "@/app/(dashboard)/dashboard/_components/badge";
import { ConfirmActionDialog } from "../_components/confirm-action-dialog";
import { disableUser, enableUser, forceLogoutUser } from "@/lib/admin-user-actions";
import type { AdminUserRow } from "@/lib/admin-users";
import type { PlatformAdminRole } from "@/lib/supabase/types";

const COLUMNS = [
  { key: "email", label: "User", sortable: true, width: "2fr" },
  { key: "businessName", label: "Tenant", sortable: true },
  { key: "role", label: "Role", sortable: true },
  { key: "lastSignInAt", label: "Last login", sortable: true },
  { key: "mfa", label: "MFA" },
  { key: "actions", label: "" },
];

export function UserList({ users, adminRole }: { users: AdminUserRow[]; adminRole: PlatformAdminRole }) {
  const [sort, setSort] = useState<SortState>({ key: "lastSignInAt", direction: "desc" });
  const canMutate = adminRole !== "viewer";

  const sorted = useMemo(() => {
    if (!sort) return users;
    const sortedRows = [...users].sort((a, b) => {
      const av = String(a[sort.key as keyof AdminUserRow] ?? "");
      const bv = String(b[sort.key as keyof AdminUserRow] ?? "");
      return av.localeCompare(bv);
    });
    return sort.direction === "asc" ? sortedRows : sortedRows.reverse();
  }, [users, sort]);

  return (
    <DataTable
      items={sorted}
      columns={COLUMNS}
      getRowId={(u) => `${u.userId}-${u.businessId}`}
      sort={sort}
      onSortChange={setSort}
      caption="Users"
      emptyState="No users found."
      renderRow={(u) => (
        <TableRow>
          <TableCell direction="col">
            <span className="font-medium text-ds-text-primary">{u.email}</span>
            <span className="text-xs text-ds-text-muted">{[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}</span>
          </TableCell>
          <TableCell>{u.businessName}</TableCell>
          <TableCell>{u.role.replace("org:", "")}</TableCell>
          <TableCell>{u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleDateString() : "Never"}</TableCell>
          <TableCell>
            <Badge tone={u.twoFactorEnabled ? "success" : "muted"}>{u.twoFactorEnabled ? "On" : "Off"}</Badge>
          </TableCell>
          <TableCell>
            {canMutate ? (
              <div className="flex gap-1.5">
                {u.banned ? (
                  <ConfirmActionDialog
                    trigger={(open) => (
                      <button type="button" onClick={open} className="text-xs font-medium text-ds-text-secondary hover:text-ds-text-primary">
                        Re-enable
                      </button>
                    )}
                    title="Re-enable this user"
                    description={`${u.email} will be able to sign in again.`}
                    onConfirm={(reason) => enableUser(u.userId, reason)}
                  />
                ) : (
                  <ConfirmActionDialog
                    trigger={(open) => (
                      <button type="button" onClick={open} className="text-xs font-medium text-ds-text-secondary hover:text-ds-text-primary">
                        Disable
                      </button>
                    )}
                    title="Disable this user"
                    description={`${u.email} will be unable to sign in to any tenant until re-enabled.`}
                    dangerous
                    onConfirm={(reason) => disableUser(u.userId, reason)}
                  />
                )}
                <ConfirmActionDialog
                  trigger={(open) => (
                    <button type="button" onClick={open} className="text-xs font-medium text-ds-text-secondary hover:text-ds-text-primary">
                      Force logout
                    </button>
                  )}
                  title="Force logout this user"
                  description={`Revokes every active session for ${u.email}. They will need to sign in again.`}
                  onConfirm={(reason) => forceLogoutUser(u.userId, reason)}
                />
              </div>
            ) : null}
          </TableCell>
        </TableRow>
      )}
    />
  );
}
