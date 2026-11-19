import type { Metadata } from "next";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Inbox,
  KeyRound,
  MessageSquareText,
  ScrollText,
  Target,
  Users,
  Webhook,
} from "lucide-react";
import { AnchorNav } from "@/components/site/anchor-nav";
import { FeatureBlock, PageHero } from "@/components/site/feature-block";
import { CtaBand } from "@/components/site/cta-band";
import { Btn, Reveal, Section, SectionHeading } from "@/components/site/primitives";
import { MacWindow, SCREENS } from "@/components/site/mac-window";
import { AGENT_SCRIPT, WebsiteWidget } from "@/components/site/chat-illustrations";
import {
  AnalyticsIllustration,
  BookingIllustration,
  ChannelHub,
  CopilotIllustration,
  CustomerIllustration,
  HandoffIllustration,
  LeadScoreIllustration,
  TrainIllustration,
  WorkflowIllustration,
} from "@/components/site/illustrations";
import { DEMO_HREF } from "@/components/site/links";

export const metadata: Metadata = {
  title: "Platform | Waves AI Pilot",
  description:
    "Every feature of Waves AI Pilot: an AI sales agent grounded in your knowledge, omnichannel inbox, lead qualification, appointment booking, human handoff, customer profiles, workflows, sales copilot and analytics.",
  alternates: { canonical: "/product" },
};

const SECTIONS = [
  { id: "agent", label: "AI Sales Agent" },
  { id: "inbox", label: "Inbox" },
  { id: "leads", label: "Leads" },
  { id: "appointments", label: "Appointments" },
  { id: "knowledge", label: "Knowledge" },
  { id: "handoff", label: "Handoff" },
  { id: "customers", label: "Customers" },
  { id: "workflows", label: "Workflows" },
  { id: "copilot", label: "Copilot" },
  { id: "analytics", label: "Analytics" },
  { id: "team", label: "Team & admin" },
];

const TRIGGERS = [
  "A lead is created",
  "A lead's status changes",
  "A lead's score reaches a threshold",
  "A tag is added or removed",
  "An appointment's status changes",
  "A conversation needs attention",
  "A human takes over",
  "The AI is handed back",
  "A customer goes quiet for N hours",
];

const ACTIONS = [
  "Add or remove a tag",
  "Update the lead's status",
  "Flag the conversation",
  "Assign a team member",
  "Create a sales task",
  "Draft an AI follow-up",
  "Send an internal notification",
  "Send an email notification",
  "Wait minutes, hours or days",
];

const ADMIN = [
  { icon: KeyRound, title: "Roles & permissions", body: "Four permission tiers, from viewer to admin, so each person sees and changes only what they should." },
  { icon: ScrollText, title: "Audit log", body: "A record of sensitive actions: who changed what, and when." },
  { icon: Bell, title: "Notifications", body: "Choose which events email you: hot leads, bookings, handoff requests, daily digests." },
  { icon: Webhook, title: "Outbound webhooks", body: "Send qualified leads to your CRM, Zapier, Make or any URL the moment they qualify." },
  { icon: Users, title: "Team assignment & SLA", body: "Round-robin conversations to your team, with business hours and response-time routing." },
  { icon: CreditCard, title: "Billing & GST invoices", body: "Upgrade, downgrade or cancel yourself. A GST invoice for every payment, downloadable any time." },
];

export default function ProductPage() {
  return (
    <main className="flex flex-1 flex-col">
      <PageHero
        eyebrow="The platform"
        title="Everything your AI sales employee does, in one platform."
        lead="Waves AI Pilot pairs an AI agent that talks to your prospects with the tools your team needs after the first message: an inbox, lead qualification, bookings, automation, a copilot and analytics."
        aside={<ChannelHub />}
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Btn href="/sign-up">Start your free trial</Btn>
          <Btn href={DEMO_HREF} variant="secondary">
            Book a demo
          </Btn>
        </div>
      </PageHero>

      <AnchorNav items={SECTIONS} />

      <FeatureBlock
        id="agent"
        label="AI Sales Agent"
        title="A salesperson, not a chatbot."
        body="The agent answers as an employee of your business, using only what you've approved. Its job is to understand what each prospect needs, recommend the right thing and keep the conversation moving toward an outcome."
        points={[
          "Discovers before recommending: asks one focused question about budget, use case or timing when a request is vague.",
          "Recommends specific products and services that fit what the prospect said, with photo cards when you've added photos.",
          "Handles price and timing objections using your real catalogue and knowledge, never an invented discount.",
          "Ends every reply with a next step: a question, a recommendation, a booking or a callback.",
          "Asks for name and contact details naturally when a callback or booking is the next step.",
          "Stays in its lane: never discusses competitors, unrelated topics or its own instructions.",
        ]}
        visual={<WebsiteWidget business="Northstar Electronics" script={AGENT_SCRIPT} />}
      />

      <FeatureBlock
        id="inbox"
        flip
        label="Omnichannel Inbox"
        title="Every conversation, every channel, one inbox."
        body="Website chats, WhatsApp messages and Instagram DMs land in the same place, live, with full context beside each thread."
        points={[
          "Filter by channel or show only conversations that need attention.",
          "An AI summary of each conversation and a suggested next best action.",
          "Open any AI reply to see the approved sources it used.",
          "Tag conversations, or let the AI suggest tags for you to apply.",
          "WhatsApp through Meta's official Business Platform, with your own number and message templates.",
          "Instagram through your professional account, linked to your Facebook Page.",
        ]}
        wide
        visual={
          <div className="w-full">
            <MacWindow shots={[SCREENS.sources.shot]} layers={{ 0: SCREENS.sources.rects }} lit={[0]} sizes="(min-width: 1024px) 600px, 100vw" />
          </div>
        }
      />

      <FeatureBlock
        id="leads"
        label="Lead Qualification"
        title="Know who's ready to buy, and why."
        body="When a prospect shares contact details, a lead is created automatically and scored from real signals in the conversation. Every point is itemised, so the score is never a black box."
        points={[
          "Hot, warm or cold, plus a 0–9 score and a plain-language reason.",
          "Score history shows exactly how and when a lead's score changed.",
          "Track status from new to contacted, converted or lost.",
          "Spots when two leads look like the same person across channels.",
          "Quiet leads get one AI-drafted follow-up after three days of silence.",
          "Export leads to CSV whenever you need them.",
        ]}
        visual={<LeadScoreIllustration />}
      />

      <FeatureBlock
        id="appointments"
        flip
        label="Appointment Booking"
        title="Meetings booked in the chat. Confirmed by you."
        body="The agent offers real open slots from your business hours and books the one the prospect picks. Nothing is final until your team confirms it."
        points={[
          "Slots come from your weekly hours, timezone and slot length.",
          "One booking per slot across every channel, so nothing is double-booked.",
          "Close a whole day, block a single slot, or add an exceptional opening.",
          "Confirm or decline in one click; the prospect is notified by email and WhatsApp.",
          "Record outcomes after the meeting: completed or no-show.",
          "An instant email to you the moment a new request comes in.",
        ]}
        visual={<BookingIllustration />}
      />

      <FeatureBlock
        id="knowledge"
        label="Knowledge Base"
        title="Teach it your business in an afternoon."
        body="Everything the agent knows comes from you. Add it once, review it, publish it, and it's retrieved only for your business."
        points={[
          "Products and services with prices, details and photos.",
          "FAQs written in your own words.",
          "Documents: paste text, or upload .pdf, .txt and .md files.",
          "Import pages straight from your website by URL, and refresh them later.",
          "Instant Answers: approve replies to common questions so they're served immediately.",
          "Draft and publish: changes go live only when you publish them.",
        ]}
        visual={<TrainIllustration />}
      />

      <FeatureBlock
        id="handoff"
        flip
        label="Human Handoff"
        title="A person steps in the moment one is needed."
        body="The agent knows when to stop. Conversations that need a human are flagged, and your team can take over any chat live."
        points={[
          "Escalates when a prospect asks for a person, repeats an unknown or raises a complaint.",
          "Take over from the inbox and the AI pauses for that conversation.",
          "Reply as yourself, then hand it back when you're done.",
          "Your own replies never count toward your AI reply quota.",
        ]}
        visual={<HandoffIllustration />}
      />

      <FeatureBlock
        id="customers"
        label="Customers & Segments"
        title="One profile per customer, across every channel."
        body="Conversations, leads and appointments from the website, WhatsApp and Instagram roll up into a single customer profile."
        points={[
          "Profiles match only on exact email or phone, never on guesswork.",
          "Contact details, latest score, tags and every linked conversation in one view.",
          "Saved segments with simple AND / OR rules: score, status, channel, tags, activity and more.",
          "Segments update live as your data changes.",
        ]}
        visual={<CustomerIllustration />}
      />

      <Section id="workflows" className="scroll-mt-32 bg-ds-surface" labelledBy="workflows-title">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <p className="site-eyebrow">Workflows</p>
            <h2 id="workflows-title" className="site-h2 mt-5 !text-[clamp(1.6rem,1.4vw+1.1rem,2.5rem)]">
              Automation that follows up for you.
            </h2>
            <p className="site-lead mt-5">
              Build workflows from a trigger, optional conditions and a list of steps. Waits are durable: a workflow
              resumes exactly where it left off, even after a restart, and every run is logged.
            </p>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <div>
                <p className="font-label text-[11px] font-medium uppercase tracking-[0.18em] text-ds-text-muted">Triggers</p>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {TRIGGERS.map((t) => (
                    <li key={t} className="rounded-full border border-ds-border bg-ds-bg px-2.5 py-1 text-[12.5px] text-ds-text-secondary">
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-label text-[11px] font-medium uppercase tracking-[0.18em] text-ds-text-muted">Steps</p>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {ACTIONS.map((t) => (
                    <li key={t} className="rounded-full border border-ds-border bg-ds-lime-soft px-2.5 py-1 text-[12.5px] text-ds-accent">
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="relative overflow-hidden rounded-[32px] border border-ds-border bg-ds-surface-soft p-6 sm:p-10">
              <div aria-hidden="true" className="site-dots-bg absolute inset-0 opacity-70 [mask-image:radial-gradient(70%_70%_at_50%_50%,#000,transparent)]" />
              <div className="relative mx-auto max-w-[440px]">
                <WorkflowIllustration />
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      <FeatureBlock
        id="copilot"
        flip
        label="Sales Copilot"
        title="Start every day knowing exactly who to call."
        body="The copilot ranks your leads and conversations from stored signals, not the AI's whims, and gives each one a single recommended next action."
        points={[
          "Prioritised by score, attention needed, upcoming appointments and days of silence.",
          "One clear next step per item, never a menu of options.",
          "An on-demand sales brief for each customer, grounded only in their own conversation.",
          "Snooze, mark handled, and see what's coming up.",
          "It never sends, books or changes anything on its own.",
        ]}
        visual={<CopilotIllustration />}
      />

      <FeatureBlock
        id="analytics"
        label="Analytics"
        title="See exactly where revenue comes from."
        body="Numbers calculated from what actually happened in your conversations, not estimates."
        points={[
          "The full funnel: conversations, leads, qualified, appointments, completed and converted.",
          "Drop-off between every stage.",
          "Channel performance across website, WhatsApp and Instagram.",
          "Which pages on your site start chats, and which of them convert.",
          "Compare the last 7 or 30 days with the period before.",
        ]}
        visual={<AnalyticsIllustration />}
      />

      <Section id="team" className="scroll-mt-32" labelledBy="team-title">
        <SectionHeading
          align="center"
          eyebrow="Team & admin"
          id="team-title"
          title="Built for teams, from day one."
          lead="Everything a growing sales team needs to work together safely."
        />
        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ADMIN.map((a, i) => (
            <Reveal as="li" key={a.title} delay={(i % 3) * 0.06} className="rounded-[24px] border border-ds-border bg-ds-surface p-7">
              <span className="flex size-10 items-center justify-center rounded-xl bg-ds-lime-soft text-ds-accent">
                <a.icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-[17px] font-medium">{a.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ds-text-secondary">{a.body}</p>
            </Reveal>
          ))}
        </ul>
      </Section>

      <Section dark labelledBy="onboarding-title" className="overflow-hidden">
        <div aria-hidden="true" className="site-glow -left-40 top-0 h-[360px] w-[520px] opacity-20" />
        <SectionHeading
          align="split"
          eyebrow="Guided onboarding"
          id="onboarding-title"
          title="Live in six guided steps."
          lead="New businesses finish setup before entering the dashboard, so the agent is trained and tested before a single prospect sees it."
        />
        <ol className="mt-14 grid gap-px overflow-hidden rounded-[28px] border border-ds-border bg-ds-border sm:grid-cols-2 lg:grid-cols-6">
          {[
            { icon: ClipboardList, t: "Your business", d: "Who you are" },
            { icon: BookOpen, t: "Train your agent", d: "Knowledge, products, FAQs" },
            { icon: MessageSquareText, t: "Personality", d: "How it sounds" },
            { icon: Inbox, t: "Channels", d: "Where prospects chat" },
            { icon: CalendarDays, t: "Plan", d: "Free trial, no card" },
            { icon: Target, t: "Test & go live", d: "Publish your agent" },
          ].map((s, i) => (
            <Reveal as="li" key={s.t} delay={i * 0.05} className="bg-ds-bg p-6">
              <span className="font-label text-[12px] text-ds-text-muted">{String(i + 1).padStart(2, "0")}</span>
              <s.icon className="mt-4 size-5 text-ds-accent" strokeWidth={1.75} aria-hidden="true" />
              <p className="mt-3 text-[15.5px] font-medium">{s.t}</p>
              <p className="mt-1 text-[13.5px] text-ds-text-secondary">{s.d}</p>
            </Reveal>
          ))}
        </ol>
      </Section>

      <div className="pt-20 lg:pt-28">
        <CtaBand title="See it on your own business." body="Start a 14-day free trial on every channel, or book a demo and we'll walk you through it." />
      </div>
    </main>
  );
}

