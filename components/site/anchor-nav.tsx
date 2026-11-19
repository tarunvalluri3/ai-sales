"use client";

import { useEffect, useRef, useState } from "react";

/*
 * Sticky in-page navigation (under the site header) that highlights the
 * section in view and keeps the active chip scrolled into sight on phones.
 */
export function AnchorNav({ items }: { items: readonly { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  useEffect(() => {
    const list = listRef.current;
    const chip = list?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    if (list && chip) list.scrollTo({ left: chip.offsetLeft - list.clientWidth / 2 + chip.clientWidth / 2, behavior: "smooth" });
  }, [active]);

  return (
    <nav aria-label="On this page" className="sticky top-[68px] z-40 border-y border-ds-border site-nav-bg backdrop-blur-xl">
      <ul ref={listRef} className="scrollbar-hidden mx-auto flex max-w-[1280px] gap-1 overflow-x-auto px-5 py-2.5 sm:px-8 lg:justify-center lg:px-12">
        {items.map((item) => (
          <li key={item.id} data-id={item.id} className="shrink-0">
            <a
              href={`#${item.id}`}
              aria-current={active === item.id ? "true" : undefined}
              className={`block rounded-full px-3.5 py-1.5 text-[13.5px] transition-colors ${
                active === item.id ? "site-active" : "text-ds-text-secondary hover:bg-ds-surface-soft hover:text-ds-text-primary"
              }`}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
