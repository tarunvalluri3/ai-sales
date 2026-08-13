import { requireBusinessContext } from "@/lib/business-context";
import { ConversationTester } from "./conversation-tester";

export default async function LeadsTestPage() {
  await requireBusinessContext();

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Lead extraction test</h1>
        <p className="text-sm text-zinc-600">
          Internal tool for manually verifying the Phase 10 conversation-to-lead pipeline. Not the
          product chat experience (Phase 12) -- the transcript here isn&apos;t persisted as messages,
          only used to extract a lead when you end the conversation.
        </p>
      </div>
      <ConversationTester />
    </div>
  );
}
