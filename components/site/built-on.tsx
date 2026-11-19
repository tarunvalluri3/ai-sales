import { BrandLogo, type BrandKey } from "./brand-logos";

/*
 * "Built on" strip: the platforms Waves AI Pilot actually runs on, shown with
 * their official logos and colours. A slow marquee on small screens, a
 * single row on wide ones.
 */

const STACK: { brand: BrandKey; label: string }[] = [
  { brand: "meta", label: "Meta" },
  { brand: "whatsapp", label: "WhatsApp Business" },
  { brand: "instagram", label: "Instagram" },
  { brand: "gemini", label: "Google Gemini" },
  { brand: "googlecloud", label: "Google Cloud" },
  { brand: "supabase", label: "Supabase" },
  { brand: "postgresql", label: "PostgreSQL" },
  { brand: "razorpay", label: "Razorpay" },
];

function Item({ brand, label }: { brand: BrandKey; label: string }) {
  return (
    <li className="flex shrink-0 items-center gap-2.5 text-[15px] font-medium text-ds-text-secondary">
      <BrandLogo brand={brand} className="size-[22px]" />
      {label}
    </li>
  );
}

export function BuiltOn({ className = "" }: { className?: string }) {
  return (
    <div className={`w-full ${className}`}>
      <p className="text-center font-label text-[11px] font-medium uppercase tracking-[0.22em] text-ds-text-muted">
        Built on trusted platforms
      </p>
      <div className="site-marquee-mask mt-6 overflow-hidden">
        <ul className="site-marquee flex w-max items-center gap-12" aria-label="Platforms Waves AI Pilot is built on">
          {STACK.map((s) => (
            <Item key={s.brand} {...s} />
          ))}
          {STACK.map((s) => (
            <li key={`${s.brand}-dup`} aria-hidden="true" className="flex shrink-0 items-center gap-2.5 text-[15px] font-medium text-ds-text-secondary">
              <BrandLogo brand={s.brand} className="size-[22px]" />
              {s.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
