import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getJobsOverview, listRecentFailures, getSystemHealthChecks } from "@/lib/admin-jobs";
import { listOpenBillingCancellations, listSchedulerJobStatus } from "@/lib/health";
import { AdminPageHeader } from "../_components/page-header";
import { AdminKpiTile } from "../_components/admin-kpi-tile";
import { Badge } from "@/app/(dashboard)/dashboard/_components/badge";
import { FailedJobsTable } from "./failed-jobs-table";

const QUEUE_LABELS: Record<string, string> = {
  knowledgeIngestion: "Knowledge ingestion",
  webhookDeliveries: "Webhook deliveries",
  whatsappOutbound: "WhatsApp outbound",
  instagramOutbound: "Instagram outbound",
  workflowRuns: "Workflow runs",
};

export default async function ApacheJobsPage() {
  await requirePlatformAdmin("viewer");
  const [overview, failures, health, scheduler, cancellations] = await Promise.all([
    getJobsOverview(),
    listRecentFailures(),
    getSystemHealthChecks(),
    listSchedulerJobStatus(),
    listOpenBillingCancellations(),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <AdminPageHeader title="Jobs & System Health" description="The real background queues this app already has -- no separate job system." />

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wide-ds text-ds-text-muted uppercase">System health</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminKpiTile label="Database" value={health.databaseOk ? "OK" : "Unreachable"} />
          <AdminKpiTile
            label="Gemini API"
            value={health.geminiLastSuccessAgoMinutes === null ? "No recent calls" : `${health.geminiLastSuccessAgoMinutes}m ago`}
            hint="Time since the last successful production call -- not a live ping"
          />
          <AdminKpiTile label="WhatsApp" value={health.whatsappAnyConnected ? "Connections active" : "None connected"} />
          <AdminKpiTile label="Instagram" value={health.instagramAnyConnected ? "Connections active" : "None connected"} />
        </div>
        <p className="text-xs text-ds-text-muted">
          These are honest proxies, not live uptime pings -- this app has no safe way to probe Gemini/Meta in
          real time without spending a real API call or risking a false &quot;down&quot; from one slow request.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wide-ds text-ds-text-muted uppercase">Queues</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(overview).map(([key, counts]) => (
            <div key={key} className="flex flex-col gap-2 rounded-ds-lg border border-ds-border bg-ds-surface p-4">
              <span className="text-sm font-medium text-ds-text-primary">{QUEUE_LABELS[key]}</span>
              <div className="flex flex-wrap gap-2">
                {Object.entries(counts).map(([status, count]) => (
                  <Badge key={status} tone={status === "failed" ? "danger" : status === "complete" || status === "sent" || status === "completed" ? "success" : "muted"}>
                    {status}: {count}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wide-ds text-ds-text-muted uppercase">Scheduler</h2>
        {scheduler.length === 0 ? (
          <p className="rounded-ds-lg border border-dashed border-ds-border py-10 text-center text-sm text-ds-text-secondary">
            No scheduler runs recorded yet. The VPS cron (docs/vps-cron.md) or the daily Vercel cron creates these rows on its first run.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-ds-lg border border-ds-border bg-ds-surface">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-ds-text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Job</th>
                  <th className="px-4 py-2 font-medium">Last started</th>
                  <th className="px-4 py-2 font-medium">Last success</th>
                  <th className="px-4 py-2 font-medium">Failures in a row</th>
                  <th className="px-4 py-2 font-medium">Last error</th>
                </tr>
              </thead>
              <tbody>
                {scheduler.map((job) => (
                  <tr key={job.jobName} className="border-t border-ds-border">
                    <td className="px-4 py-2 font-medium text-ds-text-primary">
                      {job.jobName}
                      {job.running ? (
                        <span className="ml-2">
                          <Badge tone="muted">running</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-ds-text-muted">{formatWhen(job.lastStartedAt)}</td>
                    <td className="px-4 py-2 text-ds-text-muted">{formatWhen(job.lastSucceededAt)}</td>
                    <td className="px-4 py-2">
                      <Badge tone={job.consecutiveFailures >= 3 ? "danger" : job.consecutiveFailures > 0 ? "accent" : "success"}>
                        {job.consecutiveFailures}
                      </Badge>
                    </td>
                    <td className="max-w-xs truncate px-4 py-2 text-ds-text-muted" title={job.lastError ?? undefined}>
                      {job.lastError ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wide-ds text-ds-text-muted uppercase">Billing cancellations needing attention</h2>
        {cancellations.length === 0 ? (
          <p className="rounded-ds-lg border border-dashed border-ds-border py-10 text-center text-sm text-ds-text-secondary">
            Every deleted business&apos;s Razorpay subscription is confirmed cancelled.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-ds-lg border border-ds-border bg-ds-surface">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-ds-text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Business (deleted)</th>
                  <th className="px-4 py-2 font-medium">Razorpay subscription</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Attempts</th>
                  <th className="px-4 py-2 font-medium">Charges after deletion</th>
                </tr>
              </thead>
              <tbody>
                {cancellations.map((row) => (
                  <tr key={row.razorpaySubscriptionId} className="border-t border-ds-border">
                    <td className="px-4 py-2 text-ds-text-primary">{row.businessName}</td>
                    <td className="px-4 py-2 font-mono text-xs text-ds-text-muted">{row.razorpaySubscriptionId}</td>
                    <td className="px-4 py-2">
                      <Badge tone={row.status === "failed" ? "danger" : row.status === "cancelled" ? "success" : "accent"}>{row.status}</Badge>
                    </td>
                    <td className="px-4 py-2 text-ds-text-muted">{row.attempts}</td>
                    <td className="px-4 py-2">
                      <Badge tone={row.chargesAfterDeletion > 0 ? "danger" : "muted"}>{row.chargesAfterDeletion}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wide-ds text-ds-text-muted uppercase">Recent failures</h2>
        <FailedJobsTable failures={failures} />
      </section>
    </div>
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return "never";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));
}
