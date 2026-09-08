import { KeyRound } from "lucide-react";
import { CopyButton } from "./CopyButton";
import { FadeIn } from "./motion";

export function NewKeyBanner({ plaintext, ingestUrl }: { plaintext: string; ingestUrl: string }) {
  return (
    <FadeIn className="card border-ok/30 bg-gradient-to-br from-ok/10 to-surface">
      <div className="flex items-center gap-2 font-semibold"><KeyRound size={16} className="text-ok" />New API key created. Copy it now, it will not be shown again.</div>
      <div className="mt-2 flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-lg border border-line bg-surface px-3 py-2 text-sm">{plaintext}</code>
        <CopyButton text={plaintext} />
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-3 text-xs"><div className="label">Environment</div><code>REGRESSA_API_KEY={plaintext}</code><br /><code>REGRESSA_BASE_URL={ingestUrl}</code></div>
        <div className="rounded-lg border border-line bg-surface p-3 text-xs"><div className="label">Node</div><code>{"const regressa = new Regressa(); const openai = wrapOpenAI(new OpenAI(), regressa);"}</code></div>
      </div>
    </FadeIn>
  );
}
