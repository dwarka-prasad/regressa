import type { Regressa } from "./client.js";
import type { CallOptions, Message } from "./types.js";
import { contentToText, inferTemplate } from "./template.js";

/**
 * Structural type for the OpenAI client — we don't import `openai` so the SDK stays dependency-free.
 */
interface OpenAILike {
  chat: { completions: { create: (...args: any[]) => any } };
}

type CreateParams = { model: string; messages: Message[]; stream?: boolean; regressa?: CallOptions; [k: string]: unknown };

/**
 * Wrap an OpenAI client. Returns the same client with `chat.completions.create` instrumented.
 *
 *   const openai = wrapOpenAI(new OpenAI(), regressa);
 *   await openai.chat.completions.create({ model, messages, regressa: { promptTemplate: { name, raw } } });
 */
export function wrapOpenAI<T extends OpenAILike>(client: T, regressa: Regressa, defaults: CallOptions = {}): T {
  const original = client.chat.completions.create.bind(client.chat.completions);

  client.chat.completions.create = (params: CreateParams, ...rest: unknown[]) => {
    const { regressa: callOpts, ...clean } = params;
    const opts: CallOptions = { ...defaults, ...callOpts };
    const started = Date.now();
    const base = {
      model: clean.model,
      provider: "openai" as const,
      input_messages: clean.messages,
      prompt_template: opts.promptTemplate ?? inferTemplate(clean.messages),
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
          output_text: res?.choices?.[0]?.message?.content ?? null,
          prompt_tokens: res?.usage?.prompt_tokens,
          completion_tokens: res?.usage?.completion_tokens,
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
  let usage: any = null;
  let model: string | undefined;
  const iter = stream[Symbol.asyncIterator].bind(stream);
  stream[Symbol.asyncIterator] = async function* () {
    try {
      for await (const chunk of iter()) {
        model = chunk?.model ?? model;
        const delta = chunk?.choices?.[0]?.delta?.content;
        if (delta) chunks.push(delta);
        if (chunk?.usage) usage = chunk.usage;
        yield chunk;
      }
      regressa.trace({ ...base, model: model ?? base.model, output_text: chunks.join(""),
        prompt_tokens: usage?.prompt_tokens, completion_tokens: usage?.completion_tokens,
        latency_ms: Date.now() - started, status: "success" });
    } catch (err) {
      regressa.trace({ ...base, output_text: chunks.join(""), latency_ms: Date.now() - started, status: "error", error_message: errMsg(err) });
      throw err;
    }
  };
  return stream;
}

function errMsg(err: unknown) { return err instanceof Error ? err.message : String(err); }
export { contentToText };
