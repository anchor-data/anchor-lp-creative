// Seeds master data (spec ch.5 初期データ) and, with --sample, demo cases from the Figma.
// Usage: npm run db:seed            (master data only; idempotent)
//        npm run db:seed -- --sample
import { createClient, type InStatement } from "@libsql/client";
import { ulid } from "ulid";
import { aggregateDaily, judge, type DailyRow, type JudgeRule } from "../src/lib/domain/judge";
import { DEFAULT_REC_WEIGHTS } from "../src/lib/domain/recommend";

const now = new Date().toISOString();

// 要件定義書 第9章の初期案が届くまでの仮の業種カテゴリ（A-01で編集可能）
const CATEGORY_TREE: Record<string, string[]> = {
  "美容・コスメ": ["スキンケア", "エイジングケア", "ヘアケア"],
  "健康食品・サプリ": ["ダイエット", "腸活", "睡眠"],
  金融: ["カードローン", "クレジットカード"],
  "医療・クリニック": ["美容医療", "AGA・薄毛"],
  "教育・スクール": ["オンライン講座", "資格"],
  "人材・転職": ["転職", "副業"],
  不動産: ["投資用不動産"],
  "通販・その他": ["食品", "日用品"],
};

const TAG_TYPES = [
  { code: "axis", name: "訴求軸", required: 1, tags: ["悩み共感", "権威・専門家", "体験談", "価格・お得感", "限定性", "比較"] },
  { code: "hook", name: "フック種別", required: 0, tags: ["問いかけ", "衝撃的事実", "ビフォーアフター", "ランキング"] },
  { code: "target", name: "ターゲット", required: 0, tags: ["20代女性", "30代女性", "40代女性", "50代以上"] },
  { code: "tone", name: "トンマナ", required: 0, tags: ["ナチュラル", "高級感", "ポップ", "信頼感"] },
  { code: "cast", name: "出演者種別", required: 0, tags: ["一般ユーザー", "専門家", "インフルエンサー", "出演なし"] },
];

// Spec ch.8 しきい値の初期値. fair = early (31日目以降は初期基準と同じ値)
const INITIAL_RULES: JudgeRule[] = [
  { metric: "spend", enabled: true, direction: "gte", hit: null, fair: null, early: null },
  { metric: "cpa", enabled: true, direction: "lte", hit: null, fair: null, early: null },
  { metric: "mcvr", enabled: true, direction: "gte", hit: 12, fair: 10, early: 10 },
  { metric: "cv", enabled: true, direction: "gte", hit: null, fair: null, early: null },
  { metric: "fsver", enabled: true, direction: "lte", hit: 45, fair: 50, early: 50 },
  { metric: "oar", enabled: true, direction: "gte", hit: 20, fair: 18, early: 18 },
];
const SETTINGS = { windowType: "cumulative" as const, windowDays: null, minDays: 7, minSpend: 0, earlyDays: 30 };

async function main(): Promise<void> {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is not set");
  const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  const withSample = process.argv.includes("--sample");

  const exists = await db.execute("SELECT COUNT(*) AS n FROM categories");
  if (Number(exists.rows[0].n) > 0) {
    process.stdout.write("master data already present; skipping master seed\n");
  } else {
    await db.batch(masterStatements(), "write");
    process.stdout.write("master data seeded\n");
  }

  if (withSample) {
    const n = await db.execute("SELECT COUNT(*) AS n FROM combinations");
    if (Number(n.rows[0].n) > 0) {
      process.stdout.write("sample data already present; skipping\n");
    } else {
      await db.batch(await sampleStatements(db), "write");
      process.stdout.write("sample data seeded\n");
    }
  }
  db.close();
}

function masterStatements(): InStatement[] {
  const out: InStatement[] = [];
  let order = 0;
  for (const [parent, children] of Object.entries(CATEGORY_TREE)) {
    const pid = ulid();
    out.push({
      sql: "INSERT INTO categories (id, parent_id, name, sort_order, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, ?)",
      args: [pid, parent, order++, now, now],
    });
    children.forEach((child, i) => {
      const cid = ulid();
      out.push({
        sql: "INSERT INTO categories (id, parent_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        args: [cid, pid, child, i, now, now],
      });
      for (const r of INITIAL_RULES) {
        out.push({
          sql: "INSERT INTO judge_rules (category_id, metric, enabled, direction, hit_value, fair_value, early_value, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          args: [cid, r.metric, r.enabled ? 1 : 0, r.direction, r.hit, r.fair, r.early, now],
        });
      }
      out.push({
        sql: "INSERT INTO judge_settings (category_id, window_type, min_days, min_spend, early_days, updated_at) VALUES (?, 'cumulative', 7, 0, 30, ?)",
        args: [cid, now],
      });
    });
  }
  TAG_TYPES.forEach((tt, i) => {
    const ttid = ulid();
    out.push({
      sql: "INSERT INTO tag_types (id, code, name, required, sort_order) VALUES (?, ?, ?, ?, ?)",
      args: [ttid, tt.code, tt.name, tt.required, i],
    });
    tt.tags.forEach((name, j) => {
      out.push({ sql: "INSERT INTO tags (id, tag_type_id, name, sort_order) VALUES (?, ?, ?, ?)", args: [ulid(), ttid, name, j] });
    });
  });
  out.push({
    sql: "INSERT INTO settings (key, value_json, updated_at) VALUES ('rec_weights', ?, ?)",
    args: [JSON.stringify(DEFAULT_REC_WEIGHTS), now],
  });
  out.push({
    sql: "INSERT INTO settings (key, value_json, updated_at) VALUES ('default_judge_rules', ?, ?)",
    args: [JSON.stringify({ rules: INITIAL_RULES, settings: SETTINGS }), now],
  });
  for (const [phrase, law, alternative, severity] of [
    ["痩せる", "薬機法", "すっきり習慣をサポート", "ng"],
    ["治る", "薬機法", "ケアする", "ng"],
    ["腸の調子を整える", "薬機法", "毎日のすっきり習慣に", "warn"],
    ["シミが消える", "薬機法", "透明感のある肌へ", "ng"],
    ["業界No.1", "景品表示法", "根拠となる調査を併記する", "warn"],
  ] as const) {
    out.push({
      sql: "INSERT INTO ng_expressions (id, category_id, phrase, match_type, law, alternative, severity, updated_at) VALUES (?, NULL, ?, 'contains', ?, ?, ?, ?)",
      args: [ulid(), phrase, law, alternative, severity, now],
    });
  }
  return out;
}

interface SampleCase {
  product: string;
  client: string;
  category: string;
  kind: "video" | "banner";
  duration?: number;
  copy: string;
  script?: { from: number; to: number; narration: string }[];
  article: string;
  blocks: string[];
  body: string;
  media: string;
  origin: "own" | "market";
  start: string;
  end: string | null;
  tags: string[];
  memo?: string;
  // own: daily metrics generator; market: estimates
  perDay?: { spend: number; pv: number; cv: number; mcv: number; fsver: number; oar: number };
  days?: number;
  market?: { estSpend: number; days: number; views: number };
  sb?: boolean;
}

const BLOCK_CODES: Record<string, string> = {
  ファーストビュー: "fv",
  悩み提起: "pain",
  原因解説: "cause",
  解決策: "solution",
  商品紹介: "product",
  口コミ: "review",
  オファー: "offer",
  CTA: "cta",
  "権威・専門家": "authority",
  比較: "comparison",
};

const SAMPLES: SampleCase[] = [
  {
    product: "美容液A", client: "サンプル化粧品", category: "スキンケア", kind: "video", duration: 15,
    copy: "40代になって、急に乾燥が気になりませんか？",
    script: [
      { from: 0, to: 3, narration: "「40代になって、急に乾燥が気になりませんか？」" },
      { from: 3, to: 8, narration: "使用者の朝の肌の様子（体験談）" },
      { from: 8, to: 12, narration: "商品と使い方" },
      { from: 12, to: 15, narration: "「詳しくは記事で」" },
    ],
    article: "40代からの乾燥対策",
    blocks: ["ファーストビュー:40代の乾燥の悩み", "悩み提起:保湿してもすぐ乾く", "原因解説:年齢による肌の変化", "解決策:夜の集中ケア", "商品紹介:美容液A", "口コミ:愛用者の声", "オファー:初回限定価格", "CTA:今すぐ試す"],
    body: "40代になると肌の水分保持力が低下し、保湿してもすぐに乾燥を感じるようになります。夜の集中ケアで…",
    media: "meta", origin: "own", start: "2026-08-01", end: "2026-09-30",
    tags: ["悩み共感", "体験談", "問いかけ", "一般ユーザー", "ナチュラル"],
    memo: "冒頭の問いかけと記事のファーストビューの悩みが一致していて、記事の読了率が高かった。次は「朝ケア」訴求でも試したい。",
    perDay: { spend: 20000, pv: 900, cv: 6, mcv: 125, fsver: 41, oar: 22 }, days: 61, sb: true,
  },
  {
    product: "美容液A", client: "サンプル化粧品", category: "スキンケア", kind: "video", duration: 15,
    copy: "40代になって、急に乾燥が気になりませんか？",
    article: "乾燥小じわの正体",
    blocks: ["ファーストビュー:乾燥小じわ", "原因解説:角層の水分不足", "商品紹介:美容液A", "CTA:詳しく見る"],
    body: "乾燥小じわは角層の水分不足が原因の一つです…",
    media: "youtube", origin: "own", start: "2026-08-10", end: "2026-10-10",
    tags: ["原因解説", "限定性"].filter(Boolean),
    perDay: { spend: 15000, pv: 800, cv: 4, mcv: 92, fsver: 47, oar: 19 }, days: 60,
  },
  {
    product: "美容液A", client: "サンプル化粧品", category: "スキンケア", kind: "video", duration: 15,
    copy: "40代になって、急に乾燥が気になりませんか？",
    article: "人気美容液ランキング",
    blocks: ["ファーストビュー:ランキング", "比較:美容液5選", "CTA:1位を見る"],
    body: "人気の美容液を5つ比較しました…",
    media: "meta", origin: "own", start: "2026-08-15", end: "2026-09-20",
    tags: ["比較", "ランキング"],
    perDay: { spend: 10000, pv: 700, cv: 2, mcv: 50, fsver: 58, oar: 12 }, days: 36,
  },
  {
    product: "クリームB", client: "サンプル化粧品", category: "スキンケア", kind: "banner",
    copy: "皮膚科医が教える、正しい保湿の順番",
    article: "皮膚科医が教える保湿",
    blocks: ["ファーストビュー:皮膚科医の解説", "権威・専門家:監修医コメント", "解決策:保湿の順番", "商品紹介:クリームB", "CTA:詳しく見る"],
    body: "皮膚科医によると、保湿は順番が大切です…",
    media: "line", origin: "own", start: "2026-07-01", end: "2026-09-15",
    tags: ["権威・専門家", "比較", "専門家", "信頼感"],
    memo: "専門家の顔出しバナーはCTRが高い。記事FVも同じ医師で統一したのが効いた。",
    perDay: { spend: 11000, pv: 600, cv: 4, mcv: 85, fsver: 39, oar: 24 }, days: 77, sb: true,
  },
  {
    product: "クリームB", client: "サンプル化粧品", category: "スキンケア", kind: "banner",
    copy: "冬の乾燥、夜のひと塗りで変わる",
    article: "冬の乾燥は夜ケアで",
    blocks: ["ファーストビュー:冬の乾燥", "解決策:夜ケア", "商品紹介:クリームB", "CTA:今すぐ"],
    body: "冬は空気が乾燥し…",
    media: "yahoo", origin: "own", start: "2026-10-20", end: null,
    tags: ["悩み共感", "ナチュラル"],
    perDay: { spend: 21000, pv: 1000, cv: 7, mcv: 115, fsver: 46, oar: 19 }, days: 25,
  },
  {
    product: "他社 化粧水", client: "（市場事例）", category: "スキンケア", kind: "video", duration: 30,
    copy: "毛穴が目立つのは、実は乾燥のせいかも",
    article: "毛穴が目立つ理由",
    blocks: ["ファーストビュー:毛穴の悩み", "原因解説:乾燥と毛穴", "商品紹介:化粧水", "CTA:詳しく"],
    body: "毛穴が目立つ原因は皮脂だけではありません…",
    media: "tiktok", origin: "market", start: "2026-08-20", end: null,
    tags: ["ビフォーアフター"],
    market: { estSpend: 4_500_000, days: 62, views: 3_100_000 },
  },
  {
    product: "他社 美容液", client: "（市場事例）", category: "スキンケア", kind: "video", duration: 15,
    copy: "30代の肌悩みランキング、1位は？",
    article: "30代の肌悩みランキング",
    blocks: ["ファーストビュー:ランキング", "口コミ:体験談", "CTA:詳しく"],
    body: "30代女性500人に聞いた肌悩みランキング…",
    media: "meta", origin: "market", start: "2026-09-01", end: null,
    tags: ["ランキング", "体験談"],
    market: { estSpend: 2_800_000, days: 45, views: 1_600_000 },
  },
  {
    product: "腸活サプリX", client: "サンプル健康食品", category: "腸活", kind: "video", duration: 15,
    copy: "40代から腸が変わる？すっきりしない日の正体",
    article: "40代の腸の変化",
    blocks: ["ファーストビュー:40代の腸の変化", "悩み提起:すっきりしない", "原因解説:年齢と腸内環境", "解決策:毎日の習慣", "商品紹介:腸活サプリX", "口コミ:愛用者の声", "オファー:初回980円", "CTA:今すぐ"],
    body: "40代になると腸内環境が変化しやすくなります…",
    media: "meta", origin: "own", start: "2026-07-15", end: "2026-10-15",
    tags: ["悩み共感", "問いかけ", "40代女性"],
    memo: "原因解説を挟む構成で離脱が少なかった。",
    perDay: { spend: 25000, pv: 1100, cv: 9, mcv: 150, fsver: 42, oar: 21 }, days: 92, sb: true,
  },
  {
    product: "便秘対策茶", client: "サンプル健康食品", category: "腸活", kind: "banner",
    copy: "朝すっきり、を習慣に",
    article: "朝すっきりの習慣",
    blocks: ["ファーストビュー:朝の習慣", "解決策:お茶習慣", "商品紹介:便秘対策茶", "CTA:詳しく"],
    body: "朝の一杯から始めるすっきり習慣…",
    media: "line", origin: "own", start: "2026-08-01", end: "2026-10-01",
    tags: ["体験談", "ナチュラル"],
    perDay: { spend: 12000, pv: 600, cv: 3, mcv: 80, fsver: 44, oar: 20 }, days: 61,
  },
  {
    product: "腸活サプリY", client: "サンプル健康食品", category: "腸活", kind: "video", duration: 30,
    copy: "腸活サプリ、どれを選ぶ？",
    article: "腸活ランキング",
    blocks: ["ファーストビュー:ランキング", "比較:腸活サプリ5選", "CTA:1位を見る"],
    body: "腸活サプリを5つ比較…",
    media: "yahoo", origin: "own", start: "2026-08-01", end: "2026-09-30",
    tags: ["比較", "ランキング"],
    perDay: { spend: 9000, pv: 500, cv: 2, mcv: 55, fsver: 47, oar: 19 }, days: 61,
  },
  {
    product: "他社 乳酸菌", client: "（市場事例）", category: "腸活", kind: "video", duration: 30,
    copy: "医師が解説、腸内環境と年齢の関係",
    article: "医師が解説 腸内環境",
    blocks: ["ファーストビュー:医師の解説", "権威・専門家:医師コメント", "原因解説:腸内環境", "商品紹介:乳酸菌", "CTA:詳しく"],
    body: "医師によると腸内環境は年齢とともに…",
    media: "tiktok", origin: "market", start: "2026-09-10", end: null,
    tags: ["権威・専門家", "専門家"],
    market: { estSpend: 3_100_000, days: 58, views: 2_200_000 },
  },
  {
    product: "カードローンZ", client: "サンプル金融", category: "カードローン", kind: "banner",
    copy: "最短即日、まずは3秒診断",
    article: "カードローンの選び方",
    blocks: ["ファーストビュー:選び方", "比較:金利比較", "CTA:診断する"],
    body: "カードローンを選ぶときは金利と審査スピード…",
    media: "google", origin: "own", start: "2026-09-01", end: null,
    tags: ["比較", "価格・お得感"],
    perDay: { spend: 30000, pv: 1500, cv: 10, mcv: 200, fsver: 43, oar: 21 }, days: 5,
  },
];

async function sampleStatements(db: ReturnType<typeof createClient>): Promise<InStatement[]> {
  const out: InStatement[] = [];
  const userId = ulid();
  out.push({
    sql: "INSERT OR IGNORE INTO users (id, email, name, role, created_at, updated_at) VALUES (?, 'sample-yamada@example.com', '山田（運用）', 'editor', ?, ?)",
    args: [userId, now, now],
  });

  const cats = await db.execute("SELECT id, name FROM categories WHERE parent_id IS NOT NULL");
  const catId = new Map(cats.rows.map((r) => [String(r.name), String(r.id)]));
  const tagRows = await db.execute("SELECT id, name FROM tags");
  const tagId = new Map(tagRows.rows.map((r) => [String(r.name), String(r.id)]));

  const productIds = new Map<string, string>();
  const creativeIds = new Map<string, string>();

  for (const s of SAMPLES) {
    const categoryId = catId.get(s.category);
    if (!categoryId) throw new Error(`unknown category ${s.category}`);

    let productId = productIds.get(s.product);
    if (!productId) {
      productId = ulid();
      productIds.set(s.product, productId);
      out.push({
        sql: "INSERT INTO products (id, name, client_name, category_id, target_gender, target_age, target_pain, offer, usp, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, '女性', '40代', ?, '初回限定価格', ?, ?, ?, ?)",
        args: [productId, s.product, s.client, categoryId, s.copy, `${s.product}の独自成分`, userId, now, now],
      });
    }

    const creativeKey = `${s.product}|${s.copy}|${s.kind}`;
    let creativeId = creativeIds.get(creativeKey);
    const sbCreativeId = s.sb ? `sbc-${ulid().slice(-6)}` : null;
    if (!creativeId) {
      creativeId = ulid();
      creativeIds.set(creativeKey, creativeId);
      out.push({
        sql: "INSERT INTO creatives (id, product_id, kind, source_url, duration_sec, width, height, main_copy, script_json, sb_creative_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [
          creativeId, productId, s.kind, "https://example.com/sample-creative", s.duration ?? null,
          s.kind === "video" ? 1080 : 1200, s.kind === "video" ? 1920 : 628, s.copy,
          s.script ? JSON.stringify(s.script.map((x) => ({ ...x, visual: "", telop: "" }))) : null,
          sbCreativeId, userId, now, now,
        ],
      });
      for (const t of s.tags) {
        const id = tagId.get(t);
        if (id) out.push({ sql: "INSERT OR IGNORE INTO creative_tags (creative_id, tag_id, source) VALUES (?, ?, 'human')", args: [creativeId, id] });
      }
    }

    const articleId = ulid();
    const blocks = s.blocks.map((b) => {
      const [type, heading] = b.split(":");
      return { type: BLOCK_CODES[type] ?? "fv", heading, summary: "" };
    });
    const sbVersionId = s.sb ? `sbv-${ulid().slice(-6)}` : null;
    out.push({
      sql: "INSERT INTO articles (id, product_id, url, title, body_text, blocks_json, sb_version_id, captured_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [articleId, productId, `https://example.com/lp/${articleId.toLowerCase()}`, s.article, s.body, JSON.stringify(blocks), sbVersionId, now, userId, now, now],
    });
    for (const t of s.tags) {
      const id = tagId.get(t);
      if (id) out.push({ sql: "INSERT OR IGNORE INTO article_tags (article_id, tag_id, source) VALUES (?, ?, 'human')", args: [articleId, id] });
    }

    const combinationId = ulid();
    const after: InStatement[] = []; // rows referencing the combination
    let judgeAuto: string | null = null;
    let basis: string | null = null;
    if (s.origin === "own" && s.perDay && s.days) {
      const rows: DailyRow[] = Array.from({ length: s.days }, (_, i) => {
        const wobble = 1 + Math.sin(i) * 0.1;
        return {
          spend: Math.round(s.perDay!.spend * wobble),
          pv: Math.round(s.perDay!.pv * wobble),
          click: Math.round(s.perDay!.pv * 0.4),
          cv: s.perDay!.cv,
          mcv: Math.round(s.perDay!.mcv * wobble),
          fsver: s.perDay!.fsver,
          oar: s.perDay!.oar,
        };
      });
      const to = addDays(s.start, s.days - 1);
      const result = judge({
        rules: INITIAL_RULES,
        settings: SETTINGS,
        totals: aggregateDaily(rows),
        deliveryDays: s.days,
        elapsedDays: s.days,
        window: { from: s.start, to },
        rulesUpdatedAt: now,
      });
      judgeAuto = result.judge;
      basis = JSON.stringify(result);

      if (s.sb && sbVersionId && sbCreativeId) {
        rows.forEach((r, i) => {
          out.push({
            sql: "INSERT INTO sb_metrics_daily (date, sb_version_id, sb_creative_id, media, spend, pv, click, cv, mcv, mcvr, fsver, oar, cpa, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            args: [addDays(s.start, i), sbVersionId, sbCreativeId, s.media, r.spend, r.pv, r.click, r.cv, r.mcv, ((r.mcv ?? 0) / (r.pv ?? 1)) * 100, r.fsver, r.oar, r.cv ? Math.round((r.spend ?? 0) / r.cv) : null, now],
          });
        });
      } else {
        const t = aggregateDaily(rows);
        after.push({
          sql: "INSERT INTO manual_metrics (id, combination_id, period_start, period_end, spend, imp, click, pv, cv, mcv, fsver, oar, source, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)",
          args: [ulid(), combinationId, s.start, to, t.spend, (t.mcvrBase ?? 0) * 20, Math.round((t.mcvrBase ?? 0) * 0.4), t.mcvrBase, t.cv, t.mcv, t.fsver, t.oar, userId, now],
        });
      }
    }

    const searchText = [s.category, s.product, s.copy, s.article, s.body, s.tags.join(" "), s.memo ?? ""].join("\n");
    out.push({
      sql: `INSERT INTO combinations (id, product_id, creative_id, article_id, media, start_date, end_date, origin, metrics_source,
            sb_version_id, sb_creative_id, dpro_ad_id, judge_auto, judge_basis_json, judged_at, search_text, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        combinationId, productId, creativeId, articleId, s.media, s.start, s.end, s.origin,
        s.origin === "market" ? "dpro" : s.sb ? "sb" : "manual",
        sbVersionId, sbCreativeId, s.origin === "market" ? `dpro-${ulid().slice(-8)}` : null,
        judgeAuto, basis, judgeAuto ? now : null, searchText, userId, now, now,
      ],
    });
    out.push(...after);
    if (s.market) {
      out.push({
        sql: "INSERT INTO market_metrics (combination_id, snapshot_date, est_spend, delivery_days, views) VALUES (?, ?, ?, ?, ?)",
        args: [combinationId, now.slice(0, 10), s.market.estSpend, s.market.days, s.market.views],
      });
    }
    if (s.memo) {
      out.push({
        sql: "INSERT INTO memos (id, combination_id, kind, body, created_by, created_at, updated_at) VALUES (?, ?, 'win', ?, ?, ?, ?)",
        args: [ulid(), combinationId, s.memo, userId, now, now],
      });
    }
  }

  // Squad beyond master + unregistered delivery so J-08 produces candidates.
  const pageId = "sbp-sample01";
  out.push({ sql: "INSERT INTO sb_pages (id, name, folder, status, url, synced_at) VALUES (?, '美容液A 記事LP', 'サンプル化粧品', 'active', 'https://sb.example.com/p/1', ?)", args: [pageId, now] });
  const unregistered = [
    { v: "sbv-cand01", vname: "v3 朝ケア訴求", c: "sbc-cand01", cname: "朝の肌_15s", media: "meta", perDay: { spend: 22000, pv: 950, cv: 7, mcv: 130, fsver: 40, oar: 23 } },
    { v: "sbv-cand02", vname: "v4 成分訴求", c: "sbc-cand02", cname: "成分解説_30s", media: "tiktok", perDay: { spend: 14000, pv: 700, cv: 4, mcv: 76, fsver: 48, oar: 19 } },
    { v: "sbv-cand03", vname: "v5 価格訴求", c: "sbc-cand03", cname: "初回価格_bn", media: "line", perDay: { spend: 9000, pv: 500, cv: 1, mcv: 30, fsver: 60, oar: 11 } },
  ];
  for (const u of unregistered) {
    out.push({ sql: "INSERT INTO sb_versions (id, page_id, name, url, body_text, synced_at) VALUES (?, ?, ?, ?, ?, ?)", args: [u.v, pageId, u.vname, `https://sb.example.com/p/1/${u.v}`, `${u.vname}の記事本文（サンプル）`, now] });
    out.push({ sql: "INSERT INTO sb_creatives (id, page_id, name, parameter, synced_at) VALUES (?, ?, ?, ?, ?)", args: [u.c, pageId, u.cname, u.c, now] });
    for (let i = 0; i < 45; i++) {
      const d = addDays("2026-09-20", i);
      out.push({
        sql: "INSERT INTO sb_metrics_daily (date, sb_version_id, sb_creative_id, media, spend, pv, click, cv, mcv, fsver, oar, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [d, u.v, u.c, u.media, u.perDay.spend, u.perDay.pv, Math.round(u.perDay.pv * 0.3), u.perDay.cv, u.perDay.mcv, u.perDay.fsver, u.perDay.oar, now],
      });
    }
  }

  // DPro candidates (Figma S-06)
  const gut = catId.get("腸活");
  const dpro = [
    ["他社 乳酸菌サプリ", "医師が解説 腸内環境と年齢", "tiktok", 30, 3_100_000, 58, "article", ["権威・専門家", "問いかけ"]],
    ["他社 酵素ドリンク", "朝の習慣ランキング", "meta", 15, 2_400_000, 41, "article", ["ランキング"]],
    ["他社 青汁", "管理栄養士の1日", "youtube", 30, 1_900_000, 36, "article", ["権威・専門家"]],
    ["他社 腸活サプリ", "商品LP", "meta", 15, 2_200_000, 30, "product", ["限定性", "価格・お得感"]],
  ] as const;
  const condId = ulid();
  out.push({
    sql: "INSERT INTO dpro_conditions (id, category_id, dpro_genre, keywords_json, media_json, min_est_spend, min_days, top_n, lp_type, updated_at) VALUES (?, ?, '健康食品', ?, ?, 1000000, 30, 20, 'article_only', ?)",
    args: [condId, gut ?? null, JSON.stringify(["腸活", "乳酸菌"]), JSON.stringify(["meta", "tiktok", "youtube"]), now],
  });
  for (const [name, title, media, dur, spend, days, lpType, tags] of dpro) {
    out.push({
      sql: "INSERT INTO dpro_candidates (id, dpro_ad_id, condition_id, category_id, advertiser, product_name, media, ad_text, duration_sec, est_spend, delivery_days, lp_url, lp_text, lp_type, ai_tags_json, fetched_at) VALUES (?, ?, ?, ?, '[広告主名]', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [ulid(), `dpro-${ulid()}`, condId, gut ?? null, name, media, `${title}（広告文サンプル）`, dur, spend, days, "https://example.com/dpro-lp", `${title}の本文`, lpType, JSON.stringify(tags), now],
    });
  }

  // Approved playbook for 腸活 (S-07 "あわせて渡す知見")
  if (gut) {
    out.push({
      sql: "INSERT INTO playbooks (id, category_id, kind, version_no, status, body_md, evidence_json, drafted_by, approved_by, approved_at, created_at) VALUES (?, ?, 'win', 2, 'approved', ?, '{}', 'ai', ?, ?, ?)",
      args: [ulid(), gut, "- 原因解説を挟む記事は離脱が少ない\n- 冒頭の問いかけと記事FVの悩みを一致させる\n- 初回価格はFVではなくオファーブロックで出す", userId, now, now],
    });
    out.push({
      sql: "INSERT INTO playbooks (id, category_id, kind, version_no, status, body_md, evidence_json, drafted_by, approved_by, approved_at, created_at) VALUES (?, ?, 'avoid', 1, 'approved', ?, '{}', 'ai', ?, ?, ?)",
      args: [ulid(), gut, "- ランキング記事は商品LP直行より成果が低い\n- 効能を断定する表現（薬機法）\n- FVで価格だけを訴求する", userId, now, now],
    });
  }

  out.push({ sql: "INSERT OR REPLACE INTO settings (key, value_json, updated_at) VALUES ('sb_key_expiry', ?, ?)", args: [JSON.stringify({ expiresOn: "2027-10-01" }), now] });
  return out;
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

main().catch((err: unknown) => {
  process.stderr.write(`seed failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
