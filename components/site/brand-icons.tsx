/*
 * Channel marks, drawn from primitives (no third-party logo files). Used to
 * show where the AI employee works: WhatsApp, Instagram and the website.
 */

export function WhatsAppIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#25D366" />
      <path
        d="M16 7.2a8.8 8.8 0 0 0-7.6 13.2L7.3 24.7l4.4-1.1A8.8 8.8 0 1 0 16 7.2Z"
        fill="none"
        stroke="#fff"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="M12.9 12.2c.2-.4.4-.4.7-.4h.5c.2 0 .4 0 .5.4l.7 1.7c.1.2 0 .4-.1.6l-.5.6c-.1.1-.2.3 0 .5.6 1 1.4 1.8 2.4 2.3.2.1.4.1.5 0l.6-.7c.2-.2.4-.2.6-.1l1.6.8c.2.1.4.2.4.4 0 .5-.1 1.1-.6 1.5-.5.4-1.2.6-1.9.5-1.4-.2-2.7-.9-3.8-2-1.1-1-1.9-2.3-2.2-3.6-.2-.9 0-1.7.6-2.3Z"
        fill="#fff"
      />
    </svg>
  );
}

export function InstagramIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
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
      <rect x="8" y="8" width="16" height="16" rx="5" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="16" cy="16" r="3.8" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="20.7" cy="11.3" r="1.2" fill="#fff" />
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
