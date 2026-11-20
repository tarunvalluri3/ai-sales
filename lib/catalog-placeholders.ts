import { formatMoney, pricePlaceholder } from "@/lib/currency";

const names: Record<string, string> = {
  healthcare: "Teeth whitening",
  real_estate: "2BHK at Palm Grove",
  education: "Python course (3 months)",
  retail: "Linen co-ord set",
  ecommerce: "Linen co-ord set",
};

export function catalogPlaceholders(industry: string | null, currency: string, kind: "product" | "service") {
  const name = names[industry ?? ""] ?? (kind === "product" ? "Starter Kit" : "Initial consultation");
  let price = pricePlaceholder(currency);
  if (industry === "healthcare") price = currency === "INR" ? "₹6,500" : formatMoney(65, currency);
  if (industry === "real_estate") price = currency === "INR" ? "₹78 lakh" : formatMoney(78000, currency);
  return { name: "e.g. " + name, price };
}
