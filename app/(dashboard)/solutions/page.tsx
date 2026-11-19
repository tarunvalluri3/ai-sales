import type { Metadata } from "next";
import { CalendarDays, Clock3, Target } from "lucide-react";
import { AnchorNav } from "@/components/site/anchor-nav";
import { FeatureBlock, PageHero } from "@/components/site/feature-block";
import { CtaBand } from "@/components/site/cta-band";
import { Btn, Reveal, Section, SectionHeading } from "@/components/site/primitives";
import {
  InstagramPhone,
  ProductCard,
  SlotCard,
  WebsiteWidget,
  WhatsAppPhone,
  type ChatLine,
} from "@/components/site/chat-illustrations";
import { DEMO_HREF } from "@/components/site/links";

export const metadata: Metadata = {
  title: "Solutions | Waves AI Pilot",
  description:
    "How businesses use Waves AI Pilot: real estate, clinics, education and coaching, salons, retail and D2C brands, agencies and travel. Lead generation, appointment setting and after-hours coverage on website, WhatsApp and Instagram.",
  alternates: { canonical: "/solutions" },
};

const GOALS = [
  {
    id: "lead-generation",
    icon: Target,
    title: "Lead generation",
    body: "Turn anonymous visitors and DMs into named, scored leads with contact details, a summary and a next step.",
    points: ["Captures name, email and phone in conversation", "Hot / warm / cold with a 0–9 score", "Instant alerts for hot leads"],
  },
  {
    id: "appointment-setting",
    icon: CalendarDays,
    title: "Appointment setting",
    body: "Offer real open slots in the chat and get requests straight into your calendar view, ready to confirm.",
    points: ["Slots from your business hours", "No double-booking across channels", "Prospect notified on confirmation"],
  },
  {
    id: "after-hours",
    icon: Clock3,
    title: "After-hours coverage",
    body: "Answer the 11 PM enquiry like it's 11 AM. Your team picks up qualified leads the next morning.",
    points: ["Grounded answers around the clock", "Hands off to people during business hours", "Copilot lists who to call first"],
  },
];

const S = {
  realEstate: [
    { from: "customer", text: "Any 3BHK ready-to-move in Kondapur?" },
    { from: "ai", text: "Yes, Lakeview Residences has ready 3BHKs from ₹1.35 Cr. Are you buying to live in or as an investment?" },
    { from: "customer", text: "To live in. Can I see it Saturday?" },
    { from: "ai", text: "Saturday 4:00 PM is open for a site visit. Shall I request it?", card: <SlotCard day="Sat" time="4:00 PM" /> },
  ],
  clinic: [
    { from: "customer", text: "Does the clinic treat hair fall? What does a consultation cost?" },
    { from: "ai", text: "Yes, our dermatologists treat hair fall. A consultation is ₹800. Would you like a morning or evening slot?" },
    { from: "customer", text: "Evening, tomorrow" },
    { from: "ai", text: "Tomorrow 6:30 PM is free. May I have your name?", card: <SlotCard day="Thu" time="6:30 PM" /> },
  ],
  education: [
    { from: "customer", text: "Do you have weekend batches for the data analytics course?" },
    { from: "ai", text: "Yes, Saturday and Sunday, 10 AM–1 PM, 12 weeks. Fees are ₹38,000 with EMI options. Want to attend a free demo class?" },
    { from: "customer", text: "Yes please" },
    { from: "ai", text: "This Sunday's demo starts at 10 AM. I'll need your name and phone to reserve a seat." },
  ],
  salon: [
    { from: "customer", text: "How much is a keratin treatment for long hair?" },
    { from: "ai", text: "Keratin for long hair is ₹4,500 and takes about 3 hours. Would you like to book?" },
    { from: "customer", text: "Friday afternoon?" },
    { from: "ai", text: "Friday 2:00 PM is available. Shall I request it for you?", card: <SlotCard day="Fri" time="2:00 PM" /> },
  ],
  retail: [
    { from: "customer", text: "Looking for a gift under ₹2,000 for my sister" },
    { from: "ai", text: "Lovely! Does she prefer jewellery or skincare?" },
    { from: "customer", text: "Jewellery, something minimal" },
    { from: "ai", text: "The Aria silver studs are a favourite:", card: <ProductCard name="Aria silver studs" price="₹1,450" tint="linear-gradient(135deg,#eceae6,#d9d6cf)" /> },
  ],
  services: [
    { from: "customer", text: "Can you build an e-commerce site for my brand?" },
    { from: "ai", text: "Yes, that's one of our core services. How many products do you sell, and do you need payments built in?" },
    { from: "customer", text: "About 200 products, yes payments" },
    { from: "ai", text: "That fits our e-commerce package. A 30-minute discovery call is the best next step. Tuesday 11 AM?", card: <SlotCard day="Tue" time="11:00 AM" /> },
  ],
  travel: [
    { from: "customer", text: "Do you have a 5-day Kerala package for a couple in December?" },
    { from: "ai", text: "Yes, the Backwaters & Munnar package: 5 days, houseboat stay, from ₹42,000 for two. Which dates are you considering?" },
    { from: "customer", text: "18th to 22nd. Can someone call me?" },
    { from: "ai", text: "Of course. Share your number and our travel expert will call you back today." },
  ],
} satisfies Record<string, ChatLine[]>;

const INDUSTRIES = [
  {
    id: "real-estate",
    label: "Real estate",
    title: "Qualify buyers and book site visits, day and night.",
    body: "Property enquiries arrive at all hours, on every channel. The agent answers from your project details, asks about budget and purpose, and books the visit.",
    points: [
      "Answers on configurations, prices, locations, amenities and possession dates from your listings.",
      "Asks about budget, timeline and purpose before recommending a project.",
      "Requests site visits from your real availability.",
      "Scores buyers so your sales team calls the serious ones first.",
    ],
    visual: <WebsiteWidget business="Skyline Homes" script={S.realEstate} />,
  },
  {
    id: "clinics",
    label: "Clinics & healthcare",
    title: "Answer treatment questions and fill your calendar.",
    body: "Patients want to know what you treat, what it costs and when you're free. The agent answers from information your clinic approves and requests appointments for your staff to confirm.",
    points: [
      "Treatments, doctors, timings, fees and location answered from your approved content.",
      "Never gives medical advice beyond what you've published; it hands off to your staff instead.",
      "Appointment requests stay pending until your front desk confirms them.",
      "Patients are notified by email and WhatsApp once confirmed.",
    ],
    visual: <WhatsAppPhone business="Clearskin Clinic" script={S.clinic} />,
  },
  {
    id: "education",
    label: "Education & coaching",
    title: "Turn course enquiries into demo-class sign-ups.",
    body: "Students and parents ask the same questions about batches, fees and outcomes. The agent answers them instantly and moves each enquiry toward a demo or a counselling call.",
    points: [
      "Courses, batches, schedules, fees and EMI options from your catalogue.",
      "Recommends the right course from what the student says about goals and level.",
      "Captures student and parent contact details as leads.",
      "Automated follow-up workflows for enquiries that go quiet.",
    ],
    visual: <WebsiteWidget business="Brightpath Academy" script={S.education} />,
  },
  {
    id: "salons",
    label: "Salons & wellness",
    title: "Prices, services and bookings, right in Instagram DMs.",
    body: "Most salon enquiries start on Instagram. The agent replies to every DM with your real prices and requests the appointment, so no message is left on read.",
    points: [
      "Service menu, prices and durations answered instantly.",
      "Bookings requested from your actual working hours.",
      "Human handoff for special requests and complaints.",
      "Six widget languages, including Hindi, for your website.",
    ],
    visual: <InstagramPhone handle="lumesalon.hyd" script={S.salon} />,
  },
  {
    id: "retail",
    label: "Retail & D2C brands",
    title: "A personal shopper in every conversation.",
    body: "Shoppers ask before they buy. The agent asks what they're looking for and recommends specific products from your catalogue, with photo cards.",
    points: [
      "Product recommendations with photos and prices, grounded in your catalogue.",
      "Answers sizing, materials, shipping and return policies from your FAQs.",
      "Handles “is it worth it?” with your real product details, never invented discounts.",
      "Captures high-intent shoppers as leads for your team.",
    ],
    visual: <InstagramPhone handle="aria.jewels" script={S.retail} />,
  },
  {
    id: "services",
    label: "Agencies & professional services",
    title: "Scope every enquiry and book the discovery call.",
    body: "For agencies, consultants and B2B services, the first conversation decides the deal. The agent qualifies the project and books the call.",
    points: [
      "Explains your services, process and engagement models from your content.",
      "Asks scoping questions before suggesting a service.",
      "Books discovery calls into your availability.",
      "Sends qualified leads to your CRM through outbound webhooks.",
    ],
    visual: <WebsiteWidget business="Northbeam Studio" script={S.services} />,
  },
  {
    id: "travel",
    label: "Travel & hospitality",
    title: "Packages, availability and callbacks, instantly.",
    body: "Travellers compare quickly. The agent answers package questions from your itineraries and captures callback requests while interest is high.",
    points: [
      "Packages, inclusions, prices and policies from your knowledge base.",
      "Asks about dates, group size and budget to recommend the right package.",
      "Callback requests captured with contact details and notes.",
      "Every enquiry visible in one inbox across website, WhatsApp and Instagram.",
    ],
    visual: <WhatsAppPhone business="Wander Kerala" script={S.travel} />,
  },
];

export default function SolutionsPage() {
  return (
    <main className="flex flex-1 flex-col">
      <PageHero
        eyebrow="Solutions"
        title="Built for businesses that sell through conversations."
        lead="If your customers ask questions before they buy, Waves AI Pilot answers them, qualifies them and books them, whatever your industry."
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Btn href="/sign-up">Start your free trial</Btn>
          <Btn href={DEMO_HREF} variant="secondary">
            Book a demo
          </Btn>
        </div>
      </PageHero>

      <AnchorNav
        items={[
          { id: "goals", label: "By goal" },
          ...INDUSTRIES.map((i) => ({ id: i.id, label: i.label.replace(" & professional services", "") })),
        ]}
      />

      <Section id="goals" className="scroll-mt-32" labelledBy="goals-heading">
        <SectionHeading align="center" eyebrow="By goal" id="goals-heading" title="Three jobs it does for every business." />
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {GOALS.map((g, i) => (
            <Reveal key={g.id} delay={i * 0.06}>
              <article id={g.id} className="h-full scroll-mt-40 rounded-[26px] border border-ds-border bg-ds-surface p-7">
                <span className="flex size-11 items-center justify-center rounded-xl bg-[#151713] text-[#b2ff38]">
                  <g.icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <h3 className="site-h3 mt-6">{g.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ds-text-secondary">{g.body}</p>
                <ul className="mt-5 flex flex-col gap-2 border-t border-ds-border pt-5">
                  {g.points.map((p) => (
                    <li key={p} className="flex items-center gap-2.5 text-[14px] text-ds-text-secondary">
                      <span className="size-1.5 rounded-full bg-[#7fbf1f]" aria-hidden="true" />
                      {p}
                    </li>
                  ))}
                </ul>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>

      <div className="border-t border-ds-border">
        {INDUSTRIES.map((ind, i) => (
          <FeatureBlock key={ind.id} id={ind.id} label={ind.label} title={ind.title} body={ind.body} points={ind.points} visual={ind.visual} flip={i % 2 === 1} />
        ))}
      </div>

      <p className="px-5 pb-16 text-center text-[12.5px] text-ds-text-muted">
        All conversations on this page are samples with illustrative businesses.
      </p>

      <CtaBand title="Your industry, your knowledge, your AI employee." />
    </main>
  );
}
