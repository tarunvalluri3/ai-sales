import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { listKnowledgeDocumentsForBusiness } from "@/lib/knowledge";
import { KnowledgeForm } from "./knowledge-form";
import { FileUploadForm } from "./_components/file-upload-form";
import { UrlImportForm } from "./_components/url-import-form";
import { AddKnowledgeTabs } from "./_components/add-knowledge-tabs";
import { KnowledgeList } from "./_components/knowledge-list";
import { PermissionNotice } from "../_components/state-views";
import { createKnowledgeDocumentAction } from "./actions";

/**
 * Extends the default Server Action timeout for every action invoked from
 * this page -- per Next.js's documented behavior, `maxDuration` set at the
 * page level applies to its Server Actions (Server Actions have no other
 * way to get more than the platform default). Needed for
 * `createUrlKnowledgeDocumentAction`/`refreshUrlKnowledgeDocumentAction`
 * (`./actions.ts`), which can now fall back to a real headless-browser
 * render (lib/browser-render.ts) for JS-rendered sites -- same value as
 * `/api/chat`'s existing `maxDuration`.
 */
export const maxDuration = 60;

export default async function KnowledgePage() {
  const { businessId, orgRole } = await requireBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:member");
  const documents = await listKnowledgeDocumentsForBusiness(businessId);

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Knowledge</h1>
        <p className="text-sm text-ds-text-secondary">
          This is what your AI sales employee is allowed to know. New documents start as drafts —
          publish one to make it part of your AI&rsquo;s live reference context.
        </p>
      </div>

      <KnowledgeList documents={documents} canEdit={canEdit} />

      {canEdit ? (
        <AddKnowledgeTabs
          manualForm={
            <KnowledgeForm action={createKnowledgeDocumentAction} submitLabel="Add knowledge" pendingLabel="Adding…" />
          }
          fileForm={<FileUploadForm />}
          urlForm={<UrlImportForm />}
        />
      ) : (
        <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
          <h2 className="text-sm font-medium text-ds-text-primary">Add knowledge</h2>
          <PermissionNotice />
        </section>
      )}
    </div>
  );
}
