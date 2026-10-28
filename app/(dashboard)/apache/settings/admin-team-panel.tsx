"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Badge } from "@/app/(dashboard)/dashboard/_components/badge";
import { addPlatformAdminByEmail, updatePlatformAdminRole, removePlatformAdmin } from "@/lib/admin-team-actions";
import type { AdminTeamMember } from "@/lib/admin-team";
import type { PlatformAdminRole } from "@/lib/supabase/types";

const ROLE_OPTIONS: PlatformAdminRole[] = ["owner", "support", "viewer"];

export function AdminTeamPanel({ team, currentUserId }: { team: AdminTeamMember[]; currentUserId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRoleChange(userId: string, role: PlatformAdminRole) {
    setError(null);
    startTransition(async () => {
      const result = await updatePlatformAdminRole(userId, role);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  function handleRemove(userId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removePlatformAdmin(userId);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-sm text-ds-danger">{error}</p> : null}

      <ul className="flex flex-col gap-2">
        {team.map((member) => (
          <li key={member.user_id} className="flex items-center justify-between gap-3 rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-2 text-sm">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-2 truncate text-ds-text-primary">
                {member.email ?? member.user_id}
                {member.user_id === currentUserId ? <Badge tone="muted" size="sm">you</Badge> : null}
              </span>
              <span className="text-xs text-ds-text-muted">Added {new Date(member.created_at).toLocaleDateString()}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <select
                value={member.role}
                disabled={isPending}
                onChange={(e) => handleRoleChange(member.user_id, e.target.value as PlatformAdminRole)}
                className="rounded-ds-sm border border-ds-border bg-ds-bg px-2 py-1 text-sm text-ds-text-primary"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <button type="button" disabled={isPending} onClick={() => handleRemove(member.user_id)} className="text-xs font-medium text-ds-danger hover:underline">
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <AddAdminForm onAdded={() => router.refresh()} />
    </div>
  );
}

function AddAdminForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PlatformAdminRole>("viewer");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await addPlatformAdminByEmail(email.trim(), role);
      if (result.ok) {
        setEmail("");
        setRole("viewer");
        setOpen(false);
        onAdded();
      } else {
        setError(result.error);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-fit items-center gap-2 rounded-ds-sm bg-dashboard-primary px-4 py-1.5 text-sm font-medium text-dashboard-on-primary transition-colors hover:bg-dashboard-primary-hover"
      >
        <Plus className="size-4" aria-hidden="true" /> Add admin
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ds-text-primary">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@example.com"
            className="rounded-ds-sm border border-ds-border bg-ds-bg px-3 py-2 text-sm text-ds-text-primary"
          />
          <span className="text-xs text-ds-text-muted">They must already have a Clerk account (have signed up or signed in at least once).</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ds-text-primary">Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as PlatformAdminRole)} className="rounded-ds-sm border border-ds-border bg-ds-bg px-3 py-2 text-sm text-ds-text-primary">
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? <p className="text-sm text-ds-danger">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-ds-sm px-3 py-1.5 text-sm font-medium text-ds-text-secondary hover:bg-ds-surface-soft">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || email.trim().length === 0}
          className="rounded-ds-sm bg-dashboard-primary px-4 py-1.5 text-sm font-medium text-dashboard-on-primary transition-colors hover:bg-dashboard-primary-hover disabled:opacity-40"
        >
          {isPending ? "Adding…" : "Add admin"}
        </button>
      </div>
    </div>
  );
}
