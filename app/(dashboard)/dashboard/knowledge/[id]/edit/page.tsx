import { notFound } from "next/navigation";
import { requireBusinessContext } from "@/lib/business-context";
import { getKnowledgeDocument, listChunksForDocument } from "@/lib/knowledge";
import { KnowledgeForm } from "../../knowledge-form";
import { updateKnowledgeDocumentAction } from "../../actions";

export default async function EditKnowledgeDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { businessId } = await requireBusinessContext();
  const document = await getKnowledgeDocument(businessId, id);

  if (!document) {
    notFound();
  }

  const chunks = await listChunksForDocument(businessId, document.id);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Edit knowledge document</h1>
      <KnowledgeForm
        action={updateKnowledgeDocumentAction}
        id={document.id}
        initialTitle={document.title}
        initialContent={document.content}
        submitLabel="Save changes"
        pendingLabel="Saving…"
      />

      <div className="flex max-w-lg flex-col gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">
          {chunks.length} chunk{chunks.length === 1 ? "" : "s"} generated
        </h2>
        <ul className="flex flex-col gap-2">
          {chunks.map((chunk) => (
            <li
              key={chunk.id}
              className="max-h-40 overflow-y-auto rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700"
            >
              <p className="mb-1 text-xs font-medium text-zinc-500">
                Chunk {chunk.chunk_index + 1} · {chunk.char_count} characters
              </p>
              <p className="whitespace-pre-wrap">{chunk.content}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
