import Link from "next/link";

export function StatCard({
  label,
  count,
  href,
}: {
  label: string;
  count: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-dashboard-primary"
    >
      <span className="text-sm text-zinc-600">{label}</span>
      <span className="text-2xl font-semibold text-zinc-900">{count}</span>
    </Link>
  );
}
