"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBell, IconBook, IconBolt, IconCoin, IconEval, IconHome, IconList, IconPrompt, IconSettings } from "./Icons";

const NAV = [
  { href: "/overview", label: "Overview", Icon: IconHome },
  { href: "/traces", label: "Traces", Icon: IconList },
  { href: "/prompts", label: "Prompts", Icon: IconPrompt },
  { href: "/evals", label: "Evals", Icon: IconEval },
  { href: "/alerts", label: "Alerts", Icon: IconBell },
  { href: "/playground", label: "Playground", Icon: IconBolt },
  { href: "/costs", label: "Costs", Icon: IconCoin },
  { href: "/settings", label: "Settings", Icon: IconSettings },
];

export function Sidebar({ orgName, plan, openAlerts }: { orgName: string; plan: string; openAlerts: number }) {
  const path = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-brand-fg shadow-card">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight">Regressa</div>
          <div className="truncate text-[11px] text-muted">{orgName}</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map(({ href, label, Icon }) => {
          const active = path === href || path.startsWith(href + "/");
          return (
            <Link key={href} href={href} className={`nav-item ${active ? "nav-item-active" : ""}`}>
              <Icon className="shrink-0" />
              <span className="flex-1">{label}</span>
              {label === "Alerts" && openAlerts > 0 && <span className="badge-bad">{openAlerts}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="m-3 rounded-xl border border-line bg-surface-2 p-3 text-xs">
        <div className="flex items-center justify-between"><span className="font-semibold capitalize">{plan} plan</span><Link href="/settings#billing" className="link">Manage</Link></div>
        <p className="mt-1 text-muted">Usage and limits live under Settings.</p>
      </div>
      <a className="nav-item mx-3 mb-3" href="https://docs.regressa.dev" target="_blank" rel="noreferrer"><IconBook /> Docs</a>
    </aside>
  );
}

export function MobileNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line bg-surface/95 py-1 backdrop-blur md:hidden">
      {NAV.map(({ href, label, Icon }) => {
        const active = path.startsWith(href);
        return <Link key={href} href={href} className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] ${active ? "text-brand" : "text-muted"}`}><Icon />{label}</Link>;
      })}
    </nav>
  );
}
