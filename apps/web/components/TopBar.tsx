"use client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { RangeControl } from "./RangeControl";
import { CommandMenu } from "./CommandMenu";

export function TopBar({ projects, activeId, email, range, onLogout }: {
  projects: { id: string; name: string; environment: string }[]; activeId: string; email: string; range: string; onLogout: () => Promise<void>;
}) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-bg/70 px-4 py-2.5 backdrop-blur-md md:px-6">
      <select className="input w-auto py-1.5 pr-8" value={activeId} aria-label="Project"
        onChange={(e) => { document.cookie = `regressa_project=${e.target.value}; path=/; max-age=31536000; samesite=lax`; router.refresh(); }}>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.environment}</option>)}
      </select>
      <CommandMenu projects={projects} activeId={activeId} />
      <div className="ml-auto flex items-center gap-2">
        <RangeControl value={range} />
        <ThemeToggle />
        <form action={onLogout}>
          <button className="btn-ghost btn-sm gap-1.5" title={email} type="submit"><LogOut size={14} /><span className="hidden lg:inline">Sign out</span></button>
        </form>
      </div>
    </header>
  );
}
