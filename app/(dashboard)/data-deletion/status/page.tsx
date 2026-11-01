import Link from "next/link";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { getDeletionRequestStatus, type DeletionStatus } from "@/lib/instagram-data-deletion";
import { SUPPORT_EMAIL } from "@/lib/site-contact";

export const metadata = {
  title: "Data Deletion Status | Waves AI Pilot",
  robots: { index: false, follow: false },
};

// Reads live state by confirmation code; must never be cached or prerendered.
export const dynamic = "force-dynamic";

const COPY: Record<DeletionStatus, { label: string; detail: string }> = {
  pending: {
    label: "In progress",
    detail: "We received your request and are deleting the data. This normally takes a few minutes.",
  },
  completed: {
    label: "Completed",
    detail: "The Instagram data we held for this request has been deleted.",
  },
  failed: {
    label: "Needs attention",
    detail: `We could not finish this deletion automatically. We have been alerted, and you can email ${SUPPORT_EMAIL} quoting your confirmation code. We will complete it within 30 days.`,
  },
};

export default async function DataDeletionStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const { code } = await searchParams;
  const codeValue = typeof code === "string" ? code : "";
  const result = codeValue ? await getDeletionRequestStatus(createServiceSupabaseClient(), codeValue) : null;

  return (
    <div className="flex flex-1 flex-col bg-ds-bg px-6 py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold text-ds-text-primary">Data Deletion Status</h1>
          <p className="text-sm text-ds-text-muted">
            Check the progress of a deletion request received from Instagram.
          </p>
        </div>

        <section className="flex flex-col gap-3 border-t border-ds-border pt-6 text-sm leading-relaxed text-ds-text-secondary">
          {result ? (
            <div className="flex flex-col gap-2 rounded-ds-sm border border-ds-border bg-ds-surface p-4">
              <p>
                Confirmation code: <span className="font-mono text-ds-text-primary">{codeValue}</span>
              </p>
              <p>
                Status: <strong className="text-ds-text-primary">{COPY[result.status].label}</strong>
              </p>
              <p>{COPY[result.status].detail}</p>
              <p className="text-2xs text-ds-text-muted">
                Requested {new Date(result.requestedAt).toUTCString()}
                {result.completedAt ? ` · Completed ${new Date(result.completedAt).toUTCString()}` : ""}
              </p>
            </div>
          ) : (
            <p>
              We could not find a request for that confirmation code. Check the link you were given, or
              read how to request deletion on the{" "}
              <Link href="/data-deletion" className="font-medium text-ds-accent hover:text-ds-accent-strong">
                Data Deletion Instructions
              </Link>{" "}
              page.
            </p>
          )}
        </section>

        <Link href="/data-deletion" className="text-sm font-medium text-ds-accent hover:text-ds-accent-strong">
          ← Data Deletion Instructions
        </Link>
      </div>
    </div>
  );
}
