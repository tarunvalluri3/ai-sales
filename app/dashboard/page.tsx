import { requireAuthContext } from "@/lib/auth";

export default async function DashboardPage() {
  const context = await requireAuthContext();

  if (!context.orgId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Select or create an organization to continue.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <dl className="text-sm text-zinc-500 dark:text-zinc-400">
        <div>userId: {context.userId}</div>
        <div>orgId: {context.orgId}</div>
        <div>orgSlug: {context.orgSlug}</div>
        <div>orgRole: {context.orgRole}</div>
      </dl>
    </div>
  );
}
