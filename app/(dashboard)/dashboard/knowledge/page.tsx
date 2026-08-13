import Link from "next/link";
import { requireBusinessContext } from "@/lib/business-context";
import { listKnowledgeDocumentsForBusiness } from "@/lib/knowledge";
import { DeleteButton } from "../_components/delete-button";
import { KnowledgeForm } from "./knowledge-form";
import { createKnowledgeDocumentAction, deleteKnowledgeDocumentAction } from "./actions";

export default async function KnowledgePage() {
  const { businessId } = await requireBusinessContext();
  const documents = await listKnowledgeDocumentsForBusiness(businessId);

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Knowledge</h1>

      <ul className="flex flex-col gap-3">
        {documents.length === 0 ? (
          <li className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-6 text-center text-sm text-zinc-600">
            No knowledge documents yet.
          </li>
        ) : null}
        {documents.map((document) => (
          <li
            key={document.id}
            className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-dashboard-primary"
          >
            <div>
              <p className="font-medium text-zinc-900">{document.title}</p>
              <p className="line-clamp-2 text-sm text-zinc-600">{document.content}</p>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href={`/dashboard/knowledge/${document.id}/edit`}
                className="text-sm font-medium text-dashboard-primary hover:text-dashboard-primary-hover"
              >
                Edit
              </Link>
              <DeleteButton action={deleteKnowledgeDocumentAction} id={document.id} />
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">Add knowledge</h2>
        <KnowledgeForm
          action={createKnowledgeDocumentAction}
          submitLabel="Add knowledge"
          pendingLabel="Adding…"
        />
      </div>
    </div>
  );
}
