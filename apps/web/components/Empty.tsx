import type { ReactNode } from "react";
import { IconSparkles } from "./Icons";

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center py-12 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-soft text-brand"><IconSparkles /></div>
      <div className="mt-3 text-base font-semibold">{title}</div>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
