import { FragmentCard, MicroChip } from "./_shared";

const THREADS = [
  { name: "Karthik R.", preview: "Can I speak to a person?", time: "2m", active: true },
  { name: "Sana W.", preview: "Thanks, that answers it.", time: "14m", active: false },
  { name: "Divya N.", preview: "Do you have Saturday slots?", time: "41m", active: false },
];

/** Conversation list + one open thread showing a handoff event and the staff reply that followed it. */
export function HandoffInbox() {
  return (
    <FragmentCard className="flex overflow-hidden p-0">
      <div className="hidden w-32 shrink-0 flex-col border-r border-ds-border sm:flex">
        {THREADS.map((thread) => (
          <div
            key={thread.name}
            className={`flex flex-col gap-0.5 border-b border-ds-border px-2.5 py-2 ${
              thread.active ? "bg-ds-surface-elevated" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-2xs font-medium text-ds-text-primary">{thread.name}</span>
              <span className="shrink-0 text-2xs text-ds-text-muted">{thread.time}</span>
            </div>
            <span className="truncate text-2xs text-ds-text-muted">{thread.preview}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <div className="max-w-[85%] self-start rounded-ds-md rounded-tl-sm bg-ds-surface-elevated px-3 py-2 text-xs text-ds-text-primary">
          Can I speak to a person?
        </div>
        <div className="flex items-center gap-2 py-0.5">
          <span className="h-px flex-1 bg-ds-border" aria-hidden="true" />
          <MicroChip tone="accent">Handoff → Priya</MicroChip>
          <span className="h-px flex-1 bg-ds-border" aria-hidden="true" />
        </div>
        <div className="flex max-w-[85%] flex-col gap-1 self-end">
          <div className="rounded-ds-md rounded-tr-sm border border-ds-accent-muted bg-ds-surface-elevated px-3 py-2 text-xs text-ds-text-primary">
            Hi, this is Priya — happy to help directly.
          </div>
          <span className="self-end text-2xs text-ds-text-muted">Priya · Staff reply</span>
        </div>
      </div>
    </FragmentCard>
  );
}
