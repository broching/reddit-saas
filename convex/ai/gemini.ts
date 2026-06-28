const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST to Gemini with retry/backoff on 429 (rate limit) and 5xx. */
async function callWithRetry(
  model: string,
  apiKey: string,
  body: unknown,
): Promise<any> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.ok) return await res.json();

      const text = await res.text().catch(() => "");
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= MAX_ATTEMPTS) {
        throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
      }
      await sleep(Math.min(20_000, 2 ** attempt * 1000) + Math.random() * 1000);
    } finally {
      clearTimeout(timer);
    }
  }
}

export type GeminiSchema = Record<string, unknown>;

export type GeminiResult = {
  data: unknown;
  promptTokens: number;
  completionTokens: number;
};

/**
 * Calls the Gemini REST API with a JSON response schema and returns the parsed
 * object plus token usage. Uses `fetch` (no Node runtime needed) and disables
 * "thinking" so the cheap extraction stages stay fast and inexpensive.
 */
export async function generateStructured(opts: {
  system?: string;
  prompt: string;
  schema: GeminiSchema;
  model?: string;
  temperature?: number;
}): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY. Set it via `npx convex env set GEMINI_API_KEY <key>`.",
    );
  }
  const model = opts.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;

  const body = {
    ...(opts.system
      ? { systemInstruction: { parts: [{ text: opts.system }] } }
      : {}),
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: opts.schema,
      temperature: opts.temperature ?? 0.2,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const json = await callWithRetry(model, apiKey, body);
  const candidate = json?.candidates?.[0];
  if (!candidate) {
    const reason = json?.promptFeedback?.blockReason ?? "no candidates";
    throw new Error(`Gemini returned no output (${reason})`);
  }
  if (candidate.finishReason && candidate.finishReason !== "STOP") {
    throw new Error(`Gemini stopped early: ${candidate.finishReason}`);
  }
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned empty text");

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned non-JSON output");
  }

  const usage = json?.usageMetadata ?? {};
  return {
    data,
    promptTokens: usage.promptTokenCount ?? 0,
    completionTokens:
      (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
  };
}
