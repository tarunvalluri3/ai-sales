import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { listRecentlyHandled } from "@/lib/copilot";
import { reconcileTodayCopilotActions, listUpcomingCopilotActions, listCompletedCopilotActions } from "@/lib/copilot-actions";
import { getBusinessTimezone } from "@/lib/business-hours";
import { PriorityCard } from "./priority-card";
import { UpcomingList } from "./upcoming-list";
import { CompletedList } from "./completed-list";
import { RecentlyHandledSection } from "./recently-handled-section";
import { CopilotTabs, type CopilotTabKey } from "./copilot-tabs";
import { EmptyState } from "../_components/state-views";

const TAB_KEYS: CopilotTabKey[] = ["today", "upcoming", "completed"];

export default async function CopilotPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { businessId, orgRole } = await requireBusinessContext();
  const canManage = hasMinRole(orgRole, "org:sales_agent");

  const { tab: rawTab } = await searchParams;
  const tab: CopilotTabKey = TAB_KEYS.includes(rawTab as CopilotTabKey) ? (rawTab as CopilotTabKey) : "today";

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-ds-text-primary">Sales Copilot</h1>
        <p className="text-sm text-ds-text-muted">
          A real work queue, not a static list -- ranked by real signals, snoozeable, and cleared automatically once the app can prove the work is done.
        </p>
      </div>

      <CopilotTabs active={tab} />

      {tab === "today" ? <TodayTab businessId={businessId} canManage={canManage} /> : null}
      {tab === "upcoming" ? <UpcomingTab businessId={businessId} canManage={canManage} /> : null}
      {tab === "completed" ? <CompletedTab businessId={businessId} canManage={canManage} /> : null}
    </div>
  );
}

async function TodayTab({ businessId, canManage }: { businessId: string; canManage: boolean }) {
  const items = await reconcileTodayCopilotActions(businessId);

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-ds-text-muted">
        {items.length === 0
          ? "Nothing needs your attention right now."
          : `${items.length} item${items.length === 1 ? "" : "s"} worth a look today, ranked by real signals -- lead score, needs-attention state, pending appointments, and stalled conversations.`}
      </p>

      {items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="All caught up"
            description="Once a lead scores high, a conversation needs attention, an appointment awaits confirmation, or a lead goes quiet, it'll show up here first."
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {items.map((item) => (
            <PriorityCard key={item.id} item={item} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}

async function UpcomingTab({ businessId, canManage }: { businessId: string; canManage: boolean }) {
  const [items, timezone] = await Promise.all([listUpcomingCopilotActions(businessId), getBusinessTimezone(businessId)]);

  return (
    <div className="mt-2">
      <UpcomingList items={items} canManage={canManage} timezone={timezone} />
    </div>
  );
}

async function CompletedTab({ businessId, canManage }: { businessId: string; canManage: boolean }) {
  const [completed, recentlyHandled] = await Promise.all([listCompletedCopilotActions(businessId), listRecentlyHandled(businessId)]);

  return (
    <div className="mt-2 flex flex-col gap-6">
      <CompletedList items={completed} />

      {recentlyHandled.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium text-ds-text-muted">
            Recently handled (v1 history, kept for compatibility -- reflects &ldquo;Mark as handled&rdquo; clicks directly)
          </p>
          <RecentlyHandledSection items={recentlyHandled} canDismiss={canManage} />
        </div>
      ) : null}
    </div>
  );
}
