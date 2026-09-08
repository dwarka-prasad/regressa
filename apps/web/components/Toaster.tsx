"use client";
import { useEffect } from "react";
import { Toaster as Sonner, toast } from "sonner";

export function Toaster() {
  return <Sonner position="bottom-right" richColors closeButton toastOptions={{ classNames: { toast: "!rounded-xl !border-line !bg-surface !text-fg !shadow-pop", description: "!text-muted" } }} />;
}

/** Fires a toast once on mount. Used to surface server-action results stored in a short-lived cookie. */
export function FlashToast({ message, kind = "success" }: { message: string; kind?: "success" | "error" | "info" }) {
  useEffect(() => { toast[kind](message); }, [message, kind]);
  return null;
}
