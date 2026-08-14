export function StatBreakdown({
  label,
  items,
}: {
  label: string;
  items: { label: string; count: number }[];
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-sm text-zinc-600">{label}</h2>
      <dl className="flex flex-col gap-1">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-4">
            <dt className="text-sm text-zinc-700">{item.label}</dt>
            <dd className="text-sm font-semibold text-zinc-900">{item.count}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
