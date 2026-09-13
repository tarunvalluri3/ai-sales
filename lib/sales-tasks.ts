import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SalesTask, SalesTaskStatus } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";

const LIST_LIMIT = 200;

/** Lists a business's open-first sales tasks (manually created and workflow-created alike -- one shared list, not two). `businessId` must come from `requireBusinessContext()`. */
export async function listSalesTasksForBusiness(businessId: string): Promise<SalesTask[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("sales_tasks")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    throw new AppError("Something went wrong loading tasks. Please try again.", "listSalesTasksForBusiness failed", error);
  }

  // Open tasks first, then by recency within each group -- surfaces what
  // still needs doing without hiding completed/dismissed history.
  return (data as SalesTask[]).sort((a, b) => {
    if (a.status === "open" && b.status !== "open") return -1;
    if (a.status !== "open" && b.status === "open") return 1;
    return a.created_at > b.created_at ? -1 : 1;
  });
}

export async function createSalesTask(businessId: string, title: string, description: string | null): Promise<SalesTask> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("sales_tasks")
    .insert({ business_id: businessId, title, description })
    .select()
    .single();

  if (error) {
    throw new AppError("Something went wrong creating this task. Please try again.", "createSalesTask failed", error);
  }

  return data as SalesTask;
}

export async function setSalesTaskStatus(businessId: string, id: string, status: SalesTaskStatus): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("sales_tasks")
    .update({ status })
    .eq("business_id", businessId)
    .eq("id", id)
    .select("id");

  if (error) {
    throw new AppError("Something went wrong updating this task. Please try again.", "setSalesTaskStatus failed", error);
  }

  return data.length > 0;
}
