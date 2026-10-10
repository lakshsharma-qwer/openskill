import "server-only";

/*
 * One interface over three providers:
 *  - OpenAI, only for calls that ask for it (`prefer: "openai"`, e.g. the mentor chat), with automatic
 *    fallback to the default provider if it fails.
 *  - Groq (OpenAI-compatible) when GROQ_API_KEY is set — the default for everything else.
 *  - Gemini otherwise: AI Studio keys ("AIza…") go to the Gemini API,
 *    Vertex AI express keys ("AQ.…") go to Vertex AI.
 */

export class AIError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

interface GenerateOptions {
  system: string;
  contents: { role: "user" | "model"; text: string }[];
  json?: boolean;
  temperature?: number;
  /** Use the smaller, faster model (on Groq it also has its own rate-limit budget). */
  fast?: boolean;
  /** How many times to wait and retry when rate-limited (default 3). */
  retries?: number;
  /** Try this provider first, falling back to the default provider on any failure. */
  prefer?: "openai";
}

export async function generate(opts: GenerateOptions): Promise<string> {
  return (await generateWithProvider(opts)).text;
}

/** Same as generate(), but also reports which provider produced the answer. */
export async function generateWithProvider(opts: GenerateOptions): Promise<{ text: string; provider: string }> {
  if (opts.prefer === "openai" && process.env.OPENAI_API_KEY) {
    try {
      return { text: await openai(opts, process.env.OPENAI_API_KEY), provider: `openai:${process.env.OPENAI_MODEL || "gpt-5.2"}` };
    } catch (e) {
      console.warn(`[ai] OpenAI failed, falling back: ${(e as Error).message}`);
    }
  }
  const provider = process.env.GROQ_API_KEY ? "groq" : "gemini";
  return { text: await defaultProvider(opts), provider };
}

function defaultProvider(opts: GenerateOptions): Promise<string> {
  if (process.env.GROQ_API_KEY) return groq(opts, process.env.GROQ_API_KEY);
  if (process.env.GEMINI_API_KEY) return gemini(opts, process.env.GEMINI_API_KEY);
  throw new AIError("No AI key configured. Add GROQ_API_KEY or GEMINI_API_KEY to .env.local and restart the server.", 503);
}

export async function generateJSON<T>(opts: Omit<GenerateOptions, "json">): Promise<T> {
  const text = await generate({ ...opts, json: true });
  try {
    return JSON.parse(text) as T;
  } catch {
    // Fall back to extracting the outermost JSON object.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as T;
      } catch {}
    }
    throw new AIError("The AI returned malformed JSON. Please try again.", 502);
  }
}

/* ---------- OpenAI ---------- */

async function openai({ system, contents, json = false }: GenerateOptions, key: string) {
  const model = process.env.OPENAI_MODEL || "gpt-5.2";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000); // don't leave the learner waiting; fall back instead
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        // GPT-5 models only accept the default temperature, so it isn't sent.
        max_completion_tokens: 2000,
        ...(json ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: system },
          ...contents.map((c) => ({ role: c.role === "model" ? "assistant" : "user", content: c.text })),
        ],
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new AIError(data?.error?.message || `OpenAI request failed (${res.status})`, res.status);
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    if (!text) throw new AIError(`OpenAI returned no content (${data?.choices?.[0]?.finish_reason ?? "empty"}).`, 502);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Groq ---------- */

async function groq(opts: GenerateOptions, key: string) {
  // The free tier allows ~8k tokens/minute, so a roadmap right after another call can hit 429.
  // Wait for the window Groq tells us about and retry a few times before giving up.
  for (let attempt = 0; ; attempt++) {
    try {
      return await groqOnce(opts, key);
    } catch (e) {
      const err = e as AIError & { retryAfter?: number; retryable?: boolean };
      if (!(err.status === 429 || err.retryable) || attempt >= (opts.retries ?? 3)) throw err;
      await new Promise((r) => setTimeout(r, Math.min(30, err.retryAfter ?? 10) * 1000 + 500));
    }
  }
}

function retryAfterSeconds(res: Response, message: string) {
  const header = parseFloat(res.headers.get("retry-after") ?? "");
  if (Number.isFinite(header)) return header;
  const m = message.match(/try again in (?:(\d+)m)?([\d.]+)s/i);
  return m ? (m[1] ? +m[1] * 60 : 0) + parseFloat(m[2]) : undefined;
}

async function groqOnce({ system, contents, json = false, temperature = 0.7, fast = false }: GenerateOptions, key: string) {
  const model = fast ? process.env.GROQ_FAST_MODEL || "openai/gpt-oss-20b" : process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  // Groq checks prompt + max_completion_tokens against the per-minute token limit (8k on the free
  // tier), so ask only for the output room that's left. Prompt size is estimated at ~3.2 chars/token.
  const budget = Number(process.env.GROQ_TOKENS_PER_MINUTE) || 8000;
  const promptTokens = Math.ceil((system.length + contents.reduce((n, c) => n + c.text.length, 0)) / 3.2);
  const maxTokens = Math.max(1024, Math.min(16384, budget - promptTokens - 150));
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature,
      max_completion_tokens: maxTokens,
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
      ...(json ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: system },
        ...contents.map((c) => ({ role: c.role === "model" ? "assistant" : "user", content: c.text })),
      ],
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 429) {
      const err = new AIError("The AI is busy (free-tier rate limit). Please wait a minute and try again.", 429);
      throw Object.assign(err, { retryAfter: retryAfterSeconds(res, data?.error?.message ?? "") });
    }
    if (data?.error?.code === "json_validate_failed") {
      // The model occasionally emits invalid JSON; a fresh attempt almost always succeeds.
      throw Object.assign(new AIError("The AI produced an invalid plan. Please try again.", 502), { retryable: true, retryAfter: 1 });
    }
    throw new AIError(data?.error?.message || `Groq request failed (${res.status})`, res.status);
  }
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (json && data?.choices?.[0]?.finish_reason === "length") {
    throw new AIError("The plan was too long for the free AI tier. Try a shorter timeline or fewer details, then try again.", 502);
  }
  if (!text) throw new AIError(`The AI returned no content (${data?.choices?.[0]?.finish_reason ?? "empty response"}).`, 502);
  return text;
}

/* ---------- Gemini ---------- */

async function gemini({ system, contents, json = false, temperature = 0.7 }: GenerateOptions, key: string) {
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const vertex = process.env.GEMINI_BACKEND ? process.env.GEMINI_BACKEND === "vertex" : key.startsWith("AQ.");
  const url = vertex
    ? `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${encodeURIComponent(key)}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(vertex ? {} : { "x-goog-api-key": key }) },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: contents.map((c) => ({ role: c.role, parts: [{ text: c.text }] })),
      generationConfig: {
        temperature,
        maxOutputTokens: 32768,
        ...(json ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new AIError(data?.error?.message || `Gemini request failed (${res.status})`, res.status);

  const text: string | undefined = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? "")
    .join("");
  if (!text) {
    const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || "empty response";
    throw new AIError(`The AI returned no content (${reason}).`, 502);
  }
  return text;
}
