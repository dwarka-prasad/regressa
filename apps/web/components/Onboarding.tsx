import Link from "next/link";
import { IconCheck } from "./Icons";

export interface OnboardingState { hasKey: boolean; hasTrace: boolean; hasTemplate: boolean; hasEval: boolean; hasAlert: boolean }

const STEPS: { key: keyof OnboardingState; title: string; body: string; href: string }[] = [
  { key: "hasKey", title: "Create an API key", body: "Settings → API keys. Use a test key locally.", href: "/settings" },
  { key: "hasTrace", title: "Send your first trace", body: "Install @regressa/node or regressa-sdk and wrap your LLM client.", href: "/settings" },
  { key: "hasTemplate", title: "Declare a prompt template", body: "Pass promptTemplate { name, raw } so Regressa can version your prompts.", href: "/prompts" },
  { key: "hasEval", title: "Add an eval", body: "Score outputs with an LLM judge, a golden set, or your own function.", href: "/evals" },
  { key: "hasAlert", title: "Create an alert rule", body: "Get pinged when eval scores drop or cost and latency spike.", href: "/alerts" },
];

export function Onboarding({ state }: { state: OnboardingState }) {
  const done = STEPS.filter((s) => state[s.key]).length;
  if (done === STEPS.length) return null;
  return (
    <div className="card border-brand/30 bg-gradient-to-br from-brand-soft/60 to-surface">
      <div className="flex items-center justify-between">
        <div><div className="card-title">Get set up</div><div className="text-xs text-muted">{done} of {STEPS.length} complete</div></div>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-line"><div className="h-full bg-brand transition-all" style={{ width: `${(done / STEPS.length) * 100}%` }} /></div>
      </div>
      <ol className="mt-4 grid gap-2 md:grid-cols-5">
        {STEPS.map((s, i) => {
          const ok = state[s.key];
          return (
            <li key={s.key} className={`rounded-xl border p-3 text-xs ${ok ? "border-ok/30 bg-ok/5" : "border-line bg-surface"}`}>
              <div className="flex items-center gap-2 font-medium">
                <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${ok ? "bg-ok text-white" : "bg-surface-2 text-muted"}`}>{ok ? <IconCheck width={11} height={11} /> : i + 1}</span>
                {ok ? s.title : <Link href={s.href} className="hover:underline">{s.title}</Link>}
              </div>
              <p className="mt-1.5 text-muted">{s.body}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
