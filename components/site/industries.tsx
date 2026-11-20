import type { ReactNode } from "react";
import {
  InstagramPhone,
  ProductCard,
  SlotCard,
  WebsiteWidget,
  WhatsAppPhone,
  type ChatLine,
} from "./chat-illustrations";
import { ORDERED_PLANS, TRIAL_DAYS, formatPaiseAsInr } from "@/lib/plans";

/*
 * Industry landing pages (/solutions/[slug]). One entry per industry: the
 * search-facing title/description/keywords, the page copy, a sample chat
 * (illustrative business, labelled as a sample on the page), the questions
 * that industry's customers ask, and an FAQ that is also emitted as
 * FAQPage structured data -- so FAQ answers are plain strings.
 */

export type Industry = {
  slug: string;
  name: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  h1: string;
  lead: string;
  visual: ReactNode;
  problem: string;
  points: string[];
  questions: string[];
  features: { title: string; body: string }[];
  faq: { q: string; a: string }[];
};

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

const COMMON_FAQ = (industry: string): { q: string; a: string }[] => [
  {
    q: `Will the AI give wrong information to my ${industry} customers?`,
    a: "No. Waves AI Pilot answers only from the products, services, FAQs and documents you approve. When something isn't in your knowledge base, it says it doesn't know and asks a clarifying question or hands the conversation to your team.",
  },
  {
    q: "Which channels does it work on?",
    a: "Your website chat widget on every plan, plus WhatsApp Business and Instagram direct messages on the Growth and Scale plans, using your own Meta accounts. All conversations land in one inbox.",
  },
  {
    q: "How much does it cost?",
    a: `Plans start at ${formatPaiseAsInr(ORDERED_PLANS[0].monthlyPricePaise)} a month including GST, priced by the number of AI replies you need. Every business starts with a ${TRIAL_DAYS}-day free trial.`,
  },
];

export const INDUSTRY_PAGES: Industry[] = [
  {
    slug: "real-estate",
    name: "Real estate",
    metaTitle: "AI Chatbot for Real Estate | WhatsApp Lead Qualification & Site Visits | Waves AI Pilot",
    metaDescription:
      "An AI sales agent for builders, developers and property brokers. Answers property enquiries on WhatsApp, Instagram and your website, qualifies buyers by budget and timeline, and books site visits.",
    keywords: ["AI chatbot for real estate", "real estate WhatsApp chatbot", "property lead qualification", "site visit booking chatbot", "real estate CRM automation India"],
    h1: "AI sales agent for real estate: qualify buyers and book site visits.",
    lead: "Property enquiries arrive at all hours, on every channel. Waves AI Pilot answers from your project details, asks about budget and purpose, and requests the site visit, so your sales team only calls serious buyers.",
    visual: <WebsiteWidget business="Skyline Homes" script={S.realEstate} />,
    problem: "Buyers compare several projects at once and expect an instant answer. A slow reply on WhatsApp or a missed website chat sends them to the next builder.",
    points: [
      "Answers on configurations, prices, locations, amenities and possession dates from your listings.",
      "Asks about budget, timeline and purpose before recommending a project.",
      "Requests site visits from your real availability, pending your team's confirmation.",
      "Scores every buyer 0–11 so your sales team calls the serious ones first.",
    ],
    questions: ["Is it ready to move?", "What's the price per sq ft?", "Do you have 2BHK under ₹90L?", "Can I visit this weekend?", "Is there a home-loan tie-up?", "What's the possession date?"],
    features: [
      { title: "Site-visit booking", body: "Slots from your weekly schedule, one booking per slot across channels." },
      { title: "Buyer qualification", body: "Hot, warm or cold with an itemised score and reason." },
      { title: "Follow-up workflows", body: "Automatic tasks and alerts when a hot buyer goes quiet." },
    ],
    faq: COMMON_FAQ("real estate"),
  },
  {
    slug: "clinics",
    name: "Clinics & healthcare",
    metaTitle: "AI Receptionist Chatbot for Clinics | Appointment Booking on WhatsApp | Waves AI Pilot",
    metaDescription:
      "An AI chatbot for clinics, dental and skin care practices. Answers treatment, timing and fee questions from your approved content and requests appointments on WhatsApp, Instagram and your website.",
    keywords: ["AI chatbot for clinics", "clinic appointment booking chatbot", "dental clinic WhatsApp chatbot", "AI receptionist for clinics", "healthcare chatbot India"],
    h1: "AI chatbot for clinics: answer patient questions and fill your calendar.",
    lead: "Patients want to know what you treat, what it costs and when you're free. Waves AI Pilot answers from information your clinic approves and requests appointments for your front desk to confirm.",
    visual: <WhatsAppPhone business="Clearskin Clinic" script={S.clinic} />,
    problem: "Front desks are busy with walk-ins and calls, so WhatsApp messages and Instagram DMs wait for hours, and patients book elsewhere.",
    points: [
      "Treatments, doctors, timings, fees and location answered from your approved content.",
      "Never gives medical advice beyond what you've published; it hands off to your staff instead.",
      "Appointment requests stay pending until your front desk confirms them.",
      "Patients are notified by email and WhatsApp once confirmed.",
    ],
    questions: ["Do you treat hair fall?", "What's the consultation fee?", "Is the doctor available on Sunday?", "Where is the clinic?", "How long does the treatment take?", "Can I book for tomorrow evening?"],
    features: [
      { title: "Appointment requests", body: "Real slots from your clinic hours; holidays and breaks respected." },
      { title: "Human handoff", body: "Sensitive questions go straight to your staff." },
      { title: "Multilingual widget", body: "English, Hindi and four more languages on your website." },
    ],
    faq: COMMON_FAQ("clinic"),
  },
  {
    slug: "education",
    name: "Education & coaching",
    metaTitle: "AI Chatbot for Coaching Institutes & EdTech | Course Enquiries & Demo Classes | Waves AI Pilot",
    metaDescription:
      "An AI admissions assistant for coaching centres, training institutes and edtech. Answers course, batch and fee questions on WhatsApp and your website, and books demo classes and counselling calls.",
    keywords: ["AI chatbot for coaching institutes", "education chatbot", "admission enquiry chatbot", "course enquiry WhatsApp automation", "edtech lead generation"],
    h1: "AI admissions assistant for coaching and training institutes.",
    lead: "Students and parents ask the same questions about batches, fees and outcomes. Waves AI Pilot answers them instantly and moves every enquiry toward a demo class or a counselling call.",
    visual: <WebsiteWidget business="Brightpath Academy" script={S.education} />,
    problem: "Admission enquiries peak in the evening and on weekends, exactly when counsellors are offline, and slow replies lose students to competing institutes.",
    points: [
      "Courses, batches, schedules, fees and EMI options from your catalogue.",
      "Recommends the right course from what the student says about goals and level.",
      "Captures student and parent contact details as qualified leads.",
      "Automated follow-up workflows for enquiries that go quiet.",
    ],
    questions: ["Do you have weekend batches?", "What are the fees?", "Is there an EMI option?", "Do you offer placement support?", "Can I attend a demo class?", "Is the course online or offline?"],
    features: [
      { title: "Course recommendations", body: "Matches students to the right course from your catalogue." },
      { title: "Demo-class booking", body: "Seats requested straight from the chat." },
      { title: "Counsellor copilot", body: "Today's priority enquiries and a brief on each." },
    ],
    faq: COMMON_FAQ("education"),
  },
  {
    slug: "salons",
    name: "Salons & wellness",
    metaTitle: "Instagram DM Automation for Salons & Spas | AI Booking Chatbot | Waves AI Pilot",
    metaDescription:
      "Reply to every salon and spa enquiry on Instagram and WhatsApp with real prices and services, and book appointments automatically. An AI booking assistant for beauty and wellness businesses.",
    keywords: ["Instagram DM automation for salons", "salon booking chatbot", "spa WhatsApp chatbot", "beauty salon AI assistant", "wellness appointment booking"],
    h1: "Instagram and WhatsApp booking assistant for salons and spas.",
    lead: "Most salon enquiries start in Instagram DMs. Waves AI Pilot replies to every message with your real prices and requests the appointment, so no enquiry is left on read.",
    visual: <InstagramPhone handle="lumesalon.hyd" script={S.salon} />,
    problem: "Stylists can't answer DMs mid-service, and \"price?\" messages left unanswered for hours are bookings lost.",
    points: [
      "Service menu, prices and durations answered instantly.",
      "Bookings requested from your actual working hours.",
      "Human handoff for special requests and complaints.",
      "Six widget languages, including Hindi, for your website.",
    ],
    questions: ["How much is keratin?", "Are you open on Sunday?", "Do you have bridal packages?", "Can I book for Friday?", "Which products do you use?", "How long does a facial take?"],
    features: [
      { title: "Instagram DM replies", body: "On your professional account, linked to your Facebook Page." },
      { title: "Appointment booking", body: "Requests in your calendar, confirmed by you in one click." },
      { title: "Customer profiles", body: "Every client's chats and bookings across channels in one place." },
    ],
    faq: COMMON_FAQ("salon"),
  },
  {
    slug: "retail",
    name: "Retail & D2C brands",
    metaTitle: "AI Shopping Assistant for D2C Brands | Product Recommendations on Instagram & WhatsApp | Waves AI Pilot",
    metaDescription:
      "An AI shopping assistant for retail and D2C brands. Recommends products with photos and prices from your catalogue in Instagram DMs, WhatsApp and website chat, and captures high-intent shoppers.",
    keywords: ["AI shopping assistant", "D2C chatbot", "product recommendation chatbot", "Instagram DM sales automation", "ecommerce WhatsApp chatbot India"],
    h1: "AI shopping assistant for retail and D2C brands.",
    lead: "Shoppers ask before they buy. Waves AI Pilot asks what they're looking for and recommends specific products from your catalogue, with photo cards, in every conversation.",
    visual: <InstagramPhone handle="aria.jewels" script={S.retail} />,
    problem: "Shoppers DM to ask about sizes, materials and delivery. Every unanswered question is an abandoned purchase.",
    points: [
      "Product recommendations with photos and prices, grounded in your catalogue.",
      "Answers sizing, materials, shipping and return policies from your FAQs.",
      "Handles \"is it worth it?\" with your real product details, never invented discounts.",
      "Captures high-intent shoppers as leads for your team.",
    ],
    questions: ["Is this available in M?", "What's the return policy?", "Gift under ₹2,000?", "How long is delivery?", "Is it pure silver?", "Do you have COD?"],
    features: [
      { title: "Product cards", body: "Photo, name and price shown right inside the chat." },
      { title: "Catalogue knowledge", body: "Products, policies and FAQs, always up to date when you publish." },
      { title: "Lead capture", body: "Shoppers who ask for a callback become scored leads." },
    ],
    faq: COMMON_FAQ("retail"),
  },
  {
    slug: "services",
    name: "Agencies & professional services",
    metaTitle: "AI Lead Qualification for Agencies & B2B Services | Book Discovery Calls | Waves AI Pilot",
    metaDescription:
      "An AI sales agent for agencies, consultants and B2B service firms. Scopes every enquiry, qualifies the project and books discovery calls, then sends qualified leads to your CRM with webhooks.",
    keywords: ["AI lead qualification for agencies", "B2B chatbot", "discovery call booking", "consulting lead generation AI", "agency website chatbot"],
    h1: "AI lead qualification for agencies and professional services.",
    lead: "For agencies, consultants and B2B services, the first conversation decides the deal. Waves AI Pilot scopes the project, qualifies the buyer and books the discovery call.",
    visual: <WebsiteWidget business="Northbeam Studio" script={S.services} />,
    problem: "Website enquiries range from serious projects to students asking for internships. Your team wastes hours sorting them.",
    points: [
      "Explains your services, process and engagement models from your content.",
      "Asks scoping questions before suggesting a service.",
      "Books discovery calls into your availability.",
      "Sends qualified leads to your CRM through signed outbound webhooks.",
    ],
    questions: ["Can you build an e-commerce site?", "What's your process?", "How long does a project take?", "Do you offer maintenance?", "Can we get on a call?", "Have you worked in our industry?"],
    features: [
      { title: "Discovery-call booking", body: "Calls requested from your calendar availability." },
      { title: "CRM webhooks", body: "Qualified leads sent to your CRM, Zapier or Make." },
      { title: "Sales copilot", body: "Who to call first, with a brief grounded in the conversation." },
    ],
    faq: COMMON_FAQ("agency"),
  },
  {
    slug: "travel",
    name: "Travel & hospitality",
    metaTitle: "AI Chatbot for Travel Agencies & Hotels | WhatsApp Enquiries & Callbacks | Waves AI Pilot",
    metaDescription:
      "An AI travel assistant for tour operators, travel agencies and hotels. Answers package and availability questions on WhatsApp, Instagram and your website, and captures callback requests.",
    keywords: ["AI chatbot for travel agency", "travel WhatsApp chatbot", "hotel booking enquiry chatbot", "tour package lead generation", "hospitality AI assistant"],
    h1: "AI travel assistant for tour operators and hospitality.",
    lead: "Travellers compare quickly. Waves AI Pilot answers package questions from your itineraries and captures callback requests while interest is high.",
    visual: <WhatsAppPhone business="Wander Kerala" script={S.travel} />,
    problem: "Holiday enquiries arrive at night and on weekends, and travellers book with whoever replies with a clear package first.",
    points: [
      "Packages, inclusions, prices and policies from your knowledge base.",
      "Asks about dates, group size and budget to recommend the right package.",
      "Callback requests captured with contact details and notes.",
      "Every enquiry visible in one inbox across website, WhatsApp and Instagram.",
    ],
    questions: ["5-day Kerala package for two?", "What's included?", "Is December available?", "Can you customise the itinerary?", "What's the cancellation policy?", "Can someone call me?"],
    features: [
      { title: "Package recommendations", body: "Matches travellers to the right package from your itineraries." },
      { title: "Callback capture", body: "Contact details and notes saved as a scored lead." },
      { title: "Omnichannel inbox", body: "Website, WhatsApp and Instagram enquiries together." },
    ],
    faq: COMMON_FAQ("travel"),
  },
];

export function industryBySlug(slug: string) {
  return INDUSTRY_PAGES.find((i) => i.slug === slug);
}
