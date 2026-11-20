import { requireBusinessContext } from "@/lib/business-context";
import { isAgentPublished } from "@/lib/agent-published";
import { getBusinessForOrg } from "@/lib/business";
import { hasMinRole } from "@/lib/auth";
import { listKnowledgeDocumentsForBusiness } from "@/lib/knowledge";
import { KnowledgeForm } from "./knowledge-form";
import { FileUploadForm } from "./_components/file-upload-form";
import { UrlImportForm } from "./_components/url-import-form";
import { AddKnowledgeTabs } from "./_components/add-knowledge-tabs";
import { KnowledgeList } from "./_components/knowledge-list";
import { PermissionNotice } from "../_components/state-views";
import { createKnowledgeDocumentAction } from "./actions";
import { BookOpen } from "lucide-react";
import { Card, PageHeader } from "../_components/ui";

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
  const { businessId, orgId, orgRole } = await requireBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:member");
  const [documents, business] = await Promise.all([listKnowledgeDocumentsForBusiness(businessId), getBusinessForOrg(orgId)]);

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader
        icon={BookOpen}
        title="Knowledge"
        description="This is what your AI sales employee is allowed to know. Written notes are approved on save. Approve uploaded files and imported pages, then publish changes to make them live."
      />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="min-w-0 p-5">
          <KnowledgeList documents={documents} canEdit={canEdit} agentPublished={business != null && isAgentPublished(business)} />
        </Card>

        {canEdit ? (
          <AddKnowledgeTabs
            manualForm={
              <KnowledgeForm action={createKnowledgeDocumentAction} submitLabel="Add knowledge" pendingLabel="Adding…" />
            }
            fileForm={<FileUploadForm />}
            urlForm={<UrlImportForm />}
          />
        ) : (
          <Card className="flex flex-col gap-4">
            <h2 className="dx-title">Add knowledge</h2>
            <PermissionNotice />
          </Card>
        )}
      </div>
    </div>
  );
}
