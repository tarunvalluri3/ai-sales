import Link from "next/link";
import { ContactLines } from "../_components/contact-lines";
import { SUPPORT_EMAIL } from "@/lib/site-contact";

export const metadata = {
  title: "Data Deletion Instructions | Waves AI Pilot",
};

const LINK = "font-medium text-ds-accent hover:text-ds-accent-strong";

/**
 * Meta App Review's "Data Deletion Instructions URL". Every statement here
 * describes implemented behavior: the dashboard's Instagram disconnect
 * (lib/instagram.ts disconnectInstagram), the Profile page's
 * "Delete this business" (cascading hard delete), and the Meta callbacks in
 * app/api/meta/. Disconnecting deletes the token at once but does NOT delete
 * message history -- the page says so rather than implying otherwise.
 */
export default function DataDeletionPage() {
  return (
    <div className="flex flex-1 flex-col bg-ds-bg px-6 py-16 sm:py-20 lg:px-[72px] lg:py-[104px]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-[32px] leading-[1.12] font-light tracking-[-0.015em] text-ds-text-primary sm:text-[42px] lg:text-[58px]">Data Deletion Instructions</h1>
          <p className="text-sm text-ds-text-muted">Last updated: 2026-11-02</p>
        </div>

        <Section title="Who this page is from">
          <p>
            This page is published by <strong>Waves Web Studio</strong>, a sole proprietorship
            registered in India (GSTIN 36BYQPT2686E1ZR), which operates the Waves AI Pilot service
            (&quot;Waves AI Pilot,&quot; &quot;we,&quot; &quot;us&quot;). It explains how to disconnect
            Instagram and how to have the data we hold deleted. How we handle data is described in our{" "}
            <Link href="/privacy" className={LINK}>
              Privacy Policy
            </Link>
            .
          </p>
        </Section>

        <Section title="If you are a customer (a business using Waves AI Pilot)">
          <p>
            <strong>Disconnect Instagram.</strong> Sign in, open <strong>Instagram</strong> in the
            dashboard, choose <strong>Disconnect</strong> and confirm. This deletes the Instagram
            access token we hold and the connection record straight away, and your AI sales employee
            stops receiving and answering messages on that account. Conversations already received
            stay in your dashboard until you delete them or your account.
          </p>
          <p>
            <strong>Delete all your account data.</strong> Open <strong>Profile</strong> in the
            dashboard, then <strong>Delete this business</strong>, and type your business name to
            confirm. This permanently deletes your business and everything it owns — products,
            services, FAQs, knowledge documents, conversations and messages (including those from
            Instagram), leads, and any Instagram connection and token. You can export your data from
            the same page first.
          </p>
        </Section>

        <Section title="If you are an Instagram user">
          <p>
            <strong>Remove the app.</strong> Instagram is connected through Facebook login, so you can
            remove Waves AI Pilot in any of these places:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Facebook → Settings → Business integrations</strong>, find{" "}
              <strong>Waves AI Pilot</strong> and choose <strong>Remove</strong>.
            </li>
            <li>
              <strong>Meta Business Suite → Settings → Integrations → Connected apps</strong>, find{" "}
              <strong>Waves AI Pilot</strong> and remove it.
            </li>
            <li>
              <strong>Instagram → Settings → Apps and websites</strong>, find{" "}
              <strong>Waves AI Pilot</strong> and choose <strong>Remove</strong>.
            </li>
          </ul>
          <p>
            Meta then tells us, we delete the stored access token and mark the connection
            disconnected, and Meta can ask us to delete the data we hold for your account.
          </p>
          <p>
            <strong>Ask us to delete your data.</strong> Email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className={LINK}>
              {SUPPORT_EMAIL}
            </a>{" "}
            from an address we can match to your request, giving your Instagram username and the
            business whose account you messaged or connected. We may ask you to confirm it is
            genuinely you before acting. If you only messaged a business&apos;s Instagram account,
            that business decides what happens to the conversation, so we will pass your request to
            it and tell you we have done so.
          </p>
          <p>
            If Instagram sends us a deletion request, we give you a confirmation code and a link to
            check its status at <code>/data-deletion/status</code>.
          </p>
        </Section>

        <Section title="What gets deleted">
          <ul className="list-disc space-y-2 pl-5">
            <li>The Instagram access token and its connection record.</li>
            <li>
              The Instagram account ID and username, the Facebook Page ID and name, and the app-scoped
              Facebook user ID (and, for older connections, Meta business IDs) we stored when the
              account was connected.
            </li>
            <li>
              Every conversation received through that Instagram account — the messages, the
              sender&apos;s Instagram-scoped ID, replies sent, and any lead captured in them.
            </li>
            <li>Message de-duplication records and any unfinished connection attempt.</li>
          </ul>
          <p>
            We never receive a sender&apos;s name or profile details through Instagram, and we do not
            store attachments, only a note that a non-text message arrived.
          </p>
        </Section>

        <Section title="What we keep">
          <p>
            Only tax and invoice records that Indian law requires us to keep — for a customer, the
            invoices and payment records for their subscription. These contain no Instagram data. They
            are kept for the period the law requires, even after an account is closed.
          </p>
        </Section>

        <Section title="How long it takes">
          <p>
            We acknowledge a deletion request within <strong>48 hours</strong> and complete it within{" "}
            <strong>30 days</strong>. Deletions triggered by Instagram&apos;s own removal flow usually
            finish within minutes.
          </p>
        </Section>

        <Section title="Contact">
          <div className="flex flex-col gap-1 border border-ds-border bg-ds-surface p-4">
            <p className="font-medium text-ds-text-primary">Tarun Valluri</p>
            <p>Proprietor and Grievance Officer, Waves Web Studio</p>
            <ContactLines />
          </div>
        </Section>

        <Link href="/" className="text-sm font-medium text-ds-accent hover:text-ds-accent-strong">
          ← Back home
        </Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-ds-border pt-6">
      <h2 className="text-xl font-medium text-ds-text-primary">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-ds-text-secondary">
        {children}
      </div>
    </section>
  );
}
