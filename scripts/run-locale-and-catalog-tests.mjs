// Unit tests for the 2026-11-20 onboarding fixes (STATE.md): business time
// zone detection and validation, default saved hours, business currency,
// catalog prices as display text (Indian grouping included), the product /
// service form keeping its values on a server-side rejection, and the sticky
// footer overlap on the knowledge step.
//
// Pure modules plus static source checks: no network, no database, no model,
// no secrets. The database side (currency column, price as text, snapshot
// normalisation, 0 unpublished changes) is pgTAP 078.
//
// Run: npm run test:locale-catalog
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

register("./alias-resolver-hooks.mjs", import.meta.url);

const tz = await import(new URL("../lib/timezones.ts", import.meta.url).href);
const money = await import(new URL("../lib/currency.ts", import.meta.url).href);
const hours = await import(new URL("../lib/business-hours-defaults.ts", import.meta.url).href);
const catalog = await import(new URL("../lib/schemas/catalog.ts", import.meta.url).href);
const businessSchemas = await import(new URL("../lib/schemas/business.ts", import.meta.url).href);

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// ---------------------------------------------------------------- time zone

test("time zone: the legacy name Chrome reports for India becomes Asia/Kolkata (the root cause of the UTC sign-up)", () => {
  assert.deepEqual(tz.normalizeTimezone("Asia/Calcutta"), { ok: true, timezone: "Asia/Kolkata" });
  assert.deepEqual(tz.normalizeTimezone("Asia/Kolkata"), { ok: true, timezone: "Asia/Kolkata" });
  assert.deepEqual(tz.normalizeTimezone("  Asia/Kolkata  "), { ok: true, timezone: "Asia/Kolkata" });
});

test("time zone: a US browser keeps its own US zone, including the ones the old 21-zone list dropped", () => {
  for (const zone of ["America/New_York", "America/Chicago", "America/Phoenix", "America/Detroit", "America/Anchorage", "Pacific/Honolulu", "America/Indiana/Indianapolis", "America/Los_Angeles"]) {
    assert.deepEqual(tz.normalizeTimezone(zone), { ok: true, timezone: zone }, zone);
  }
  assert.deepEqual(tz.normalizeTimezone("US/Arizona"), { ok: true, timezone: "America/Phoenix" });
  assert.deepEqual(tz.normalizeTimezone("US/Eastern"), { ok: true, timezone: "America/New_York" });
});

test("time zone: no zone sent is an error, never a silent UTC", () => {
  for (const value of [undefined, null, "", "   ", 42]) {
    assert.deepEqual(tz.normalizeTimezone(value), { ok: false, reason: "missing" }, String(value));
  }
});

test("time zone: an invalid or hostile string is rejected", () => {
  for (const value of ["Mars/Olympus_Mons", "Asia/Kolkata<script>", "../../etc/passwd", "Asia/Kolkata; drop table", "x".repeat(65), "Not A Zone"]) {
    assert.deepEqual(tz.normalizeTimezone(value), { ok: false, reason: "invalid" }, value);
  }
  assert.ok(tz.TIMEZONE_ERROR_MESSAGES.missing && tz.TIMEZONE_ERROR_MESSAGES.invalid);
});

test("time zone picker: common zones first in the agreed order, then every other zone under current names, no duplicates", () => {
  assert.deepEqual(tz.COMMON_TIMEZONES.slice(0, 1), ["Asia/Kolkata"]);
  for (const zone of ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Asia/Dubai", "Asia/Singapore", "Australia/Sydney"]) {
    assert.ok(tz.COMMON_TIMEZONES.includes(zone), zone);
  }
  const others = tz.otherTimezones();
  assert.ok(others.length > 300, `full list, got ${others.length}`);
  assert.ok(!others.includes("Asia/Calcutta"), "legacy names are shown under their current name");
  assert.ok(!others.some((zone) => tz.COMMON_TIMEZONES.includes(zone)), "common zones are not repeated in the full list");
  assert.equal(new Set(others).size, others.length);
  assert.equal(tz.timezoneLabel("America/Indiana/Indianapolis"), "Indianapolis (America / Indiana)");
  assert.equal(tz.timezoneOffsetLabel("Asia/Kolkata"), "UTC+5:30");
});

// ----------------------------------------------------------------- currency

test("currency: defaults from the detected zone; India and anything unmapped (incl. UTC) is INR", () => {
  const cases = {
    "Asia/Kolkata": "INR",
    UTC: "INR",
    "America/Sao_Paulo": "INR",
    "America/New_York": "USD",
    "America/Phoenix": "USD",
    "Pacific/Honolulu": "USD",
    "America/Toronto": "CAD",
    "Europe/London": "GBP",
    "Europe/Berlin": "EUR",
    "Asia/Dubai": "AED",
    "Asia/Singapore": "SGD",
    "Australia/Sydney": "AUD",
  };
  for (const [zone, code] of Object.entries(cases)) assert.equal(money.currencyForTimezone(zone), code, zone);
  for (const code of Object.values(cases)) assert.ok(money.isSupportedCurrency(code), code);
  assert.equal(money.isSupportedCurrency("rupees"), false);
  assert.equal(businessSchemas.businessCurrencySchema.safeParse("XYZ").success, false);
  assert.equal(businessSchemas.businessCurrencySchema.safeParse("INR").success, true);
});

test("price: Indian grouping is parsed and formatted -- ₹1,20,000 <-> 120000", () => {
  assert.equal(money.parsePriceAmount("₹1,20,000"), 120000);
  assert.equal(money.parsePriceAmount("Rs 12,34,567"), 1234567);
  assert.equal(money.formatMoney(120000, "INR"), "₹1,20,000");
  assert.equal(money.formatCatalogPrice("120000", "INR"), "₹1,20,000");
  assert.equal(money.formatCatalogPrice("1,20,000", "INR"), "₹1,20,000");
  assert.equal(money.formatCatalogPrice("1234567", "INR"), "₹12,34,567");
});

test("price: a single plain number is derived from display text", () => {
  const cases = { "Rs 6,500": 6500, "From ₹1,200": 1200, "₹500/session": 500, "6500": 6500, "₹ 2,50,000 per year": 250000, "Rs. 6,500.": 6500, "19.99": 19.99, "$1,234,567": 1234567 };
  for (const [text, amount] of Object.entries(cases)) assert.equal(money.parsePriceAmount(text), amount, text);
});

test("price: ranges, shorthand, words and ambiguous groupings are NOT derived (left blank)", () => {
  for (const text of ["₹1.2 lakh", "6.5k", "₹2 crore", "5 thousand", "₹500-₹800", "₹500 - 800", "₹500 to ₹800", "500 or 800", "Contact us", "", null, "1,2,3", "2 sessions for ₹900"]) {
    assert.equal(money.parsePriceAmount(text), null, String(text));
  }
});

test("price: display text is shown exactly as typed; a plain number gets the business currency", () => {
  assert.equal(money.formatCatalogPrice("From ₹1,200", "INR"), "From ₹1,200");
  assert.equal(money.formatCatalogPrice("Rs 6,500", "INR"), "Rs 6,500");
  assert.equal(money.formatCatalogPrice("Contact us for pricing", "INR"), "Contact us for pricing");
  assert.equal(money.formatCatalogPrice("6500", "INR"), "₹6,500");
  assert.equal(money.formatCatalogPrice(6500, "INR"), "₹6,500", "a pre-migration snapshot number");
  assert.equal(money.formatCatalogPrice("19.9", "INR"), "₹19.90");
  assert.equal(money.formatCatalogPrice("19.99", "USD"), "$19.99");
  assert.equal(money.formatCatalogPrice("  ", "INR"), null);
  assert.equal(money.formatCatalogPrice(null, "INR"), null);
});

test("price: no '$' anywhere for an INR business (every numeric form, every amount)", () => {
  for (const price of ["6500", "6,500", "1,20,000", "99", "0", "19.99", 6500, 99.5, "1000000"]) {
    const shown = money.formatCatalogPrice(price, "INR");
    assert.ok(shown && !shown.includes("$"), `${price} -> ${shown}`);
    assert.ok(shown.startsWith("₹"), `${price} -> ${shown}`);
  }
  assert.ok(!money.pricePlaceholder("INR").includes("$"));
});

// ----------------------------------------------------- the catalog form

function form(values) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

test("catalog form: 'Rs 6,500' is accepted as the display price and the budget amount is derived", () => {
  const result = catalog.parseCatalogForm(form({ name: "Teeth Whitening", description: "In-clinic", price: "Rs 6,500", category: "Cosmetic", image_url: "", price_amount: "" }));
  assert.equal(result.ok, true);
  assert.equal(result.data.price, "Rs 6,500");
  assert.equal(result.data.price_amount, 6500);
});

test("catalog form: an explicit budget amount wins; a range price leaves it blank", () => {
  const explicit = catalog.parseCatalogForm(form({ name: "A", price: "From ₹1,200", price_amount: "1,500" }));
  assert.equal(explicit.ok && explicit.data.price_amount, 1500);
  const range = catalog.parseCatalogForm(form({ name: "B", price: "₹500-₹800", price_amount: "" }));
  assert.equal(range.ok && range.data.price_amount, null);
});

test("catalog form: a server-side rejection returns EVERY field error and the exact values typed (the form keeps them)", () => {
  const typed = { name: "Teeth Whitening", description: "In-clinic session", price: "x".repeat(61), category: "Cosmetic", image_url: "not a url", price_amount: "abc" };
  const result = catalog.parseCatalogForm(form(typed));
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.fieldErrors).sort(), ["image_url", "price", "price_amount"]);
  assert.match(result.fieldErrors.price_amount, /number/i);
  assert.match(result.fieldErrors.price, /60/);
  assert.deepEqual(result.values, typed, "values are echoed back untouched");
});

test("catalog form: a missing name is reported on the name field", () => {
  const result = catalog.parseCatalogForm(form({ name: "  ", price: "Rs 500" }));
  assert.equal(result.ok, false);
  assert.ok(result.fieldErrors.name);
  assert.equal(result.values.price, "Rs 500");
});

test("catalog form: control characters are stripped from the display price", () => {
  const result = catalog.parseCatalogForm(form({ name: "A", price: "₹500\u0000\u0007 /session" }));
  assert.equal(result.ok && result.data.price, "₹500 /session");
});

test("wiring: product and service actions return fieldErrors + values; forms re-mount fields from them and show errors per field", () => {
  for (const kind of ["products", "services"]) {
    const actions = read(`app/(dashboard)/dashboard/${kind}/actions.ts`);
    assert.match(actions, /parseCatalogForm\(formData\)/);
    assert.match(actions, /fieldErrors: parsed\.fieldErrors, values: parsed\.values/);
    assert.doesNotMatch(actions, /parsed\.error\.issues\[0\]/, "no more single first-error message");
    const formSource = read(`app/(dashboard)/dashboard/${kind}/${kind.slice(0, -1)}-form.tsx`);
    assert.match(formSource, /<div key=\{fieldsVersion\}/);
    assert.match(formSource, /defaultValue=\{values\?\.price \?\? initialPrice\}/);
    assert.match(formSource, /\{fieldError\("price"\)\}/);
    assert.doesNotMatch(formSource, /inputMode="decimal"\n\s+placeholder="19\.99"/, "the display price is not a number-only field any more");
  }
});

// -------------------------------------------------- default saved hours

test("default hours: Mon-Fri 09:00-18:00 open, Sat and Sun closed, all seven days saved", () => {
  const week = hours.defaultWeeklyHours();
  assert.equal(week.length, 7);
  assert.deepEqual(week.map((d) => d.dayOfWeek), [0, 1, 2, 3, 4, 5, 6]);
  for (const day of week) {
    if (day.dayOfWeek === 0 || day.dayOfWeek === 6) assert.deepEqual(day, { dayOfWeek: day.dayOfWeek, isOpen: false, startTime: null, endTime: null });
    else assert.deepEqual(day, { dayOfWeek: day.dayOfWeek, isOpen: true, startTime: "09:00", endTime: "18:00" });
  }
});

test("wiring: a new business saves real default hours; onboarding never falls back to UTC; the detected zone is shown", () => {
  const business = read("lib/business.ts");
  assert.match(business, /from\("business_hours"\)\.insert\(\n\s+\(input\.hours \?\? defaultWeeklyHours\(\)\)\.map/);
  assert.match(business, /currency: input\.currency/);
  const actions = read("app/(dashboard)/onboarding/actions.ts");
  assert.match(actions, /normalizeTimezone\(formData\.get\("timezone"\)\)/);
  assert.doesNotMatch(actions, /: "UTC"/, "no silent UTC fallback");
  assert.match(actions, /fieldErrors\.timezone = TIMEZONE_ERROR_MESSAGES\[zone\.reason\]/);
  const step = read("app/(dashboard)/onboarding/_components/steps/business-step.tsx");
  assert.match(step, /function getServerTimezone\(\): string \{\n\s+return "";/);
  assert.match(step, /Detected from your browser/);
  assert.match(step, /<TimezonePicker/);
  assert.doesNotMatch(step, /TIMEZONE_OPTIONS/);
  const hoursAction = read("app/(dashboard)/dashboard/business-hours/actions.ts");
  assert.match(hoursAction, /normalizeTimezone\(formData\.get\("timezone"\)\)/);
  assert.doesNotMatch(hoursAction, /: "UTC"/);
});

test("wiring: the hours form copy says one consistent thing about an unsaved schedule", () => {
  const formSource = read("app/(dashboard)/dashboard/business-hours/business-hours-form.tsx");
  assert.doesNotMatch(formSource, /An unconfigured schedule is treated as always open/);
  assert.doesNotMatch(formSource, /even though this form displays default hours/);
  assert.match(formSource, /appointment booking offers prospects no times, and widget\n\s+greetings and SLA alerts treat you as always open/);
  assert.match(formSource, /weekFromBusinessHours\(hours\)/);
  assert.match(read("lib/business-hours-defaults.ts"), /if \(!hours\.length\) return defaultWeeklyHours\(\)/);
});

// --------------------------------------------------------- sticky footer

test("wiring: Continue cannot be covered on the knowledge step -- footer above content, card not sticky in the wizard", () => {
  const shell = read("app/(dashboard)/onboarding/_components/wizard-shell.tsx");
  assert.match(shell, /className="sticky bottom-0 z-20 border-t/);
  const step = read("app/(dashboard)/onboarding/_components/steps/train-knowledge-step.tsx");
  assert.match(step, /<AddKnowledgeTabs\n\s+sticky=\{false\}/);
  const tabs = read("app/(dashboard)/dashboard/knowledge/_components/add-knowledge-tabs.tsx");
  assert.match(tabs, /sticky \? "xl:sticky xl:top-4" : ""/);
  // No other component the wizard renders is sticky.
  for (const file of ["train-products-step", "train-faqs-step", "persona-step", "channels-step", "plan-step", "review-step", "business-step"]) {
    assert.doesNotMatch(read(`app/(dashboard)/onboarding/_components/steps/${file}.tsx`), /\bsticky\b/, file);
  }
});

// ---------------------------------------------------- no hard-coded "$"

test("wiring: no hard-coded '$' before a catalog price anywhere a price is shown", () => {
  for (const file of [
    "app/(dashboard)/dashboard/products/page.tsx",
    "app/(dashboard)/dashboard/products/products-list.tsx",
    "app/(dashboard)/dashboard/services/page.tsx",
    "app/(dashboard)/dashboard/services/services-list.tsx",
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /\$\{(product|service)\.price\}/, file);
    assert.match(source, /formatCatalogPrice\((product|service)\.price, currency\)/, file);
  }
  for (const file of ["lib/tools/check-product-details.ts", "lib/tools/list-offerings.ts", "lib/tools/recommend-products.ts", "lib/products.ts", "lib/services.ts"]) {
    assert.match(read(file), /formatCatalogPrice\(/, file);
  }
  const rag = read("lib/rag.ts");
  assert.match(rag, /this business prices everything in \$\{profile\.currency\}/);
  assert.match(rag, /executeBusinessToolCall\(supabase, businessId, conversationId, toolCall, searchedQueries, source, businessProfile\.currency[,)]/); // widget reliability item 3 appends display-only time zones
});

const { getWidgetStrings, SUPPORTED_WIDGET_LANGUAGES } = await import("../lib/widget-i18n.ts");
const { widgetLanguageSchema } = await import("../lib/schemas/business.ts");
test("Indic widget locales cover all chrome strings, preserve placeholders, and auto uses English", () => {
  const english = getWidgetStrings("en");
  for (const language of ["te", "ta", "kn", "mr", "bn"]) {
    assert.ok(SUPPORTED_WIDGET_LANGUAGES.includes(language));
    assert.equal(widgetLanguageSchema.parse(language), language);
    const strings = getWidgetStrings(language);
    for (const key of Object.keys(english)) assert.ok(strings[key], language + " misses " + key);
    assert.match(strings.escalationBannerKnownContact, /\{contact\}/);
    assert.match(strings.defaultQuestionPrice, /\{name\}/);
    assert.match(strings.defaultQuestionAbout, /\{name\}/);
    assert.notEqual(strings.openChatLabel, english.openChatLabel);
  }
  assert.equal(widgetLanguageSchema.parse("auto"), "auto");
  assert.equal(getWidgetStrings("auto"), english);
});
