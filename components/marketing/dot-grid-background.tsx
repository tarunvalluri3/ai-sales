/**
 * Full-bleed 12-column hairline guide behind the homepage content: fixed,
 * one 1px rule per column edge in the border colour. Static (no gradient,
 * no pointer tracking, no animation), so it needs no client JavaScript.
 */
export function DotGridBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="mx-auto grid h-full max-w-[1440px] grid-cols-12 px-6 opacity-40 lg:px-[72px]">
        {Array.from({ length: 12 }, (_, index) => (
          <div key={index} className={`border-l border-ds-border ${index === 11 ? "border-r" : ""}`} />
        ))}
      </div>
    </div>
  );
}
