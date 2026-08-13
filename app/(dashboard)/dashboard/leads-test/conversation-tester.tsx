"use client";

import { useState, useTransition } from "react";
import { askTurnAction, extractLeadAction } from "./actions";
import type { ExtractLeadActionResult } from "./actions";

type Message = { role: "user" | "assistant"; content: string };

export function ConversationTester() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractLeadActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAsk() {
    const trimmed = question.trim();
    if (trimmed === "") return;

    setError(null);
    startTransition(async () => {
      const response = await askTurnAction(messages, trimmed);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed },
        { role: "assistant", content: response.answer },
      ]);
      setQuestion("");
    });
  }

  function handleExtract() {
    setError(null);
    startTransition(async () => {
      const response = await extractLeadAction(messages, source.trim() === "" ? null : source.trim());
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setExtraction(response);
    });
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {messages.length === 0 ? (
          <li className="text-sm text-zinc-600">No messages yet -- start the conversation below.</li>
        ) : null}
        {messages.map((message, index) => (
          <li key={index} className="text-sm">
            <span className="font-medium text-zinc-900">{message.role === "user" ? "Prospect" : "AI"}:</span>{" "}
            <span className="text-zinc-700">{message.content}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <label htmlFor="question" className="text-sm font-medium text-zinc-900">
          Message as the prospect
        </label>
        <textarea
          id="question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={2}
          maxLength={2000}
          disabled={isPending}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handleAsk}
          disabled={isPending || question.trim() === ""}
          className="w-fit rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {isPending ? "Sending…" : "Send"}
        </button>
      </div>

      <div className="flex flex-col gap-2 border-t border-zinc-200 pt-4">
        <label htmlFor="source" className="text-sm font-medium text-zinc-900">
          Source (optional)
        </label>
        <input
          id="source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          maxLength={200}
          disabled={isPending}
          placeholder="e.g. chat widget"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handleExtract}
          disabled={isPending || messages.length === 0}
          className="w-fit rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          End conversation & extract lead
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {extraction && extraction.ok ? (
        extraction.result.created ? (
          <div className="flex flex-col gap-1 rounded-md border border-zinc-200 px-4 py-3 text-sm">
            <p className="font-medium text-zinc-900">Lead created</p>
            <p className="text-zinc-700">Name: {extraction.result.lead.contact_name ?? "—"}</p>
            <p className="text-zinc-700">Email: {extraction.result.lead.contact_email ?? "—"}</p>
            <p className="text-zinc-700">Phone: {extraction.result.lead.contact_phone ?? "—"}</p>
            <p className="text-zinc-700">
              Interest: {extraction.result.lead.interest_type ?? "—"}
              {extraction.result.lead.interest_id ? ` (matched: ${extraction.result.lead.interest_id})` : " (no catalog match)"}
            </p>
            <p className="text-zinc-700">
              Qualification: {extraction.result.lead.qualification} — {extraction.result.lead.qualification_reason}
            </p>
          </div>
        ) : (
          <p className="text-sm text-zinc-600">No lead created — no contact details were given.</p>
        )
      ) : null}
    </div>
  );
}
