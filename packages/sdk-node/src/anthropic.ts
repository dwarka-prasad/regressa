import type { Regressa } from "./client.js";
import type { CallOptions, Message } from "./types.js";
import { inferTemplate } from "./template.js";

interface AnthropicLike {
  messages: { create: (...args: any[]) => any };
}

type CreateParams = { model: string; messages: Message[]; system?: unknown; stream?: boolean; regressa?: CallOptions; [k: string]: unknown };

/**
 * Wrap an Anthropic client. Instruments `messages.create` (non-streaming and `stream: true`).
 *
 *   const anthropic = wrapAnthropic(new Anthropic(), regressa);
 */
export function wrapAnthropic<T extends AnthropicLike>(client: T, regressa: Regressa, defaults: CallOptions = {}): T {
  const original = client.messages.create.bind(client.messages);

  client.messages.create = (params: CreateParams, ...rest: unknown[]) => {
    const { regressa: callOpts, ...clean } = params;
    const opts: CallOptions = { ...defaults, ...callOpts };
    const started = Date.now();
    const inputMessages: Message[] = clean.system
      ? [{ role: "system", content: clean.system }, ...clean.messages]
      : clean.messages;
    const base = {
      model: clean.model,
      provider: "anthropic" as const,
      input_messages: inputMessages,
      prompt_template: opts.promptTemplate ?? inferTemplate(clean.messages, clean.system),
      trace_group_id: opts.traceGroupId,
      metadata: opts.metadata,
    };

    const promise = original(clean, ...rest);
    if (clean.stream) return wrapStream(promise, regressa, base, started);

    return promise.then(
      (res: any) => {
        regressa.trace({
          ...base,
          model: res?.model ?? clean.model,
          output_text: textOf(res?.content),
          prompt_tokens: res?.usage?.input_tokens,
          completion_tokens: res?.usage?.output_tokens,
          latency_ms: Date.now() - started,
          status: "success",
        });
        return res;
      },
      (err: unknown) => {
        regressa.trace({ ...base, latency_ms: Date.now() - started, status: "error", error_message: errMsg(err) });
        throw err;
      },
    );
  };
  return client;
}

async function wrapStream(promise: Promise<any>, regressa: Regressa, base: any, started: number) {
  const stream = await promise;
  const chunks: string[] = [];
  let inTok: number | undefined, outTok: number | undefined, model: string | undefined;
  const iter = stream[Symbol.asyncIterator].bind(stream);
  stream[Symbol.asyncIterator] = async function* () {
    try {
      for await (const ev of iter()) {
        if (ev?.type === "message_start") { inTok = ev.message?.usage?.input_tokens; model = ev.message?.model; }
        if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta") chunks.push(ev.delta.text);
        if (ev?.type === "message_delta" && ev.usage?.output_tokens != null) outTok = ev.usage.output_tokens;
        yield ev;
      }
      regressa.trace({ ...base, model: model ?? base.model, output_text: chunks.join(""), prompt_tokens: inTok, completion_tokens: outTok,
        latency_ms: Date.now() - started, status: "success" });
    } catch (err) {
      regressa.trace({ ...base, output_text: chunks.join(""), latency_ms: Date.now() - started, status: "error", error_message: errMsg(err) });
      throw err;
    }
  };
  return stream;
}

function textOf(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  return content.filter((b) => b?.type === "text").map((b) => b.text as string).join("");
}
function errMsg(err: unknown) { return err instanceof Error ? err.message : String(err); }
