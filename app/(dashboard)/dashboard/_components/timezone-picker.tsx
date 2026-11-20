"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { COMMON_TIMEZONES, otherTimezones, timezoneLabel, timezoneOffsetLabel } from "@/lib/timezones";

type Option = { zone: string; label: string; offset: string; group: "common" | "all" };

/**
 * Searchable time zone picker (2026-11-20): the common zones first, then every
 * zone the browser knows, filtered as you type. Replaces a plain <select> of
 * 21 zones (which turned anything else into UTC) -- a 400-item plain dropdown
 * is not usable either. Submits the IANA name through a hidden input, so it
 * works inside an ordinary <form action>. The server re-validates it
 * (lib/timezones.ts normalizeTimezone).
 *
 * Keyboard: Enter/Space/ArrowDown opens; typing filters; ArrowUp/ArrowDown
 * move; Enter picks; Escape closes and returns focus to the trigger.
 */
export function TimezonePicker({
  name,
  value,
  onChange,
  id,
  disabled = false,
  invalid = false,
  describedBy,
  triggerClassName = "",
}: {
  name: string;
  value: string;
  onChange: (zone: string) => void;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  triggerClassName?: string;
}) {
  const generatedId = useId();
  const triggerId = id ?? `${generatedId}-trigger`;
  const listId = `${generatedId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Built once per mount: ~400 zones, offsets computed for "now".
  const options = useMemo<Option[]>(() => {
    const now = new Date();
    const make = (zone: string, group: Option["group"]): Option => ({
      zone,
      label: timezoneLabel(zone),
      offset: timezoneOffsetLabel(zone, now),
      group,
    });
    return [...COMMON_TIMEZONES.map((zone) => make(zone, "common")), ...otherTimezones().map((zone) => make(zone, "all"))];
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, " ");
    if (!q) return options;
    return options.filter((option) =>
      `${option.zone} ${option.label} ${option.offset}`.toLowerCase().replace(/_/g, " ").includes(q),
    );
  }, [options, query]);

  const selected = options.find((option) => option.zone === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const openList = () => {
    if (disabled) return;
    setQuery("");
    const index = options.findIndex((option) => option.zone === value);
    setActive(index >= 0 ? index : 0);
    setOpen(true);
  };

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const pick = (zone: string) => {
    onChange(zone);
    close(true);
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[active];
      if (option) pick(option.zone);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      close(false);
    }
  };

  const firstAllIndex = filtered.findIndex((option) => option.group === "all");

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={value} />
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        data-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openList();
          }
        }}
        className={`flex w-full items-center justify-between gap-3 text-left disabled:opacity-60 data-invalid:border-ds-danger ${triggerClassName}`}
      >
        <span className="min-w-0 truncate">
          {selected ? selected.label : value ? timezoneLabel(value) : "Choose a time zone"}
          {selected?.offset ? <span className="text-ds-text-secondary"> · {selected.offset}</span> : null}
        </span>
        <ChevronDown className="size-4 shrink-0 text-ds-text-secondary" strokeWidth={1.75} aria-hidden="true" />
      </button>

      {open ? (
        <div className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-ds-border-strong bg-ds-surface shadow-lg">
          <div className="flex items-center gap-2 border-b border-ds-border px-3">
            <Search className="size-4 shrink-0 text-ds-text-secondary" strokeWidth={1.75} aria-hidden="true" />
            <input
              ref={searchRef}
              type="text"
              role="combobox"
              aria-label="Search time zones"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onSearchKeyDown}
              placeholder="Search a city or region, e.g. Phoenix"
              className="h-10 w-full bg-transparent text-sm text-ds-text-primary placeholder:text-ds-text-muted focus:outline-none"
            />
          </div>
          <ul ref={listRef} id={listId} role="listbox" aria-label="Time zones" className="max-h-64 overflow-y-auto overscroll-contain py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-ds-text-secondary">No time zone matches &ldquo;{query}&rdquo;.</li>
            ) : null}
            {filtered.map((option, index) => (
              <li key={option.zone} role="presentation">
                {index === 0 && option.group === "common" ? (
                  <p className="px-3 pt-1.5 pb-1 text-2xs font-medium tracking-wide text-ds-text-secondary uppercase">Common</p>
                ) : null}
                {index === firstAllIndex ? (
                  <p className="border-t border-ds-border px-3 pt-2 pb-1 text-2xs font-medium tracking-wide text-ds-text-secondary uppercase">
                    All time zones
                  </p>
                ) : null}
                <div
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={option.zone === value}
                  data-index={index}
                  onPointerMove={() => setActive(index)}
                  onClick={() => pick(option.zone)}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm text-ds-text-primary ${
                    index === active ? "bg-ds-surface-soft" : ""
                  }`}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-ds-text-secondary">
                    {option.offset}
                    {option.zone === value ? <Check className="size-4 text-ds-text-primary" strokeWidth={1.75} aria-hidden="true" /> : null}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
