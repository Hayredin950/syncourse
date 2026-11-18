/**
 * One LLM adapter, several free tiers, no SDK.
 *
 * The product must never be *about* a vendor. All three providers speak either
 * the Gemini `generateContent` shape or the OpenAI chat-completions shape, so a
 * single small adapter covers them and `ASSISTANT_LLM` decides which one is
 * used. If the chosen key is missing, or the provider answers with a quota
 * error, `complete()` returns `null` and the caller falls back to the
 * extractive answer — the assistant degrades, it does not break.
 */

export type LlmProviderName = 'gemini' | 'groq' | 'openrouter';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmResult {
  text: string;
  provider: LlmProviderName;
  model: string;
}

export interface LlmProvider {
  readonly name: LlmProviderName;
  readonly model: string;
  complete(messages: LlmMessage[], opts?: { maxTokens?: number }): Promise<LlmResult | null>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Free-tier defaults; every one can be overridden without a deploy. */
const DEFAULTS = {
  // Google retires aliases for new API keys; this preview answers today and
  // GEMINI_MODEL overrides it without a redeploy.
  gemini: 'gemini-3-flash-preview',
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
} as const;

/** Kept under the platform's request budget: a slow model must fall back, not hang. */
const TIMEOUT_MS = 9_000;

/** One retry for the failures that are usually a bad minute, not a bad key. */
const RETRYABLE = /HTTP (?:429|5\d\d)/;
const RETRY_DELAY_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(TIMEOUT_MS);
}

/** One short log line, never the prompt or the key. */
function noteFailure(provider: string, detail: string) {
  // eslint-disable-next-line no-console
  console.warn(`[assistant] ${provider} unavailable: ${detail}`);
}

async function readError(res: Response): Promise<string> {
  const body = await res.text().catch(() => '');
  let detail = body;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    if (typeof parsed.error === 'string') detail = parsed.error;
    else detail = parsed.error?.message ?? parsed.message ?? body;
  } catch {
    // keep raw text
  }
  return `HTTP ${res.status}${detail ? ` — ${detail.slice(0, 160)}` : ''}`;
}

/**
 * Gemini: the system prompt is a separate field, and the assistant role is
 * called `model`. Everything else is a `parts` array.
 */
class GeminiProvider implements LlmProvider {
  readonly name = 'gemini' as const;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async complete(messages: LlmMessage[], opts: { maxTokens?: number } = {}): Promise<LlmResult | null> {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    if (contents.length === 0) return null;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await this.fetchImpl(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
            body: JSON.stringify({
              ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
              contents,
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: opts.maxTokens ?? 700,
                // Gemini 3 counts reasoning against the output budget. This is
                // a short grounded answer, not a puzzle: spend the budget on
                // the answer, and answer in the same second.
                ...(/^gemini-(?:2\.5|3|4)/.test(this.model)
                  ? { thinkingConfig: { thinkingBudget: 0 } }
                  : {}),
              },
            }),
            signal: timeoutSignal(),
          },
        );
        if (!res.ok) {
          const detail = await readError(res);
          if (attempt === 0 && RETRYABLE.test(detail)) {
            await sleep(RETRY_DELAY_MS);
            continue;
          }
          noteFailure(this.name, detail);
          return null;
        }
        const body = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
        };
        const text = (body.candidates?.[0]?.content?.parts ?? [])
          .map((p) => p.text ?? '')
          .join('')
          .trim();
        if (!text) {
          noteFailure(this.name, `empty answer (${body.candidates?.[0]?.finishReason ?? 'no candidate'})`);
          return null;
        }
        return { text, provider: this.name, model: this.model };
      } catch (err) {
        // A timeout or a dropped connection is worth one more try; a bad key
        // will fail the same way twice, so the second attempt is bounded.
        if (attempt === 0) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        noteFailure(this.name, (err as Error).message);
        return null;
      }
    }
    return null;
  }
}

/** Groq and OpenRouter both implement the OpenAI chat-completions contract. */
class OpenAiCompatProvider implements LlmProvider {
  constructor(
    readonly name: 'groq' | 'openrouter',
    private readonly apiKey: string,
    readonly model: string,
    private readonly baseUrl: string,
    private readonly extraHeaders: Record<string, string> = {},
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async complete(messages: LlmMessage[], opts: { maxTokens?: number } = {}): Promise<LlmResult | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.apiKey}`,
            ...this.extraHeaders,
          },
          body: JSON.stringify({
            model: this.model,
            messages,
            temperature: 0.2,
            max_tokens: opts.maxTokens ?? 700,
          }),
          signal: timeoutSignal(),
        });
        if (!res.ok) {
          const detail = await readError(res);
          if (attempt === 0 && RETRYABLE.test(detail)) {
            await sleep(RETRY_DELAY_MS);
            continue;
          }
          noteFailure(this.name, detail);
          return null;
        }
        const body = (await res.json()) as {
          choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        };
        const text = (body.choices?.[0]?.message?.content ?? '').trim();
        if (!text) {
          noteFailure(this.name, `empty answer (${body.choices?.[0]?.finish_reason ?? 'no choice'})`);
          return null;
        }
        return { text, provider: this.name, model: this.model };
      } catch (err) {
        if (attempt === 0) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        noteFailure(this.name, (err as Error).message);
        return null;
      }
    }
    return null;
  }
}

export interface LlmSelection {
  provider: LlmProvider | null;
  /**
   * Every provider whose key is present, in the order they should be tried.
   * The first one is reported by `/status`; the rest are the fallback for a
   * free tier that answers 429 or 503 on the minute the reader asks.
   */
  providers: LlmProvider[];
  /** Which provider name was asked for, even when its key is absent. */
  requested: string;
}

/**
 * Try providers in order until one answers. Each provider already retries a
 * transient failure once, so this is the second layer: a dead free tier becomes
 * another free tier, not an error page.
 */
export async function completeWithFallback(
  selection: LlmSelection,
  messages: LlmMessage[],
  opts: { maxTokens?: number } = {},
): Promise<LlmResult | null> {
  for (const provider of selection.providers) {
    const result = await provider.complete(messages, opts);
    if (result) return result;
  }
  return null;
}

/**
 * Pick the provider from the environment. `ASSISTANT_LLM` wins when set;
 * otherwise the first key present is used in cheapness order (Gemini's free
 * tier is the most generous). `ASSISTANT_LLM=none` forces the no-AI path even
 * when keys exist — useful for testing and for switching the bill off.
 *
 * An explicit choice only reorders the chain: if Gemini is overloaded, a Groq
 * key that is already configured still answers the question.
 */
export function resolveLlm(env: NodeJS.ProcessEnv = process.env): LlmSelection {
  const requested = (env.ASSISTANT_LLM ?? '').trim().toLowerCase();

  const gemini = () =>
    env.GEMINI_API_KEY
      ? new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL?.trim() || DEFAULTS.gemini)
      : null;
  const groq = () =>
    env.GROQ_API_KEY
      ? new OpenAiCompatProvider(
          'groq',
          env.GROQ_API_KEY,
          env.GROQ_MODEL?.trim() || DEFAULTS.groq,
          'https://api.groq.com/openai/v1',
        )
      : null;
  const openrouter = () =>
    env.OPENROUTER_API_KEY
      ? new OpenAiCompatProvider(
          'openrouter',
          env.OPENROUTER_API_KEY,
          env.OPENROUTER_MODEL?.trim() || DEFAULTS.openrouter,
          'https://openrouter.ai/api/v1',
          // OpenRouter attributes free-tier traffic by these two headers.
          { 'HTTP-Referer': env.PUBLIC_APP_URL ?? 'https://syncourse-web.vercel.app', 'X-Title': 'Syncourse' },
        )
      : null;

  if (requested === 'none' || requested === 'off') {
    return { provider: null, providers: [], requested: 'none' };
  }

  const order: Array<() => LlmProvider | null> =
    requested === 'groq'
      ? [groq, gemini, openrouter]
      : requested === 'openrouter'
        ? [openrouter, gemini, groq]
        : [gemini, groq, openrouter];

  const providers = order
    .map((make) => make())
    .filter((p): p is LlmProvider => Boolean(p));

  return {
    provider: providers[0] ?? null,
    providers,
    requested: requested || 'auto',
  };
}
