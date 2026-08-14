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
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <h1 className="text-2xl font-semibold text-ds-text-primary">Edit knowledge document</h1>
      <section className="flex w-full max-w-lg flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        <KnowledgeForm
          action={updateKnowledgeDocumentAction}
          id={document.id}
          initialTitle={document.title}
          initialContent={document.content}
          submitLabel="Save changes"
          pendingLabel="Saving…"
        />
      </section>

      <div className="flex max-w-lg flex-col gap-3">
        <h2 className="text-sm font-medium text-ds-text-primary">
          {chunks.length} chunk{chunks.length === 1 ? "" : "s"} generated
        </h2>
        <ul className="flex flex-col gap-2">
          {chunks.map((chunk) => (
            <li
              key={chunk.id}
              className="max-h-40 overflow-y-auto rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-2 text-sm text-ds-text-secondary"
            >
              <p className="mb-1 text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">
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
