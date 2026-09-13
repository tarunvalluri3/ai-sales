import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { listWorkflowsForBusiness, listWorkflowRunsForBusiness } from "@/lib/workflows";
import { listTagsForBusiness } from "@/lib/lead-tags";
import { listSalesTasksForBusiness } from "@/lib/sales-tasks";
import { listInternalNotificationsForBusiness } from "@/lib/internal-notifications";
import { WorkflowList } from "./workflow-list";
import { RunsList } from "./runs-list";
import { TasksPanel } from "./tasks-panel";
import { NotificationsPanel } from "./notifications-panel";

export default async function WorkflowsPage() {
  const { businessId, orgRole } = await requireBusinessContext();
  const canManageWorkflows = hasMinRole(orgRole, "org:admin");
  const canManageTasks = hasMinRole(orgRole, "org:sales_agent");

  const [workflows, runs, tags, tasks, notifications] = await Promise.all([
    listWorkflowsForBusiness(businessId),
    listWorkflowRunsForBusiness(businessId),
    listTagsForBusiness(businessId),
    listSalesTasksForBusiness(businessId),
    listInternalNotificationsForBusiness(businessId),
  ]);

  const workflowNameById = Object.fromEntries(workflows.map((workflow) => [workflow.id, workflow.name]));

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-ds-text-primary">Workflows</h1>
        <p className="text-sm text-ds-text-muted">
          Automate a repetitive step: trigger → conditions → actions, with an optional delay. Every run is logged below, whether it succeeded, failed, or is still waiting.
        </p>
      </div>

      <WorkflowList workflows={workflows} tags={tags} canEdit={canManageWorkflows} />

      <section className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-4">
        <h2 className="text-sm font-semibold text-ds-text-primary">Execution history</h2>
        <RunsList runs={runs} workflowNameById={workflowNameById} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TasksPanel tasks={tasks} canEdit={canManageTasks} />
        <NotificationsPanel notifications={notifications} />
      </div>
    </div>
  );
}
