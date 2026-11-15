import { MessageCircle, SendHorizontal, X } from "lucide-react";
import type { WidgetLanguage, WidgetPosition } from "@/lib/supabase/types";
import { getWidgetStrings } from "@/lib/widget-i18n";

/** The widget's own CSS default when a business has not picked an accent. */
const DEFAULT_ACCENT = "#dc2626";
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * A static, in-dashboard mock of the chat widget, driven entirely by the
 * values currently in the form beside it (draft values, not the published
 * ones) so an owner sees a change before saving. Pure presentation: it makes
 * no request and renders no real chat; anything left blank falls back to the
 * same defaults the real widget uses (`lib/widget-i18n.ts`).
 *
 * `showPage` draws the panel floating over a placeholder web page with the
 * launcher bubble (Appearance tab); without it only the panel is drawn
 * (Suggested questions tab).
 */
export function WidgetPreview({
  businessName,
  accentColor,
  logoUrl,
  greeting,
  ctaText,
  questions,
  language = "en",
  position = "bottom-right",
  showPage = false,
}: {
  businessName: string;
  accentColor?: string;
  logoUrl?: string;
  greeting?: string;
  ctaText?: string;
  questions: string[];
  language?: WidgetLanguage;
  position?: WidgetPosition;
  showPage?: boolean;
}) {
  const strings = getWidgetStrings(language);
  const accent = accentColor && HEX_COLOR.test(accentColor) ? accentColor : DEFAULT_ACCENT;
  const shownQuestions = questions.map((question) => question.trim()).filter(Boolean);
  const hasLogo = Boolean(logoUrl && /^https:\/\//.test(logoUrl));

  const panel = (
    <div className="flex w-full max-w-[21rem] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_12px_32px_rgba(21,23,19,0.16)]">
      <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: accent }}>
        {hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element -- an arbitrary, business-supplied URL previewed as typed; next/image would need every possible host allow-listed.
          <img src={logoUrl} alt="" className="size-8 shrink-0 rounded-full bg-white object-contain" />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm leading-tight font-medium">{businessName}</span>
          <span className="truncate text-xs opacity-90">{strings.panelSubtitle}</span>
        </div>
        <X strokeWidth={1.75} className="size-5 shrink-0" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-2.5 px-4 py-4">
        <p className="w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-[#f1f3f0] px-3.5 py-2.5 text-sm leading-snug text-[#151713]">
          {greeting?.trim() || strings.defaultGreetingOpen}
        </p>
        {shownQuestions.map((question, index) => (
          <span
            key={index}
            className="rounded-full border px-4 py-2 text-center text-sm leading-snug font-medium text-[#151713]"
            style={{ borderColor: accent }}
          >
            {question}
          </span>
        ))}
      </div>
      <div className="mx-4 mb-3 flex items-center gap-2 rounded-xl border border-[#d3d7d1] py-1.5 pr-1.5 pl-3.5">
        <span className="flex-1 truncate text-sm text-[#92958f]">{strings.inputPlaceholder}</span>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: accent }}>
          <SendHorizontal strokeWidth={1.75} className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="pb-3 text-center text-xs text-[#5c6158]">Powered by Waves AI Pilot</p>
    </div>
  );

  if (!showPage) {
    return (
      <div aria-hidden="true" className="flex justify-center rounded-2xl bg-ds-surface-soft p-5">
        {panel}
      </div>
    );
  }

  const alignLeft = position === "bottom-left";

  return (
    <div aria-hidden="true" className="relative flex min-h-[30rem] flex-col gap-4 overflow-hidden rounded-2xl bg-ds-surface-soft p-5">
      {/* Placeholder page behind the widget. */}
      <div className="flex gap-4">
        <span className="h-3 w-28 rounded-full bg-[#dfe2e0]" />
        <span className="h-3 w-20 rounded-full bg-[#dfe2e0]" />
        <span className="ml-auto h-3 w-24 rounded-full bg-[#dfe2e0]" />
      </div>
      <span className={`mt-6 h-3 w-36 rounded-full bg-[#dfe2e0] ${alignLeft ? "self-end" : ""}`} />
      <span className={`h-32 w-44 rounded-xl bg-[#dfe2e0] ${alignLeft ? "self-end" : ""}`} />
      <span className={`h-3 w-40 rounded-full bg-[#dfe2e0] ${alignLeft ? "self-end" : ""}`} />
      <span className={`h-3 w-28 rounded-full bg-[#dfe2e0] ${alignLeft ? "self-end" : ""}`} />

      <div className={`absolute inset-x-5 bottom-5 flex flex-col gap-3 ${alignLeft ? "items-start" : "items-end"}`}>
        {panel}
        <div className={`flex items-center gap-3 ${alignLeft ? "flex-row-reverse" : ""}`}>
          <span className="rounded-full bg-white px-4 py-2.5 text-sm font-medium text-[#151713] shadow-[0_6px_18px_rgba(21,23,19,0.12)]">
            {ctaText?.trim() || strings.defaultCta}
          </span>
          <span className="flex size-12 items-center justify-center rounded-full text-white shadow-[0_6px_18px_rgba(21,23,19,0.18)]" style={{ background: accent }}>
            <MessageCircle strokeWidth={1.75} className="size-5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </div>
  );
}

/** "Live | N active widget key" strip shown under the previews. */
export function WidgetStatusStrip({
  isPublished,
  activeKeyCount,
  note,
}: {
  isPublished: boolean;
  activeKeyCount: number;
  note: string;
}) {
  return (
    <div className="dx-card flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4">
      <span
        className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium ${
          isPublished ? "bg-ds-success-bg text-ds-success" : "bg-ds-surface-soft text-ds-text-secondary"
        }`}
      >
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
        {isPublished ? "Live" : "Draft"}
      </span>
      <div className="flex min-w-0 flex-1 flex-col border-l border-ds-border pl-5">
        <p className="text-sm font-medium text-ds-text-primary">
          {activeKeyCount} active widget {activeKeyCount === 1 ? "key" : "keys"}
        </p>
        <p className="text-sm text-ds-text-secondary">{note}</p>
      </div>
    </div>
  );
}
