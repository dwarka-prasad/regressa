"use client";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Moon, Search, Sun, Clock, FolderKanban } from "lucide-react";
import { NAV } from "./Sidebar";
import { RANGES, type RangeKey } from "@/lib/range";

export function CommandMenu({ projects, activeId }: { projects: { id: string; name: string }[]; activeId: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const go = (fn: () => void) => { setOpen(false); setQ(""); fn(); };
  const setCookie = (k: string, v: string) => { document.cookie = `${k}=${v}; path=/; max-age=31536000; samesite=lax`; router.refresh(); };
  const theme = () => { const n = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"; document.documentElement.setAttribute("data-theme", n); try { localStorage.setItem("regressa_theme", n); } catch {} };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost hidden h-9 w-72 justify-between text-muted md:flex">
        <span className="flex items-center gap-2"><Search size={14} />Search or jump to...</span><kbd className="kbd">Ctrl K</kbd>
      </button>
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost btn-sm md:hidden" aria-label="Search"><Search size={14} /></button>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 grid place-items-start justify-center bg-fg/30 p-4 pt-[12vh] backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.97, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: -8 }} transition={{ duration: 0.18 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
              <Command label="Command menu" className="text-sm">
                <div className="flex items-center gap-2 border-b border-line px-4">
                  <Search size={16} className="text-muted" />
                  <Command.Input value={q} onValueChange={setQ} autoFocus placeholder="Type a page, project, or search traces..." className="h-12 w-full bg-transparent outline-none placeholder:text-muted/70" />
                  <kbd className="kbd">esc</kbd>
                </div>
                <Command.List className="max-h-80 overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted [&_[cmdk-item]]:flex [&_[cmdk-item]]:cursor-pointer [&_[cmdk-item]]:items-center [&_[cmdk-item]]:gap-3 [&_[cmdk-item]]:rounded-lg [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2 [&_[cmdk-item][data-selected=true]]:bg-brand-soft [&_[cmdk-item][data-selected=true]]:text-brand">
                  <Command.Empty className="px-3 py-6 text-center text-muted">No matches. Press Enter to search traces for "{q}".</Command.Empty>
                  {q.trim() && <Command.Group heading="Search"><Command.Item value={`search ${q}`} onSelect={() => go(() => router.push(`/traces?q=${encodeURIComponent(q)}`))}><Search size={16} />Search traces for "{q}"</Command.Item></Command.Group>}
                  <Command.Group heading="Pages">
                    {NAV.map(({ href, label, Icon }) => <Command.Item key={href} value={label} onSelect={() => go(() => router.push(href))}><Icon size={16} />{label}</Command.Item>)}
                  </Command.Group>
                  <Command.Group heading="Project">
                    {projects.map((p) => <Command.Item key={p.id} value={`project ${p.name}`} onSelect={() => go(() => setCookie("regressa_project", p.id))}><FolderKanban size={16} />{p.name}{p.id === activeId && <span className="ml-auto badge-brand">active</span>}</Command.Item>)}
                  </Command.Group>
                  <Command.Group heading="Time range">
                    {(Object.keys(RANGES) as RangeKey[]).map((r) => <Command.Item key={r} value={`range ${RANGES[r].label}`} onSelect={() => go(() => setCookie("regressa_range", r))}><Clock size={16} />Last {RANGES[r].label}</Command.Item>)}
                  </Command.Group>
                  <Command.Group heading="Appearance">
                    <Command.Item value="toggle theme dark light" onSelect={() => go(theme)}><Sun size={16} className="dark:hidden" /><Moon size={16} className="hidden dark:block" />Toggle theme</Command.Item>
                  </Command.Group>
                </Command.List>
              </Command>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
