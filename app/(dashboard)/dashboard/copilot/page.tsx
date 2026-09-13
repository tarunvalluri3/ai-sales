import { requireBusinessContext } from "@/lib/business-context";
import { getTodayPriorityList } from "@/lib/copilot";
import { PriorityCard } from "./priority-card";
import { EmptyState } from "../_components/state-views";

export default async function CopilotPage() {
  const { businessId } = await requireBusinessContext();
  const items = await getTodayPriorityList(businessId);

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-ds-text-primary">Sales Copilot</h1>
        <p className="text-sm text-ds-text-muted">
          {items.length === 0
            ? "Nothing needs your attention right now."
            : `${items.length} item${items.length === 1 ? "" : "s"} worth a look today, ranked by real signals -- lead score, needs-attention state, pending appointments, and stalled conversations.`}
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="All caught up"
          description="Once a lead scores high, a conversation needs attention, an appointment awaits confirmation, or a lead goes quiet, it'll show up here first."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <PriorityCard key={item.customer.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
