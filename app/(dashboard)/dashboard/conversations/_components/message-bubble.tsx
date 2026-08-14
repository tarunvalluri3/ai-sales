import type { Message } from "@/lib/supabase/types";

const CAPTION: Record<Message["role"], string> = {
  user: "Prospect",
  assistant: "AI",
  human_agent: "Team member",
};

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isHumanAgent = message.role === "human_agent";

  const bubbleClassName = isUser
    ? "max-w-[85%] rounded-2xl rounded-br-md bg-dashboard-primary px-3.5 py-2.5 text-sm leading-relaxed text-dashboard-on-primary"
    : isHumanAgent
      ? "max-w-[85%] rounded-2xl rounded-bl-md bg-dashboard-primary/10 px-3.5 py-2.5 text-sm leading-relaxed text-zinc-900"
      : "max-w-[85%] rounded-2xl rounded-bl-md bg-zinc-100 px-3.5 py-2.5 text-sm leading-relaxed text-zinc-900";

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div className={bubbleClassName}>{message.content}</div>
      <span className="mt-1 text-xs text-zinc-500">
        {CAPTION[message.role]} · {new Date(message.created_at).toLocaleString()}
      </span>
    </div>
  );
}
