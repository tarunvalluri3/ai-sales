import { FragmentCard, MicroChip } from "./_shared";

/** Compact one-question, one-answer card -- paired with the "AI talks to prospects" step. */
export function GroundedAnswer() {
  return (
    <FragmentCard className="p-4">
      <div className="flex flex-col gap-1">
        <span className="text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">
          Prospect asks
        </span>
        <p className="text-sm text-ds-text-primary">&ldquo;Do you ship outside Hyderabad?&rdquo;</p>
      </div>
      <div className="mt-3 flex flex-col gap-2 border-t border-ds-border pt-3">
        <span className="text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">
          AI answers
        </span>
        <p className="text-sm text-ds-text-secondary">
          Yes — we ship pan-India, 3–5 business days, based on our shipping policy and service area
          list.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <MicroChip>SOURCE · Shipping Policy</MicroChip>
          <MicroChip>SOURCE · Service Areas FAQ</MicroChip>
        </div>
      </div>
    </FragmentCard>
  );
}
