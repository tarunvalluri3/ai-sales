"use client";

import { useEffect, useRef, useState } from "react";

export function AgentImagePicker({ name = "image_file", disabled, onPreview }: {
  name?: string;
  disabled?: boolean;
  onPreview?: (url: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const preview = useRef("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  useEffect(() => () => URL.revokeObjectURL(preview.current), []);
  useEffect(() => {
    const form = input.current?.form;
    if (!busy || !form) return;
    const blockWhilePreparing = (event: SubmitEvent) => event.preventDefault();
    form.addEventListener("submit", blockWhilePreparing);
    return () => form.removeEventListener("submit", blockWhilePreparing);
  }, [busy]);

  async function pick(file: File | undefined) {
    if (!file || !input.current || disabled || busy) return;
    setBusy(true);
    setError("");
    input.current.value = "";
    setSelected("");
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error();
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const context = canvas.getContext("2d");
      if (!context) { bitmap.close(); throw new Error(); }
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, 0.85));
      if (!blob || blob.size > 2 * 1024 * 1024 || !input.current) throw new Error();
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], "agent-image", { type: blob.type }));
      input.current.files = transfer.files;
      URL.revokeObjectURL(preview.current);
      preview.current = URL.createObjectURL(blob);
      onPreview?.(preview.current);
      setSelected("Image ready to save.");
    } catch {
      onPreview?.("");
      setError("Choose a JPEG, PNG, or WebP image that compresses to 2 MB or less.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 text-sm" onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); void pick(event.dataTransfer.files[0]); }}>
      <input ref={input} name={selected ? name : undefined} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void pick(event.currentTarget.files?.[0])} />
      <button type="button" onClick={() => input.current?.click()} disabled={disabled || busy}
        className="rounded border border-ds-border px-3 py-2 text-ds-text-secondary focus-visible:outline-2 disabled:opacity-60">
        {busy ? "Preparing image…" : "Choose or drop an image"}
      </button>
      {selected && <p role="status">{selected}</p>}
      {error && <p role="alert" className="text-ds-danger">{error}</p>}
    </div>
  );
}
