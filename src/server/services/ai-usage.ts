import "server-only";
import { estimateCostUsd, formatUsd, type TokenUsage } from "@/lib/domain/ai-cost";

// Dev-only Claude usage log: one line per call with tokens and estimated cost, plus a running total
// since the dev server started. Silent in production builds (next build sets NODE_ENV=production).

const enabled = process.env.NODE_ENV === "development";

/** Running total for this dev-server process (reset on restart). */
const totals = { calls: 0, usd: 0 };

export interface UsageSource {
  model: string;
  usage: TokenUsage;
}

/** Logs one Claude response. `label` names the feature (e.g. "video-analysis"). */
export function logAiUsage(label: string, res: UsageSource): void {
  if (!enabled) return;
  const usd = estimateCostUsd(res.model, res.usage);
  totals.calls += 1;
  totals.usd += usd ?? 0;
  const u = res.usage;
  const cache = (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) > 0
    ? ` cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0}`
    : "";
  console.info(
    `[claude] ${label} ${res.model} in=${u.input_tokens.toLocaleString()} out=${u.output_tokens.toLocaleString()}${cache}` +
      ` → ${formatUsd(usd)}（dev合計 ${totals.calls}回 ${formatUsd(totals.usd)}）`,
  );
}
