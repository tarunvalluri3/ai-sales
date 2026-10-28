import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getJobsOverview, listRecentFailures, getSystemHealthChecks } from "@/lib/admin-jobs";
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
  const [overview, failures, health] = await Promise.all([getJobsOverview(), listRecentFailures(), getSystemHealthChecks()]);

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
        <h2 className="text-xs font-semibold tracking-wide-ds text-ds-text-muted uppercase">Recent failures</h2>
        <FailedJobsTable failures={failures} />
      </section>
    </div>
  );
}
