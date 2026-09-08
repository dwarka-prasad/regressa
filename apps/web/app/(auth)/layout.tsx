import { ThemeToggle } from "@/components/ThemeToggle";
import { FadeIn } from "@/components/motion";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-brand via-indigo-700 to-slate-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 bg-grid-fade bg-[size:32px_32px] opacity-20 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <div className="text-lg font-bold tracking-tight">Regressa</div>
        <div>
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">Catch AI regressions<br />before your users do.</h2>
          <p className="mt-4 max-w-md text-white/80">Every LLM call logged. Every prompt change versioned. Quality, cost and latency compared across versions, with alerts the moment something slips.</p>
          <ul className="mt-8 grid gap-3 text-sm text-white/90">
            <li className="flex items-center gap-2"><span className="dot bg-white" />Two-line SDK install for OpenAI and Anthropic</li>
            <li className="flex items-center gap-2"><span className="dot bg-white" />LLM-as-judge, golden-set similarity, custom evals</li>
            <li className="flex items-center gap-2"><span className="dot bg-white" />Slack, webhook and email alerts with cooldowns</li>
          </ul>
        </div>
        <div className="text-xs text-white/60">docs.regressa.dev</div>
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 animate-float rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-20 h-80 w-80 rounded-full bg-black/20 blur-3xl" />
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-between lg:hidden"><div className="text-xl font-bold tracking-tight">Regressa</div><ThemeToggle /></div>
          <div className="absolute right-4 top-4 hidden lg:block"><ThemeToggle /></div>
          <FadeIn y={12}>{children}</FadeIn>
        </div>
      </section>
    </main>
  );
}
