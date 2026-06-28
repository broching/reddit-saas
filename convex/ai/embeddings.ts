const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
export const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIMS = 768;
const TIMEOUT_MS = 30_000;

/** L2-normalize so cosine/dot-product similarity behaves consistently. */
function normalize(values: number[]): number[] {
  let sum = 0;
  for (const v of values) sum += v * v;
  const norm = Math.sqrt(sum);
  return norm > 0 ? values.map((v) => v / norm) : values;
}

/**
 * Embed a problem string into a normalized 768-d vector via the Gemini
 * embedding API. Returns the vector plus an estimated token count.
 */
export async function embedText(
  text: string,
): Promise<{ vector: number[]; tokens: number }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}/${EMBED_MODEL}:embedContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: EMBED_DIMS,
        taskType: "CLUSTERING",
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Gemini embed ${res.status}: ${t.slice(0, 200)}`);
    }
    const json = await res.json();
    const values: number[] = json?.embedding?.values ?? [];
    if (values.length !== EMBED_DIMS) {
      throw new Error(`Embedding returned ${values.length} dims, expected ${EMBED_DIMS}`);
    }
    return { vector: normalize(values), tokens: Math.ceil(text.length / 4) };
  } finally {
    clearTimeout(timer);
  }
}
