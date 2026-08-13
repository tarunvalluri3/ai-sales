import { requireBusinessContext } from "@/lib/business-context";
import { AskForm } from "./ask-form";

export default async function AiTestPage() {
  await requireBusinessContext();

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">AI knowledge test</h1>
        <p className="text-sm text-zinc-600">
          Internal tool for manually verifying the Phase 8 retrieval-to-generation pipeline. Not the
          product chat experience (Phase 12).
        </p>
      </div>
      <AskForm />
    </div>
  );
}
