import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { FadeIn } from "./motion";

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <FadeIn className="card flex flex-col items-center py-14 text-center">
      <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand">
        <span className="absolute inset-0 animate-ping rounded-2xl bg-brand/10" style={{ animationDuration: "2.5s" }} />
        <Sparkles size={20} className="relative" />
      </div>
      <div className="mt-3 text-base font-semibold">{title}</div>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </FadeIn>
  );
}
