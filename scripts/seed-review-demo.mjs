// Seeds the Meta App Review test business ("Waves Demo Store") for the
// business owned by the reviewer's email, and switches its Instagram
// override on. The reviewer account itself is created by hand through the
// normal sign-up page -- this script never creates users or passwords.
//
//   npm run seed:review-demo -- --email reviewer@example.com [--org org_xxx]
//
// Safe to run twice: products, services and FAQs are matched by name /
// question within this business and updated in place; business hours are
// replaced; nothing is duplicated. Every write is filtered by this one
// business's id. Uses SUPABASE_SECRET_KEY + CLERK_SECRET_KEY from
// .env.local; prints the Supabase project it acts on, never a secret.
//
// No Gemini call is made here: each product/service/FAQ's knowledge
// document is queued for ingestion (the same queue the dashboard uses), and
// the queue embeds it -- on the daily cron, or straight away whenever any
// catalog item is saved in the dashboard.
import { guardAgainstProduction } from "./lib/production-guard.mjs";

// Production readiness: refuses to touch the production Supabase project unless explicitly confirmed (scripts/lib/production-guard.mjs).
guardAgainstProduction({ scriptName: "seed:review-demo", allowOverride: true });

import {
  createServiceClient,
  describeSupabaseTarget,
  findBusinessOwnedBy,
  normalizeEmail,
  parseFlags,
  requireEnv,
  runScript,
  ScriptExit,
} from "./lib/owner-business.mjs";

const USAGE = `Usage:
  npm run seed:review-demo -- --email <reviewer email> [--org <clerk org id>]`;

const PROFILE = {
  name: "Waves Demo Store",
  business_type: "retail",
  timezone: "Asia/Kolkata",
  description:
    "Waves Demo Store is a small lifestyle and clothing store in Bengaluru. We sell everyday cotton and linen clothing and accessories, offer gift wrapping, and run in-store personal styling sessions. We ship across India and reply to messages during business hours.",
  instagram_enabled: true,
};

// day_of_week: 0 = Sunday ... 6 = Saturday (lib/business-hours.ts). Mon-Sat 10:00-19:00 IST, Sunday closed.
const HOURS = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  day_of_week: day,
  is_open: day !== 0,
  start_time: day !== 0 ? "10:00:00" : null,
  end_time: day !== 0 ? "19:00:00" : null,
}));

const PRODUCTS = [
  {
    name: "Classic Cotton T-Shirt",
    category: "Clothing",
    description: "Soft 100% cotton crew-neck t-shirt, regular fit. Sizes S to XXL, in white, black, navy and olive.",
    price: "₹799",
    price_amount: 799,
  },
  {
    name: "Linen Summer Shirt",
    category: "Clothing",
    description: "Breathable pure linen shirt with a relaxed fit, ideal for warm weather. Sizes S to XXL, in white, sky blue and beige.",
    price: "₹1,499",
    price_amount: 1499,
  },
  {
    name: "Canvas Tote Bag",
    category: "Accessories",
    description: "Sturdy cotton canvas tote with an inner zip pocket. Fits a 14-inch laptop. Available in natural and black.",
    price: "₹499",
    price_amount: 499,
  },
];

const SERVICES = [
  {
    name: "Personal Styling Session",
    category: "Styling",
    description:
      "A 45-minute one-to-one session in our store with a stylist who helps you put together outfits for work, travel or an occasion. Book in advance; the fee is adjusted against anything you buy that day.",
    price: "₹999",
    price_amount: 999,
  },
  {
    name: "Gift Wrapping",
    category: "Add-ons",
    description: "Recycled-paper gift wrapping with a handwritten note card, for any item ordered online or in store.",
    price: "₹99 per item",
    price_amount: 99,
  },
];

const FAQS = [
  {
    question: "What are your prices?",
    answer:
      "T-shirts are ₹799, linen shirts ₹1,499 and canvas tote bags ₹499. A personal styling session is ₹999 and gift wrapping is ₹99 per item. All prices include GST.",
  },
  {
    question: "Do you deliver, and how long does delivery take?",
    answer:
      "Yes, we deliver across India. Orders ship within 1 business day and usually arrive in 3 to 5 business days (1 to 2 days within Bengaluru). Delivery is free on orders above ₹1,500; below that it is ₹79.",
  },
  {
    question: "What are your store timings?",
    answer:
      "We are open Monday to Saturday, 10:00 AM to 7:00 PM IST, and closed on Sundays. Messages sent outside these hours are answered the next business day.",
  },
  {
    question: "How do I book a personal styling session?",
    answer:
      "Send us a message with your preferred date and time (Monday to Saturday, 10:00 AM to 6:00 PM) and we will confirm a slot. A session lasts 45 minutes and costs ₹999, adjusted against anything you buy that day.",
  },
  {
    question: "What is your return and refund policy?",
    answer:
      "Unused items with tags can be returned within 7 days of delivery. Once we receive the item, the refund goes back to your original payment method within 5 to 7 business days. Gift wrapping and styling sessions are non-refundable.",
  },
  {
    question: "How can I contact you?",
    answer:
      "Message us right here on Instagram or through the chat on our website, Monday to Saturday between 10:00 AM and 7:00 PM IST. For an order question, please include your order number.",
  },
];

// Must match lib/products.ts / lib/services.ts / lib/faqs.ts buildKnowledgeContent().
function catalogContent(item) {
  return [item.name, `Category: ${item.category}`, item.description, `Price: ${item.price}`].join("\n\n");
}
function faqContent(faq) {
  return `Q: ${faq.question}\n\nA: ${faq.answer}`;
}

function check(error, what) {
  if (error) throw new ScriptExit(`Could not ${what}.`);
}

/** Same columns lib/knowledge.ts enqueueIngestion() sets. */
async function syncKnowledgeDocument(supabase, businessId, sourceType, sourceId, title, content) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("knowledge_documents").upsert(
    {
      business_id: businessId,
      source_type: sourceType,
      source_id: sourceId,
      title,
      content,
      ingestion_status: "pending",
      ingestion_attempts: 0,
      ingestion_last_error: null,
      ingestion_next_attempt_at: now,
      ingestion_updated_at: now,
    },
    { onConflict: "business_id,source_type,source_id" },
  );
  check(error, `save the knowledge document for "${title}"`);
}

/** Insert-or-update one row matched by `matchColumn` within this business. Returns { id, created }. */
async function upsertByKey(supabase, table, businessId, matchColumn, row) {
  const { data: existing, error: readError } = await supabase
    .from(table)
    .select("id")
    .eq("business_id", businessId)
    .eq(matchColumn, row[matchColumn])
    .order("created_at", { ascending: true })
    .limit(1);
  check(readError, `read ${table}`);

  if (existing.length > 0) {
    const { error } = await supabase
      .from(table)
      .update({ ...row, status: "approved" })
      .eq("business_id", businessId)
      .eq("id", existing[0].id);
    check(error, `update ${table} "${row[matchColumn]}"`);
    return { id: existing[0].id, created: false };
  }

  const { data, error } = await supabase
    .from(table)
    .insert({ business_id: businessId, ...row, status: "approved" })
    .select("id")
    .single();
  check(error, `create ${table} "${row[matchColumn]}"`);
  return { id: data.id, created: true };
}

await runScript(async () => {
  const flags = parseFlags(process.argv.slice(2), ["email", "org"]);
  if (!flags.email) throw new ScriptExit("--email is required.", 2);
  const email = normalizeEmail(flags.email);
  requireEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "CLERK_SECRET_KEY"], "seed:review-demo");

  console.log(`Supabase project: ${describeSupabaseTarget()}`);

  const supabase = createServiceClient();
  const business = await findBusinessOwnedBy(supabase, email, flags.org);
  const businessId = business.id;
  console.log(`Seeding business "${business.name}" (org ${business.clerk_org_id})`);

  const { error: profileError } = await supabase.from("businesses").update(PROFILE).eq("id", businessId);
  check(profileError, "update the business profile (is migration 20261113000000 applied?)");

  const { error: deleteHoursError } = await supabase.from("business_hours").delete().eq("business_id", businessId);
  check(deleteHoursError, "clear business hours");
  const { error: hoursError } = await supabase
    .from("business_hours")
    .insert(HOURS.map((day) => ({ business_id: businessId, ...day })));
  check(hoursError, "save business hours");

  const counts = { created: 0, updated: 0 };
  const tally = ({ created }) => (created ? counts.created++ : counts.updated++);

  for (const product of PRODUCTS) {
    const result = await upsertByKey(supabase, "products", businessId, "name", product);
    tally(result);
    await syncKnowledgeDocument(supabase, businessId, "product", result.id, product.name, catalogContent(product));
  }
  for (const service of SERVICES) {
    const result = await upsertByKey(supabase, "services", businessId, "name", service);
    tally(result);
    await syncKnowledgeDocument(supabase, businessId, "service", result.id, service.name, catalogContent(service));
  }
  for (const faq of FAQS) {
    const result = await upsertByKey(supabase, "faqs", businessId, "question", faq);
    tally(result);
    await syncKnowledgeDocument(supabase, businessId, "faq", result.id, faq.question, faqContent(faq));
  }

  console.log(`Business name:     ${PROFILE.name}`);
  console.log(`instagram_enabled: true`);
  console.log(`Business hours:    Mon-Sat 10:00-19:00 IST, Sunday closed`);
  console.log(
    `Catalog + FAQs:    ${PRODUCTS.length} products, ${SERVICES.length} services, ${FAQS.length} FAQs (${counts.created} created, ${counts.updated} updated)`,
  );
  console.log("Knowledge:         queued for ingestion (runs on the daily cron, or when any catalog item is saved in the dashboard)");
}, USAGE);
