"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconLogout, IconSearch } from "./Icons";
import { ThemeToggle } from "./ThemeToggle";
import { RangeControl } from "./RangeControl";

export function TopBar({ projects, activeId, email, range, onLogout }: {
  projects: { id: string; name: string; environment: string }[]; activeId: string; email: string; range: string; onLogout: () => Promise<void>;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-bg/80 px-4 py-2.5 backdrop-blur md:px-6">
      <label className="flex items-center gap-2 text-sm">
        <select className="input w-auto py-1.5 pr-8" value={activeId} aria-label="Project"
          onChange={(e) => { document.cookie = `regressa_project=${e.target.value}; path=/; max-age=31536000; samesite=lax`; router.refresh(); }}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.environment}</option>)}
        </select>
      </label>
      <form className="relative hidden flex-1 max-w-md md:block" onSubmit={(e) => { e.preventDefault(); router.push(`/traces?q=${encodeURIComponent(q)}`); }}>
        <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input pl-9 pr-12" placeholder="Search trace output or error text" value={q} onChange={(e) => setQ(e.target.value)} />
        <kbd className="kbd absolute right-2 top-1/2 -translate-y-1/2">Enter</kbd>
      </form>
      <div className="ml-auto flex items-center gap-2">
        <RangeControl value={range} />
        <ThemeToggle />
        <form action={onLogout}>
          <button className="btn-ghost btn-sm gap-1.5" title={email} type="submit"><IconLogout width={14} height={14} /><span className="hidden lg:inline">Sign out</span></button>
        </form>
      </div>
    </header>
  );
}
