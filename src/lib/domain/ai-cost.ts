// Estimated Claude API cost per call, for the dev-only usage log (server/services/ai-usage.ts).
// Anthropic first-party list prices in USD per 1M tokens (2026-11). Update when prices change.

export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  /** Prompts above this many input tokens bill at the `long` rates (Haiku 5.5). */
  longAbove?: number;
  long?: { input: number; output: number };
}

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, longAbove: 100_000, long: { input: 0.5, output: 2.5 } },
};

/** Cache writes (5-minute TTL) bill at 1.25× the input rate. */
const CACHE_WRITE_MULTIPLIER = 1.25;

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** USD estimate, or null for a model without a price entry. Output includes thinking tokens. */
export function estimateCostUsd(model: string, usage: TokenUsage): number | null {
  const price = MODEL_PRICES[model];
  if (!price) return null;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const promptTokens = usage.input_tokens + cacheWrite + cacheRead;
  const rates = price.long && price.longAbove !== undefined && promptTokens > price.longAbove ? { ...price, ...price.long } : price;
  const perToken = (perMillion: number) => perMillion / 1_000_000;
  return (
    usage.input_tokens * perToken(rates.input) +
    cacheWrite * perToken(rates.input * CACHE_WRITE_MULTIPLIER) +
    cacheRead * perToken(rates.cacheRead) +
    usage.output_tokens * perToken(rates.output)
  );
}

export function formatUsd(usd: number | null): string {
  if (usd === null) return "$?";
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`;
}
