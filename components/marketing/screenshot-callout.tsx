import { MicroChip } from "./fragments/_shared";

/** A positioned marker + label over a framed screenshot. `left`/`top` are percentages. */
export function ScreenshotCallout({
  label,
  left,
  top,
  align = "right",
}: {
  label: string;
  left: number;
  top: number;
  align?: "left" | "right";
}) {
  return (
    <div
      className="absolute flex items-center gap-2"
      style={{ left: `${left}%`, top: `${top}%`, flexDirection: align === "left" ? "row-reverse" : "row" }}
    >
      <span className="size-2 shrink-0 rounded-full border-2 border-ds-accent bg-ds-bg" aria-hidden="true" />
      <MicroChip tone="accent" className="bg-ds-bg/90 backdrop-blur-sm">
        {label}
      </MicroChip>
    </div>
  );
}
