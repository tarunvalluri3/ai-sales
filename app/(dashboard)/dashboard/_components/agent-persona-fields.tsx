"use client";

import { useId, useState } from "react";
import { AgentImagePicker } from "./agent-image-picker";

export function AgentPersonaFields({ businessName, initialName, initialAvatar, disabled, onPreview }: {
  businessName: string;
  initialName: string | null;
  initialAvatar: string | null;
  disabled?: boolean;
  onPreview: (persona: { agentName: string | null; agentAvatarUrl: string | null }) => void;
}) {
  const nameId = useId();
  const [name, setName] = useState(initialName || "");
  const [avatar, setAvatar] = useState(initialAvatar);
  const [remove, setRemove] = useState(false);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <label htmlFor={nameId} className="font-medium">Agent name</label>
      <input id={nameId} name="agentName" value={name} maxLength={40} placeholder={businessName} disabled={disabled}
        onChange={(event) => {
          setName(event.target.value);
          onPreview({ agentName: event.target.value.trim() || null, agentAvatarUrl: avatar });
        }}
        className="rounded border border-ds-border bg-ds-surface px-3 py-2 text-ds-text-primary" />
      <span className="font-medium">Agent avatar</span>
      <AgentImagePicker name="agentAvatar" disabled={disabled} onPreview={(url) => {
        setAvatar(url);
        setRemove(false);
        onPreview({ agentName: name.trim() || null, agentAvatarUrl: url });
      }} />
      {initialAvatar && <label className="flex items-center gap-2">
        <input type="checkbox" name="removeAgentAvatar" checked={remove} disabled={disabled}
          onChange={(event) => {
            setRemove(event.target.checked);
            setAvatar(event.target.checked ? null : initialAvatar);
            onPreview({ agentName: name.trim() || null, agentAvatarUrl: event.target.checked ? null : initialAvatar });
          }} />
        Remove saved avatar
      </label>}
    </div>
  );
}
