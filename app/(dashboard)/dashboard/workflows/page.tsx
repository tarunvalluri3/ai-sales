import { requireLiveBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { listWorkflowsForBusiness, listWorkflowRunsForBusiness } from "@/lib/workflows";
import { listTagsForBusiness } from "@/lib/lead-tags";
import { listSalesTasksForBusiness } from "@/lib/sales-tasks";
import { listInternalNotificationsForBusiness } from "@/lib/internal-notifications";
import { WorkflowList } from "./workflow-list";
import { RunsList } from "./runs-list";
import { TasksPanel } from "./tasks-panel";
import { NotificationsPanel } from "./notifications-panel";
import { History } from "lucide-react";
import { Card } from "../_components/ui";

export default async function WorkflowsPage() {
  const { businessId, orgRole } = await requireLiveBusinessContext();
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
    <div className="flex flex-1 flex-col gap-6">
      {/* Renders the page title (with "New workflow") and the list + editor. */}
      <WorkflowList workflows={workflows} tags={tags} canEdit={canManageWorkflows} />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="dx-title flex items-center gap-3">
            <History className="size-5" strokeWidth={1.75} aria-hidden="true" />
            Execution history
          </h2>
          <RunsList runs={runs} workflowNameById={workflowNameById} />
        </Card>
        <TasksPanel tasks={tasks} canEdit={canManageTasks} />
        <NotificationsPanel notifications={notifications} />
      </div>
    </div>
  );
}
