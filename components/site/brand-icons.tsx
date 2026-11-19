import { BRANDS } from "./brand-logos";

/*
 * Channel marks on app-style tiles. WhatsApp and Instagram use their official
 * glyphs (brand-logos.tsx); the website tile and the product mark are ours.
 */

export function WhatsAppIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="WhatsApp">
      <rect width="32" height="32" rx="9" fill="#25D366" />
      <path d={BRANDS.whatsapp.path} fill="#fff" transform="translate(6.5 6.5) scale(0.79)" />
    </svg>
  );
}

export function InstagramIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Instagram">
      <defs>
        <radialGradient id="ig-g" cx="30%" cy="107%" r="150%">
          <stop offset="0" stopColor="#fdf497" />
          <stop offset="0.08" stopColor="#fdf497" />
          <stop offset="0.45" stopColor="#fd5949" />
          <stop offset="0.6" stopColor="#d6249f" />
          <stop offset="0.9" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#ig-g)" />
      <path d={BRANDS.instagram.path} fill="#fff" transform="translate(7 7) scale(0.75)" />
    </svg>
  );
}

export function WebsiteIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#151713" />
      <rect x="7.5" y="9" width="17" height="13" rx="2.5" fill="none" stroke="#fff" strokeWidth="1.8" />
      <path d="M7.5 13h17" stroke="#fff" strokeWidth="1.8" />
      <circle cx="10" cy="11" r=".8" fill="#b2ff38" />
      <path d="M13 25h6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** The product mark on a tile -- the hub at the centre of the channel diagram. */
export function PilotTile({ className = "size-14" }: { className?: string }) {
  return (
    <svg viewBox="0 0 56 56" className={className} aria-hidden="true">
      <rect width="56" height="56" rx="16" fill="#151713" />
      <ellipse cx="28" cy="25" rx="17" ry="11.5" transform="rotate(-12 28 25)" fill="none" stroke="#a8a190" strokeWidth="1.6" strokeDasharray="1 3" strokeLinecap="round" opacity=".8" />
      <path d="M28 19.5 21 33M28 19.5V33M28 19.5 35 33" stroke="#a8a190" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="21" cy="33" r="2.6" fill="#f3ede0" />
      <circle cx="28" cy="33" r="2.6" fill="#f3ede0" />
      <circle cx="35" cy="33" r="2.6" fill="#f3ede0" />
      <circle cx="28" cy="19.5" r="4.4" fill="#d7f24e" />
    </svg>
  );
}
