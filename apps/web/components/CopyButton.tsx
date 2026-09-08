"use client";
import { useState } from "react";
import { IconCheck, IconCopy } from "./Icons";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn-ghost btn-sm" onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}>
      {done ? <IconCheck width={12} height={12} className="text-ok" /> : <IconCopy width={12} height={12} />}{done ? "Copied" : label}
    </button>
  );
}
