import type { Message } from "@/lib/supabase/types";

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-2xl rounded-br-md bg-dashboard-primary px-3.5 py-2.5 text-sm leading-relaxed text-dashboard-on-primary"
            : "max-w-[85%] rounded-2xl rounded-bl-md bg-zinc-100 px-3.5 py-2.5 text-sm leading-relaxed text-zinc-900"
        }
      >
        {message.content}
      </div>
      <span className="mt-1 text-xs text-zinc-500">
        {isUser ? "Prospect" : "AI"} · {new Date(message.created_at).toLocaleString()}
      </span>
    </div>
  );
}
