"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, Bell, BookOpen, Coins, FlaskConical, Home, ListTree, PanelLeftClose, PanelLeftOpen, Settings, SquareTerminal, Zap } from "lucide-react";

export const NAV = [
  { href: "/overview", label: "Overview", Icon: Home },
  { href: "/traces", label: "Traces", Icon: ListTree },
  { href: "/prompts", label: "Prompts", Icon: SquareTerminal },
  { href: "/evals", label: "Evals", Icon: FlaskConical },
  { href: "/alerts", label: "Alerts", Icon: Bell },
  { href: "/playground", label: "Playground", Icon: Zap },
  { href: "/costs", label: "Costs", Icon: Coins },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export function Sidebar({ orgName, plan, openAlerts }: { orgName: string; plan: string; openAlerts: number }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem("regressa_sidebar") === "collapsed"); } catch {} }, []);
  const toggle = () => { const n = !collapsed; setCollapsed(n); try { localStorage.setItem("regressa_sidebar", n ? "collapsed" : "open"); } catch {} };

  return (
    <motion.aside animate={{ width: collapsed ? 68 : 240 }} transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface/80 backdrop-blur md:flex">
      <div className={`flex items-center gap-2.5 px-4 py-5 ${collapsed ? "justify-center" : ""}`}>
        <motion.div whileHover={{ rotate: -6, scale: 1.05 }} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand to-indigo-500 text-white shadow-card">
          <Activity size={17} strokeWidth={2.4} />
        </motion.div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} className="min-w-0 leading-tight">
              <div className="text-[15px] font-bold tracking-tight">Regressa</div>
              <div className="truncate text-[11px] text-muted">{orgName}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map(({ href, label, Icon }) => {
          const active = path === href || path.startsWith(href + "/");
          return (
            <Link key={href} href={href} title={collapsed ? label : undefined} className={`nav-item relative ${active ? "text-brand hover:text-brand" : ""} ${collapsed ? "justify-center px-0" : ""}`}>
              {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg bg-brand-soft" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
              <Icon size={18} className="relative z-10 shrink-0" />
              {!collapsed && <span className="relative z-10 flex-1">{label}</span>}
              {label === "Alerts" && openAlerts > 0 && <span className={`relative z-10 ${collapsed ? "absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-bad" : "badge-bad"}`}>{collapsed ? "" : openAlerts}</span>}
            </Link>
          );
        })}
      </nav>
      {!collapsed && (
        <div className="m-3 rounded-xl border border-line bg-gradient-to-br from-surface-2 to-surface p-3 text-xs">
          <div className="flex items-center justify-between"><span className="font-semibold capitalize">{plan} plan</span><Link href="/settings#billing" className="link">Manage</Link></div>
          <p className="mt-1 text-muted">Usage and limits live under Settings.</p>
        </div>
      )}
      <div className={`flex items-center px-3 pb-3 ${collapsed ? "flex-col gap-1" : "justify-between"}`}>
        <a className={`nav-item ${collapsed ? "justify-center px-0" : ""}`} href="https://dwarka-prasad.github.io/regressa/" target="_blank" rel="noreferrer" title="Docs"><BookOpen size={18} />{!collapsed && "Docs"}</a>
        <button type="button" onClick={toggle} className="btn-ghost btn-sm" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}</button>
      </div>
    </motion.aside>
  );
}

export function MobileNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line bg-surface/90 py-1 backdrop-blur md:hidden">
      {NAV.slice(0, 6).map(({ href, label, Icon }) => {
        const active = path.startsWith(href);
        return <Link key={href} href={href} className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] ${active ? "text-brand" : "text-muted"}`}><Icon size={18} />{label}</Link>;
      })}
    </nav>
  );
}
