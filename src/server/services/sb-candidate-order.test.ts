import { createClient, type Client } from "@libsql/client";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SB_CANDIDATE_ORDER } from "./sb-candidate-order";

// Runs the real migrations on an in-memory database: the Version-total view (0005) and the list order.

let db: Client;

async function migrate(client: Client): Promise<void> {
  const dir = join(process.cwd(), "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(join(dir, file), "utf8"));
  }
}

interface Row {
  date: string;
  creative: string;
  spend: number;
  pv: number;
  cv: number;
  fsver: number | null;
}

async function insertMetrics(version: string, media: string, rows: readonly Row[]): Promise<void> {
  for (const r of rows) {
    await db.execute({
      sql: `INSERT INTO sb_metrics_daily (date, sb_version_id, sb_creative_id, media, spend, pv, cv, mcv, fsver, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-11-01T00:00:00Z')`,
      args: [r.date, version, r.creative, media, r.spend, r.pv, r.cv, Math.round(r.pv / 2), r.fsver],
    });
  }
}

beforeEach(async () => {
  db = createClient({ url: ":memory:" });
  await migrate(db);
});

afterEach(() => db.close());

describe("sb_metrics_keyed", () => {
  it("adds a '*' row per day that sums every parameter of the Version × media", async () => {
    await insertMetrics("v1", "smartnews", [
      { date: "2026-11-01", creative: "p1", spend: 300, pv: 100, cv: 1, fsver: 10 },
      { date: "2026-11-01", creative: "p2", spend: 200, pv: 300, cv: 0, fsver: 30 },
      { date: "2026-11-02", creative: "p1", spend: 500, pv: 100, cv: 2, fsver: null },
    ]);
    const res = await db.execute({
      sql: "SELECT date, spend, pv, cv, fsver FROM sb_metrics_keyed WHERE sb_version_id = 'v1' AND sb_creative_id = '*' ORDER BY date",
      args: [],
    });
    expect(res.rows.map((r) => ({ ...r }))).toEqual([
      // fsver is PV-weighted: (10×100 + 30×300) / 400 = 25
      { date: "2026-11-01", spend: 500, pv: 400, cv: 1, fsver: 25 },
      { date: "2026-11-02", spend: 500, pv: 100, cv: 2, fsver: null },
    ]);
  });

  it("still returns each parameter's own rows", async () => {
    await insertMetrics("v1", "smartnews", [{ date: "2026-11-01", creative: "p1", spend: 300, pv: 100, cv: 1, fsver: 10 }]);
    const res = await db.execute("SELECT COUNT(*) n FROM sb_metrics_keyed WHERE sb_creative_id = 'p1'");
    expect(Number(res.rows[0].n)).toBe(1);
  });
});

describe("SB_CANDIDATE_ORDER", () => {
  async function addCandidate(id: string, judge: string, spend: number, cv: number, mcv: number): Promise<void> {
    await db.execute({
      sql: `INSERT INTO sb_candidates (id, sb_version_id, sb_creative_id, media, judge, summary_json, first_seen_at, updated_at)
            VALUES (?, ?, '*', 'smartnews', ?, '{}', '2026-11-01', '2026-11-01')`,
      args: [id, `v-${id}`, judge],
    });
    await insertMetrics(`v-${id}`, "smartnews", [{ date: "2026-11-01", creative: "p", spend, pv: mcv * 2, cv, fsver: null }]);
  }

  async function ordered(): Promise<string[]> {
    const res = await db.execute(`
      SELECT sc.id FROM sb_candidates sc
      LEFT JOIN (SELECT sb_version_id, sb_creative_id, media, SUM(spend) spend, SUM(cv) cv, SUM(mcv) mcv, SUM(pv) base
                 FROM sb_metrics_keyed GROUP BY 1, 2, 3) t
        ON t.sb_version_id = sc.sb_version_id AND t.sb_creative_id = sc.sb_creative_id AND t.media = sc.media
      ORDER BY ${SB_CANDIDATE_ORDER}`);
    return res.rows.map((r) => String(r.id));
  }

  it("puts better judgments first, then the lowest CPA, and no-CV rows last", async () => {
    await addCandidate("pending-cheap", "pending", 1_000, 1, 50); // CPA 1,000
    await addCandidate("hit-expensive", "hit", 90_000, 10, 500); // CPA 9,000
    await addCandidate("hit-cheap", "hit", 30_000, 10, 500); // CPA 3,000
    await addCandidate("hit-no-cv", "hit", 80_000, 0, 500);
    await addCandidate("fair", "fair", 10_000, 5, 100); // CPA 2,000
    expect(await ordered()).toEqual(["hit-cheap", "hit-expensive", "hit-no-cv", "fair", "pending-cheap"]);
  });

  it("breaks CPA ties with the higher MCVR", async () => {
    await addCandidate("low-mcvr", "fair", 10_000, 5, 100);
    await addCandidate("high-mcvr", "fair", 10_000, 5, 100);
    // Same CPA; raise MCV (not PV) for one of them.
    await db.execute("UPDATE sb_metrics_daily SET mcv = 180 WHERE sb_version_id = 'v-high-mcvr'");
    expect(await ordered()).toEqual(["high-mcvr", "low-mcvr"]);
  });
});
