-- Production readiness, item 5 (LAUNCH_AUDIT.md §2, blocker B6): appointment
-- reminders and expiry of bookings the owner never confirms, run by the
-- scheduler (lib/scheduler/jobs.ts -> lib/appointment-lifecycle.ts).
--
--   1. New appointment status 'expired': a pending booking nobody confirmed
--      in time. It frees the slot (appointments_active_slot_idx only covers
--      pending/confirmed) and is distinct from an owner's explicit 'declined'.
--   2. public.appointment_notifications -- the dedup ledger. A reminder or
--      expiry notice is sent only by whoever inserts its row first
--      (unique appointment + kind + starts_at), so overlapping scheduler runs
--      or retries can never send the same reminder twice. starts_at is part of
--      the key so a rescheduled appointment gets its own reminders.
--   3. expire_stale_pending_appointments() -- atomically moves overdue pending
--      bookings to 'expired' and returns them, `for update skip locked`, so
--      two runs never expire (and notify) the same booking.
--
-- Times: starts_at/created_at are timestamptz (absolute instants), so every
-- comparison here is time-zone independent; the business's own time zone is
-- applied only when the slot is formatted for a human (lib/appointments.ts
-- formatSlotLabel).

-- ---------------------------------------------------------------------- 1

alter table public.appointments drop constraint appointments_status_check;
alter table public.appointments add constraint appointments_status_check check (
  status in ('pending', 'confirmed', 'declined', 'cancelled', 'completed', 'no_show', 'expired')
);

create index appointments_pending_created_idx on public.appointments (created_at) where status = 'pending';
create index appointments_confirmed_starts_idx on public.appointments (starts_at) where status = 'confirmed';

-- ---------------------------------------------------------------------- 2

create table public.appointment_notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  kind text not null check (kind in ('reminder_24h', 'reminder_1h', 'expired')),
  -- The appointment's start time this notice was for (a reschedule = new key).
  starts_at timestamptz not null,
  -- What reached the prospect: email/channel outcomes, recorded after sending.
  email_outcome text,
  channel_outcome text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint appointment_notifications_once unique (appointment_id, kind, starts_at)
);

create index appointment_notifications_business_id_idx on public.appointment_notifications (business_id);

alter table public.appointment_notifications enable row level security;
alter table public.appointment_notifications force row level security;

-- Written and read only by the service-role scheduler. No client grant, and
-- an explicit deny policy so a future accidental grant still exposes nothing
-- across tenants.
revoke all on public.appointment_notifications from anon, authenticated;
create policy appointment_notifications_no_client_access
  on public.appointment_notifications
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------- 3

-- A pending booking expires at
--   max( least(created_at + p_expire_after, starts_at - p_before_start),
--        least(created_at + p_min_owner_window, starts_at) )
-- i.e. 48 h after booking or 2 h before the start, whichever is first -- but
-- a short-notice booking (made less than ~3 h ahead) still gives the owner at
-- least p_min_owner_window (1 h), or until the start, before it expires.
-- Same rule as pendingExpiresAt() in lib/appointment-lifecycle-rules.ts.
create function public.expire_stale_pending_appointments(
  p_expire_after_seconds integer default 172800,
  p_before_start_seconds integer default 7200,
  p_min_owner_window_seconds integer default 3600,
  p_limit integer default 50
)
returns setof public.appointments
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update public.appointments a
    set status = 'expired', updated_at = now()
    from (
      select id
      from public.appointments
      where status = 'pending'
        and now() >= greatest(
          least(created_at + make_interval(secs => p_expire_after_seconds), starts_at - make_interval(secs => p_before_start_seconds)),
          least(created_at + make_interval(secs => p_min_owner_window_seconds), starts_at)
        )
      order by created_at
      limit p_limit
      for update skip locked
    ) due
    where a.id = due.id
    returning a.*;
end;
$$;

revoke execute on function public.expire_stale_pending_appointments(integer, integer, integer, integer) from public, anon, authenticated;
