import type { Message } from "@/lib/supabase/types";

const CAPTION: Record<Message["role"], string> = {
  user: "Prospect",
  assistant: "AI",
  human_agent: "Team member",
};

const CAPTION_STYLE: Record<Message["role"], string> = {
  user: "text-ds-text-muted",
  assistant: "text-ds-text-muted",
  human_agent: "font-semibold text-ds-accent-muted",
};

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isHumanAgent = message.role === "human_agent";

  const bubbleClassName = isUser
    ? "max-w-[85%] rounded-2xl rounded-br-md bg-ds-surface-soft px-3.5 py-2.5 text-sm leading-relaxed text-ds-text-primary"
    : isHumanAgent
      ? "max-w-[85%] rounded-2xl rounded-bl-md bg-ds-accent-soft-bg px-3.5 py-2.5 text-sm leading-relaxed text-ds-text-primary"
      : "max-w-[85%] rounded-2xl rounded-bl-md bg-ds-surface-elevated px-3.5 py-2.5 text-sm leading-relaxed text-ds-text-secondary";

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div className={bubbleClassName}>{message.content}</div>
      <span className={`mt-1 text-2xs ${CAPTION_STYLE[message.role]}`}>
        {CAPTION[message.role]} · {new Date(message.created_at).toLocaleString("en-US")}
      </span>
    </div>
  );
}
