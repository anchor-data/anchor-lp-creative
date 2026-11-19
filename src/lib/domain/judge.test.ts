import { describe, expect, it } from "vitest";
import {
  aggregateDaily,
  judge,
  type JudgeInput,
  type JudgeRule,
  type JudgeSettings,
  type MetricTotals,
} from "./judge";

const settings: JudgeSettings = {
  windowType: "cumulative",
  windowDays: null,
  minDays: 7,
  minSpend: 0,
  earlyDays: 30,
};

// Spec ch.8 initial thresholds: fair = early (31日目以降は初期基準と同じ値)
const defaultRules: JudgeRule[] = [
  { metric: "mcvr", enabled: true, direction: "gte", hit: 12, fair: 10, early: 10 },
  { metric: "fsver", enabled: true, direction: "lte", hit: 45, fair: 50, early: 50 },
  { metric: "oar", enabled: true, direction: "gte", hit: 20, fair: 18, early: 18 },
];

const totals = (over: Partial<MetricTotals> = {}): MetricTotals => ({
  spend: 1_000_000,
  cv: 300,
  mcv: 130,
  mcvrBase: 1000,
  fsver: 40,
  oar: 22,
  ...over,
});

const input = (over: Partial<JudgeInput> = {}): JudgeInput => ({
  rules: defaultRules,
  settings,
  totals: totals(),
  deliveryDays: 60,
  elapsedDays: 60,
  window: { from: "2026-08-01", to: "2026-09-29" },
  rulesUpdatedAt: "2026-11-01T00:00:00Z",
  ...over,
});

describe("judge (spec ch.13 required cases)", () => {
  it("#1 all metrics meet hit thresholds -> hit", () => {
    expect(judge(input()).judge).toBe("hit");
  });

  it("#2 one metric misses hit but all meet fair -> fair", () => {
    const r = judge(input({ totals: totals({ oar: 19 }) }));
    expect(r.judge).toBe("fair");
  });

  it("#3 a metric misses fair -> miss", () => {
    expect(judge(input({ totals: totals({ oar: 10 }) })).judge).toBe("miss");
  });

  it("#4 CV=0 makes CPA fail rather than no_data", () => {
    const rules: JudgeRule[] = [
      { metric: "cpa", enabled: true, direction: "lte", hit: 3500, fair: 4500, early: 4000 },
    ];
    const r = judge(input({ rules, totals: totals({ cv: 0 }) }));
    expect(r.judge).toBe("miss");
    expect(r.metrics[0]).toMatchObject({ metric: "cpa", value: null, result: "miss" });
  });

  it("#5 metric without data is excluded and recorded as no_data", () => {
    const r = judge(input({ totals: totals({ mcv: null }) }));
    expect(r.judge).toBe("hit");
    expect(r.metrics.find((m) => m.metric === "mcvr")).toMatchObject({ result: "no_data" });
  });

  it("#6 no thresholds configured -> pending", () => {
    const rules: JudgeRule[] = [
      { metric: "spend", enabled: true, direction: "gte", hit: null, fair: null, early: null },
    ];
    expect(judge(input({ rules })).judge).toBe("pending");
  });

  it("#7 delivery days below minimum -> pending", () => {
    expect(judge(input({ deliveryDays: 5, elapsedDays: 5 })).judge).toBe("pending");
  });

  it("#7b spend below minimum -> pending", () => {
    const r = judge(input({ settings: { ...settings, minSpend: 2_000_000 } }));
    expect(r.judge).toBe("pending");
  });

  it("#8 blank fair thresholds -> two-stage (hit or miss)", () => {
    const rules = defaultRules.map((r) => ({ ...r, fair: null }));
    expect(judge(input({ rules, totals: totals({ oar: 19 }) })).judge).toBe("miss");
  });

  it("#11 last_n_days window is recorded in basis", () => {
    const r = judge(
      input({ settings: { ...settings, windowType: "last_n_days", windowDays: 14 } }),
    );
    expect(r.window.type).toBe("last_n_days");
  });

  it("#12 day 20 with FSVER 48 / OAR 19 / MCVR 11 meets early criteria -> hit", () => {
    const r = judge(
      input({
        deliveryDays: 20,
        elapsedDays: 20,
        totals: totals({ fsver: 48, oar: 19, mcv: 110, mcvrBase: 1000 }),
      }),
    );
    expect(r.judge).toBe("hit");
    expect(r.phase).toBe("early");
  });

  it("#13 same values on day 31 -> fair (target criteria not met)", () => {
    const r = judge(
      input({
        deliveryDays: 31,
        elapsedDays: 31,
        totals: totals({ fsver: 48, oar: 19, mcv: 110, mcvrBase: 1000 }),
      }),
    );
    expect(r.judge).toBe("fair");
    expect(r.phase).toBe("target");
  });

  it("early phase: failing early criteria -> miss (no fair in early phase)", () => {
    const r = judge(input({ deliveryDays: 20, elapsedDays: 20, totals: totals({ oar: 17 }) }));
    expect(r.judge).toBe("miss");
  });

  it("disabled metrics are ignored", () => {
    const rules = defaultRules.map((r) => (r.metric === "oar" ? { ...r, enabled: false } : r));
    expect(judge(input({ rules, totals: totals({ oar: 1 }) })).judge).toBe("hit");
  });
});

describe("aggregateDaily", () => {
  it("sums counts and PV-weights rate metrics", () => {
    const t = aggregateDaily([
      { spend: 100, cv: 2, mcv: 10, pv: 100, click: 50, fsver: 40, oar: 20 },
      { spend: 300, cv: 4, mcv: 30, pv: 300, click: 150, fsver: 60, oar: 10 },
    ]);
    expect(t.spend).toBe(400);
    expect(t.cv).toBe(6);
    expect(t.mcv).toBe(40);
    expect(t.mcvrBase).toBe(400);
    expect(t.fsver).toBeCloseTo(55);
    expect(t.oar).toBeCloseTo(12.5);
  });

  it("returns nulls when no rows carry a metric", () => {
    const t = aggregateDaily([{ spend: 100, cv: null, mcv: null, pv: null, click: null, fsver: null, oar: null }]);
    expect(t.cv).toBeNull();
    expect(t.fsver).toBeNull();
  });
});
