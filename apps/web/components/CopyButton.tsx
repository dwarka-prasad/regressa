"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy } from "lucide-react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn-ghost btn-sm" onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={done ? "done" : "copy"} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.15 }} className="grid place-items-center">
          {done ? <Check size={12} className="text-ok" /> : <Copy size={12} />}
        </motion.span>
      </AnimatePresence>
      {label ? (done ? "Copied" : label) : null}
    </button>
  );
}
