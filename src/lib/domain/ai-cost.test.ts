import { describe, expect, it } from "vitest";
import { estimateCostUsd, formatUsd } from "./ai-cost";

describe("estimateCostUsd", () => {
  it("prices Sonnet 5.5 input and output", () => {
    // 25k in × $2/M + 8k out × $10/M = 0.05 + 0.08
    expect(estimateCostUsd("claude-sonnet-5-5", { input_tokens: 25_000, output_tokens: 8_000 })).toBeCloseTo(0.13, 6);
  });

  it("prices cache writes at 1.25× input and cache reads at the read rate", () => {
    const usd = estimateCostUsd("claude-sonnet-5-5", { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 });
    expect(usd).toBeCloseTo(2 * 1.25 + 0.1, 6);
  });

  it("switches Haiku 5.5 to long-prompt rates above 100k input tokens", () => {
    expect(estimateCostUsd("claude-haiku-5-5", { input_tokens: 100_000, output_tokens: 0 })).toBeCloseTo(0.01, 6);
    expect(estimateCostUsd("claude-haiku-5-5", { input_tokens: 200_000, output_tokens: 1_000_000 })).toBeCloseTo(0.1 + 2.5, 6);
  });

  it("returns null for unknown models", () => {
    expect(estimateCostUsd("some-other-model", { input_tokens: 1, output_tokens: 1 })).toBeNull();
  });
});

describe("formatUsd", () => {
  it("keeps 4 decimals for sub-cent amounts", () => {
    expect(formatUsd(0.00312)).toBe("$0.0031");
    expect(formatUsd(0.1294)).toBe("$0.129");
    expect(formatUsd(null)).toBe("$?");
  });
});
