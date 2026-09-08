import type { ReactNode } from "react";
import { FadeIn } from "./motion";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <FadeIn y={6} className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="bg-gradient-to-br from-fg to-fg/70 bg-clip-text text-transparent">{title}</h1>{description && <p className="mt-1 text-sm text-muted">{description}</p>}</div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </FadeIn>
  );
}
