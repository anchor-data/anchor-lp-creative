import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { InStatement } from "@libsql/client";
import { ulid } from "ulid";
import { getRawClient } from "../db/client";
import { getEnv } from "../env";
import { ApiError, forbidden, notFound } from "../http";
import type { CurrentUser } from "../auth";
import { claude, extractJson, material, MATERIAL_RULE } from "./ai";
import { logAiUsage } from "./ai-usage";
import { latestPlaybooks, type PlaybookRef } from "./recommendations";
import { loadNgDictionary } from "./combination-detail";
import { checkExpressions } from "@/lib/domain/expressions";
import { bigramSimilarity } from "@/lib/domain/text-sim";
import { ARTICLE_BLOCK_TYPES, mediaLabel } from "@/lib/domain/constants";
import { planSchema, PART_LABEL, type GenOptions, type Plan, type ProductInput, type RegenerateTarget } from "@/lib/domain/plan";

export const PROMPT_VERSION = "gen-v1";
const SIMILARITY_WARN = 0.9; // spec 9-3 step 4 【仮】
const RATE_PER_MIN = 5;
const RATE_PER_DAY = 100;

export type GenEvent =
  | { event: "meta"; data: { generationId: string; axes: string[] } }
  | { event: "plan-start"; data: { index: number; axis: string } }
  | { event: "plan-delta"; data: { index: number; text: string } }
  | { event: "plan-done"; data: { index: number; plan: Plan } }
  | { event: "plan-error"; data: { index: number; message: string } }
  | { event: "done"; data: { generationId: string; versionId: string; versionNo: number } };

interface RefCase {
  id: string;
  origin: "own" | "market";
  judge: string | null;
  media: string;
  tags: string;
  mainCopy: string;
  script: string;
  articleTitle: string;
  blocks: string;
  body: string;
  memos: string;
  cpa: number | null;
}

/** 生成は1人1分あたり5回、1日100回まで (spec ch.11). Counted in api_usage. */
export async function checkRateLimit(userId: string): Promise<void> {
  const client = getRawClient();
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const minute = now.toISOString().slice(11, 16);
  const provider = `gen:${userId}`;
  const res = await client.execute({
    sql: "SELECT SUM(count) day, SUM(CASE WHEN minute = ? THEN count END) min FROM api_usage WHERE provider = ? AND date = ?",
    args: [minute, provider, date],
  });
  const day = Number(res.rows[0]?.day ?? 0);
  const min = Number(res.rows[0]?.min ?? 0);
  if (min >= RATE_PER_MIN || day >= RATE_PER_DAY) {
    throw new ApiError("RATE_LIMITED", min >= RATE_PER_MIN ? "生成の回数が多すぎます。1分ほど待ってから再度お試しください" : "本日の生成回数の上限に達しました");
  }
  await client.execute({
    sql: "INSERT INTO api_usage (provider, date, minute, count) VALUES (?, ?, ?, 1) ON CONFLICT (provider, date, minute) DO UPDATE SET count = count + 1",
    args: [provider, date, minute],
  });
}

async function loadRefs(ids: readonly string[]): Promise<RefCase[]> {
  if (ids.length === 0) return [];
  const res = await getRawClient().execute({
    sql: `SELECT c.id, c.origin, c.media, COALESCE(c.judge_manual, c.judge_auto) judge, cr.main_copy, cr.script_json,
                 a.title, a.blocks_json, SUBSTR(a.body_text, 1, 1500) body,
                 (SELECT GROUP_CONCAT(t.name, '・') FROM tags t WHERE t.id IN (SELECT tag_id FROM creative_tags WHERE creative_id = c.creative_id UNION SELECT tag_id FROM article_tags WHERE article_id = c.article_id)) tags,
                 (SELECT GROUP_CONCAT(body, ' / ') FROM memos WHERE combination_id = c.id) memos,
                 (SELECT SUM(spend) * 1.0 / NULLIF(SUM(cv), 0) FROM sb_metrics_keyed s WHERE s.sb_version_id = c.sb_version_id AND s.sb_creative_id = c.sb_creative_id AND s.media = c.media) sb_cpa,
                 (SELECT SUM(spend) * 1.0 / NULLIF(SUM(cv), 0) FROM manual_metrics WHERE combination_id = c.id) mm_cpa
          FROM combinations c JOIN creatives cr ON cr.id = c.creative_id JOIN articles a ON a.id = c.article_id
          WHERE c.deleted_at IS NULL AND c.id IN (${ids.map(() => "?").join(",")})`,
    args: [...ids],
  });
  return res.rows.map((r) => ({
    id: String(r.id),
    origin: r.origin as "own" | "market",
    judge: r.judge ? String(r.judge) : null,
    media: mediaLabel(String(r.media)),
    tags: String(r.tags ?? ""),
    mainCopy: String(r.main_copy ?? ""),
    script: r.script_json ? (JSON.parse(String(r.script_json)) as { from: number; to: number; narration?: string }[]).map((s) => `${s.from}-${s.to}秒: ${s.narration ?? ""}`).join("\n") : "",
    articleTitle: String(r.title ?? ""),
    blocks: r.blocks_json ? (JSON.parse(String(r.blocks_json)) as { type: string; heading: string }[]).map((b) => `${b.type}:${b.heading}`).join(" → ") : "",
    body: String(r.body ?? ""),
    memos: String(r.memos ?? ""),
    cpa: r.sb_cpa !== null ? Number(r.sb_cpa) : r.mm_cpa !== null ? Number(r.mm_cpa) : null,
  }));
}

function systemPrompt(): string {
  const blockTypes = ARTICLE_BLOCK_TYPES.map((b) => `${b.code}=${b.label}`).join(", ");
  return [
    "あなたは広告クリエイティブ（バナー・動画）と記事LPをセットで企画する制作ディレクターです。",
    "- クリエイティブの訴求と記事LPのファーストビューを必ず一致させてください。",
    "- 参照事例からは訴求軸・構成・フックの「型」だけを学び、他社商材のコピーや固有の表現をそのまま使わないでください。",
    "- 「使えない表現」に挙げられた表現と、効能を断定する表現（薬機法・景品表示法に触れるもの）は使わないでください。",
    `- 記事の構成ブロックのtypeは次のコードを使います: ${blockTypes}`,
    `- ${MATERIAL_RULE}`,
    "- 出力は指定されたJSONオブジェクト1つだけにしてください。説明文やコードブロックは付けないでください。",
  ].join("\n");
}

function contextBlock(p: ProductInput, refs: readonly RefCase[], playbooks: { win: PlaybookRef | null; avoid: PlaybookRef | null }): string {
  const refText = refs
    .map((r) =>
      [
        `### 参照事例 id=${r.id}（${r.origin === "own" ? "自社実績" : "市場事例・推定値"}／判定:${r.judge ?? "当たり推定"}／${r.media}${r.cpa ? `／CPA ¥${Math.round(r.cpa)}` : ""}）`,
        `タグ: ${r.tags}`,
        material("メインコピー", r.mainCopy, 300),
        material("台本", r.script, 800),
        `記事タイトル: ${r.articleTitle}`,
        `記事の構成: ${r.blocks}`,
        material("記事本文の要点", r.body, 1500),
        r.memos ? `勝因メモ: ${r.memos}` : "",
      ].filter(Boolean).join("\n"),
    )
    .join("\n\n");
  return [
    "## 商材情報",
    `商材名: ${p.name}`,
    `ターゲット: ${p.target}`,
    `強み（USP）: ${p.usp}`,
    `価格・オファー: ${p.offer || "（なし）"}`,
    `使えない表現: ${p.ngWords || "（なし）"}`,
    p.referenceText ? material("参考資料", p.referenceText, 6000) : "",
    "",
    "## 参照事例",
    refText || "（なし）",
    "",
    "## 知見",
    playbooks.win ? `### 勝ちパターン集（${playbooks.win.categoryName} 第${playbooks.win.versionNo}版・承認済み）\n${playbooks.win.bodyMd}` : "（勝ちパターン集なし）",
    playbooks.avoid ? `### 避けるパターン（${playbooks.avoid.categoryName}）\n${playbooks.avoid.bodyMd}` : "",
  ].join("\n");
}

function outputShape(o: GenOptions): string {
  const banner = o.kind !== "video" ? `"banner": {"mainCopies": ["…", "…", "…"], "subCopy": "…", "composition": "人物・商品・文字の配置の指示"},` : "";
  const video = o.kind !== "banner" ? `"video": {"durationSec": ${o.durationSec}, "hooks": ["…", "…"], "scenes": [{"from": 0, "to": 3, "visual": "…", "telop": "…", "narration": "…"}]},` : "";
  return `{"axis": "…", ${banner} ${video} "article": {"title": "…", "firstView": "…", "blocks": [{"type": "pain", "heading": "…", "body": "…"}], "cta": "…"}, "rationale": {"aim": "…", "hypothesis": "…", "inherited": [{"combinationId": "参照事例のid", "element": "引き継いだ要素"}], "playbookItemsUsed": ["…"]}}`;
}

async function decideAxes(base: string, count: number): Promise<string[]> {
  const env = getEnv();
  const msg = await claude().messages.create({
    model: env.CLAUDE_MODEL_MAIN,
    max_tokens: 2000,
    output_config: { effort: "low" },
    system: systemPrompt(),
    messages: [{ role: "user", content: `${base}\n\n## 指示\n商材情報・参照事例・勝ちパターン集をふまえ、互いに異なる訴求軸を${count}個提案してください。{"axes": ["…"]} だけを出力してください。` }],
  });
  logAiUsage("generation-axes", msg);
  if (msg.stop_reason === "refusal") throw new ApiError("UPSTREAM_ERROR", "AIが訴求軸を提案できませんでした。入力内容を見直してください");
  const parsed = extractJson(msg.content.map((b) => (b.type === "text" ? b.text : "")).join("")) as { axes?: unknown };
  const axes = Array.isArray(parsed.axes) ? parsed.axes.map(String).filter(Boolean) : [];
  if (axes.length === 0) throw new ApiError("UPSTREAM_ERROR", "訴求軸の提案を解釈できませんでした");
  return axes.slice(0, count);
}

interface StreamResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

/** One streamed plan. Server-side refusal fallbacks (beta, "default" routing) retry a declined request on another model. */
async function streamPlan(base: string, instruction: string, onDelta: (text: string) => void): Promise<StreamResult> {
  const env = getEnv();
  const stream = claude().beta.messages.stream({
    model: env.CLAUDE_MODEL_MAIN,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: systemPrompt(),
    messages: [{ role: "user", content: `${base}\n\n## 指示\n${instruction}` }],
  });
  stream.on("text", onDelta);
  const final = await stream.finalMessage();
  logAiUsage("generation-plan", final);
  if (final.stop_reason === "refusal") throw new ApiError("UPSTREAM_ERROR", "AIがこの案を作成できませんでした");
  if (final.stop_reason === "max_tokens") throw new ApiError("UPSTREAM_ERROR", "案が長すぎて途中で切れました。もう一度お試しください");
  return {
    text: final.content.map((b) => (b.type === "text" ? b.text : "")).join(""),
    inputTokens: final.usage.input_tokens,
    outputTokens: final.usage.output_tokens,
    model: final.model,
  };
}

/** Spec 9-3 step 3: JSON shape and referenced ids must be valid. */
function validatePlan(text: string, refIds: ReadonlySet<string>, o: GenOptions): Plan {
  const parsed = planSchema.parse(extractJson(text));
  const plan: Plan = {
    ...parsed,
    banner: o.kind === "video" ? undefined : parsed.banner,
    video: o.kind === "banner" ? undefined : parsed.video,
  };
  if (o.kind !== "video" && !plan.banner) throw new Error("banner missing");
  if (o.kind !== "banner" && !plan.video) throw new Error("video missing");
  const bad = plan.rationale.inherited.filter((i) => !refIds.has(i.combinationId));
  if (bad.length > 0) throw new Error(`unknown reference ids: ${bad.map((b) => b.combinationId).join(",")}`);
  return plan;
}

/** Spec 9-3 steps 4–5: similarity to referenced market copy, and NG dictionary. */
function addChecks(plan: Plan, refs: readonly RefCase[], dict: Awaited<ReturnType<typeof loadNgDictionary>>, ngWords: string): Plan {
  const generated = [...(plan.banner?.mainCopies ?? []), plan.banner?.subCopy ?? "", ...(plan.video?.hooks ?? []), plan.article.title, plan.article.firstView].filter(Boolean);
  const similarity = generated.flatMap((text) =>
    refs
      .filter((r) => r.origin === "market")
      .flatMap((r) => [r.mainCopy, r.articleTitle].map((src) => ({ text, combinationId: r.id, score: bigramSimilarity(text, src) })))
      .filter((s) => s.score >= SIMILARITY_WARN),
  );
  const userNg = ngWords
    .split(/[、,\n「」]/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2)
    .map((phrase) => ({ phrase, matchType: "contains" as const, law: "使えない表現（入力）", alternative: null, severity: "ng" as const }));
  const fields: Record<string, string> = {
    バナー: [...(plan.banner?.mainCopies ?? []), plan.banner?.subCopy ?? ""].join("\n"),
    動画: (plan.video?.scenes ?? []).map((s) => `${s.telop} ${s.narration}`).join("\n") + (plan.video?.hooks ?? []).join("\n"),
    記事: [plan.article.title, plan.article.firstView, ...plan.article.blocks.map((b) => `${b.heading} ${b.body}`), plan.article.cta].join("\n"),
  };
  const expression = checkExpressions(fields, [...dict, ...userNg]).map((h) => ({ text: h.text, law: h.law, alternative: h.alternative, severity: h.severity }));
  return { ...plan, checks: { expression, similarity } };
}

export interface GenerateRequest {
  product: ProductInput;
  options: GenOptions;
  refIds: string[];
  autoRefIds: string[];
}

/** POST /api/generations — emits SSE events; persists the generation and version 1. */
export async function generate(user: CurrentUser, req: GenerateRequest, emit: (e: GenEvent) => void): Promise<void> {
  const refs = await loadRefs(req.refIds);
  if (refs.length === 0) throw new ApiError("VALIDATION_ERROR", "参照する事例を1件以上選んでください");
  const playbooks = await latestPlaybooks(req.product.categoryId);
  const dict = await loadNgDictionary(req.product.categoryId);
  const base = contextBlock(req.product, refs, playbooks);
  const refIdSet = new Set(refs.map((r) => r.id));

  const generationId = ulid();
  const axes = await decideAxes(base, req.options.count);
  emit({ event: "meta", data: { generationId, axes } });

  let usage = { input: 0, output: 0 };
  let model = getEnv().CLAUDE_MODEL_MAIN;
  const kindText = req.options.kind === "both" ? "バナー案と動画案の両方" : req.options.kind === "banner" ? "バナー案のみ（videoは省く）" : "動画案のみ（bannerは省く）";

  const plans = await Promise.all(
    axes.map(async (axis, index): Promise<Plan | null> => {
      emit({ event: "plan-start", data: { index, axis } });
      const instruction = `訴求軸「${axis}」で、${kindText}と記事LP案をセットで1案作ってください。動画の尺は${req.options.durationSec}秒${req.options.tone ? `、トンマナは「${req.options.tone}」` : ""}です。次の形のJSONだけを出力してください:\n${outputShape(req.options)}`;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await streamPlan(base, attempt === 0 ? instruction : `${instruction}\n\n前回の出力は形式が正しくありませんでした。指定のJSONの形に厳密に合わせてください。inheritedのcombinationIdは参照事例のidだけを使ってください。`, (text) => emit({ event: "plan-delta", data: { index, text } }));
          usage = { input: usage.input + result.inputTokens, output: usage.output + result.outputTokens };
          model = result.model;
          const plan = addChecks(validatePlan(result.text, refIdSet, req.options), refs, dict, req.product.ngWords);
          emit({ event: "plan-done", data: { index, plan } });
          return plan;
        } catch (err) {
          if (attempt === 1 || err instanceof ApiError || err instanceof Anthropic.APIError) {
            emit({ event: "plan-error", data: { index, message: err instanceof ApiError ? err.message : "この案の作成に失敗しました。「もう一度作る」でやり直せます" } });
            return null;
          }
        }
      }
      return null;
    }),
  );

  const now = new Date().toISOString();
  const versionId = ulid();
  const autoSet = new Set(req.autoRefIds);
  const statements: InStatement[] = [
    {
      sql: "INSERT INTO generations (id, product_id, input_json, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [generationId, req.product.productId ?? null, JSON.stringify({ product: req.product, options: req.options, axes }), user.id, now],
    },
    {
      sql: `INSERT INTO generation_versions (id, generation_id, version_no, plans_json, win_playbook_id, avoid_playbook_id, model, prompt_version, input_tokens, output_tokens, created_by, created_at)
            VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [versionId, generationId, JSON.stringify(plans), playbooks.win?.id ?? null, playbooks.avoid?.id ?? null, model, PROMPT_VERSION, usage.input, usage.output, user.id, now],
    },
    ...req.refIds.filter((id) => refIdSet.has(id)).map((id, rank) => ({
      sql: "INSERT INTO generation_refs (generation_version_id, combination_id, rank, score, picked_by) VALUES (?, ?, ?, NULL, ?)",
      args: [versionId, id, rank + 1, autoSet.has(id) ? "auto" : "user"],
    })),
  ];
  await getRawClient().batch(statements, "write");
  emit({ event: "done", data: { generationId, versionId, versionNo: 1 } });
}

export interface GenerationView {
  id: string;
  createdBy: string;
  createdAt: string;
  input: { product: ProductInput; options: GenOptions; axes: string[] };
  versions: { id: string; versionNo: number; plans: (Plan | null)[]; model: string | null; createdAt: string; inputTokens: number | null; outputTokens: number | null }[];
  refs: { combinationId: string; title: string; origin: string }[];
  linkedCombinations: { id: string; judge: string | null }[];
}

export async function getGeneration(user: CurrentUser, id: string): Promise<GenerationView> {
  const client = getRawClient();
  const g = (await client.execute({ sql: "SELECT * FROM generations WHERE id = ?", args: [id] })).rows[0];
  if (!g) throw notFound("生成案");
  if (String(g.created_by) !== user.id && user.role !== "admin") throw forbidden();
  const [versions, refs, linked] = await Promise.all([
    client.execute({ sql: "SELECT * FROM generation_versions WHERE generation_id = ? ORDER BY version_no", args: [id] }),
    client.execute({
      sql: `SELECT DISTINCT r.combination_id, p.name, a.title, c.origin FROM generation_refs r JOIN generation_versions v ON v.id = r.generation_version_id
            JOIN combinations c ON c.id = r.combination_id JOIN products p ON p.id = c.product_id JOIN articles a ON a.id = c.article_id
            WHERE v.generation_id = ? AND v.version_no = 1 ORDER BY r.rank`,
      args: [id],
    }),
    client.execute({
      sql: "SELECT c.id, COALESCE(c.judge_manual, c.judge_auto) judge FROM combinations c JOIN generation_versions v ON v.id = c.generation_version_id WHERE v.generation_id = ? AND c.deleted_at IS NULL",
      args: [id],
    }),
  ]);
  return {
    id,
    createdBy: String(g.created_by),
    createdAt: String(g.created_at),
    input: JSON.parse(String(g.input_json)),
    versions: versions.rows.map((v) => ({
      id: String(v.id), versionNo: Number(v.version_no), plans: JSON.parse(String(v.plans_json)), model: v.model ? String(v.model) : null,
      createdAt: String(v.created_at), inputTokens: v.input_tokens === null ? null : Number(v.input_tokens), outputTokens: v.output_tokens === null ? null : Number(v.output_tokens),
    })),
    refs: refs.rows.map((r) => ({ combinationId: String(r.combination_id), title: `${String(r.name)} × 記事「${String(r.title ?? "")}」`, origin: String(r.origin) })),
    linkedCombinations: linked.rows.map((r) => ({ id: String(r.id), judge: r.judge ? String(r.judge) : null })),
  };
}

export async function listGenerations(user: CurrentUser): Promise<{ id: string; productName: string; createdAt: string; versions: number; axes: string[]; linked: number }[]> {
  const res = await getRawClient().execute({
    sql: `SELECT g.id, g.input_json, g.created_at, (SELECT COUNT(*) FROM generation_versions v WHERE v.generation_id = g.id) versions,
                 (SELECT COUNT(*) FROM combinations c JOIN generation_versions v ON v.id = c.generation_version_id WHERE v.generation_id = g.id AND c.deleted_at IS NULL) linked
          FROM generations g WHERE g.created_by = ? ORDER BY g.created_at DESC LIMIT 200`,
    args: [user.id],
  });
  return res.rows.map((r) => {
    const input = JSON.parse(String(r.input_json)) as { product: ProductInput; axes?: string[] };
    return { id: String(r.id), productName: input.product.name, createdAt: String(r.created_at), versions: Number(r.versions), axes: input.axes ?? [], linked: Number(r.linked) };
  });
}

async function latestVersion(generationId: string) {
  const v = (await getRawClient().execute({ sql: "SELECT * FROM generation_versions WHERE generation_id = ? ORDER BY version_no DESC LIMIT 1", args: [generationId] })).rows[0];
  if (!v) throw notFound("生成案");
  return { id: String(v.id), versionNo: Number(v.version_no), plans: JSON.parse(String(v.plans_json)) as (Plan | null)[], winPlaybookId: v.win_playbook_id, avoidPlaybookId: v.avoid_playbook_id };
}

async function saveVersion(user: CurrentUser, generationId: string, plans: (Plan | null)[], meta: { model?: string; inputTokens?: number; outputTokens?: number }): Promise<{ versionId: string; versionNo: number }> {
  const prev = await latestVersion(generationId);
  const versionId = ulid();
  const versionNo = prev.versionNo + 1;
  const client = getRawClient();
  await client.batch(
    [
      {
        sql: `INSERT INTO generation_versions (id, generation_id, version_no, plans_json, win_playbook_id, avoid_playbook_id, model, prompt_version, input_tokens, output_tokens, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [versionId, generationId, versionNo, JSON.stringify(plans), prev.winPlaybookId ?? null, prev.avoidPlaybookId ?? null, meta.model ?? null, PROMPT_VERSION, meta.inputTokens ?? null, meta.outputTokens ?? null, user.id, new Date().toISOString()],
      },
      // Carry the reference log forward so every version records what it was based on (F-50).
      { sql: "INSERT INTO generation_refs (generation_version_id, combination_id, rank, score, picked_by) SELECT ?, combination_id, rank, score, picked_by FROM generation_refs WHERE generation_version_id = ?", args: [versionId, prev.id] },
    ],
    "write",
  );
  return { versionId, versionNo };
}

async function ownGeneration(user: CurrentUser, id: string): Promise<GenerationView> {
  const g = await getGeneration(user, id);
  if (g.createdBy !== user.id) throw forbidden();
  return g;
}

/** POST /api/generations/:id/versions — manual edit saved as a new version. */
export async function saveEditedVersion(user: CurrentUser, id: string, plans: (Plan | null)[]): Promise<{ versionId: string; versionNo: number }> {
  const g = await ownGeneration(user, id);
  const refs = await loadRefs(g.refs.map((r) => r.combinationId));
  const dict = await loadNgDictionary(g.input.product.categoryId);
  const checked = plans.map((p) => (p ? addChecks(planSchema.parse(p), refs, dict, g.input.product.ngWords) : null));
  return saveVersion(user, id, checked, {});
}

/** POST /api/generations/:id/regenerate — regenerate one part (or a failed plan) and save a new version. */
export async function regenerate(user: CurrentUser, id: string, planIndex: number, target: RegenerateTarget | { kind: "whole" }, emit: (e: GenEvent) => void): Promise<void> {
  const g = await ownGeneration(user, id);
  const prev = await latestVersion(id);
  if (planIndex < 0 || planIndex >= Math.max(prev.plans.length, g.input.axes.length)) throw new ApiError("VALIDATION_ERROR", "案の番号が正しくありません");
  const refs = await loadRefs(g.refs.map((r) => r.combinationId));
  const playbooks = await latestPlaybooks(g.input.product.categoryId);
  const dict = await loadNgDictionary(g.input.product.categoryId);
  const base = contextBlock(g.input.product, refs, playbooks);
  const current = prev.plans[planIndex];
  const axis = current?.axis ?? g.input.axes[planIndex] ?? "";

  let instruction: string;
  if (target.kind === "whole" || !current) {
    instruction = `訴求軸「${axis}」で、記事LP案を含むセットを1案作ってください。動画の尺は${g.input.options.durationSec}秒です。次の形のJSONだけを出力してください:\n${outputShape(g.input.options)}`;
  } else {
    const part = target.kind === "block" ? `${PART_LABEL.block}（blocksの${target.index + 1}番目）` : PART_LABEL[target.kind];
    instruction = `次の案のうち「${part}」だけを作り直し、それ以外は変えずに、案全体を同じ形のJSONで出力してください。\n現在の案:\n${JSON.stringify(current)}`;
  }

  emit({ event: "plan-start", data: { index: planIndex, axis } });
  try {
    const result = await streamPlan(base, instruction, (text) => emit({ event: "plan-delta", data: { index: planIndex, text } }));
    const plan = addChecks(validatePlan(result.text, new Set(refs.map((r) => r.id)), g.input.options), refs, dict, g.input.product.ngWords);
    const plans = Array.from({ length: Math.max(prev.plans.length, planIndex + 1) }, (_, i) => (i === planIndex ? plan : (prev.plans[i] ?? null)));
    emit({ event: "plan-done", data: { index: planIndex, plan } });
    const saved = await saveVersion(user, id, plans, { model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens });
    emit({ event: "done", data: { generationId: id, ...saved } });
  } catch (err) {
    emit({ event: "plan-error", data: { index: planIndex, message: err instanceof ApiError ? err.message : "作り直しに失敗しました。もう一度お試しください" } });
  }
}

/** POST /api/generations/:id/link — 「この案で配信した」 (editor+). */
export async function linkCombination(user: CurrentUser, id: string, combinationId: string): Promise<void> {
  const g = await getGeneration(user, id);
  const versionId = g.versions.at(-1)?.id;
  if (!versionId) throw notFound("生成案");
  const client = getRawClient();
  const c = (await client.execute({ sql: "SELECT id, generation_version_id FROM combinations WHERE id = ? AND deleted_at IS NULL", args: [combinationId] })).rows[0];
  if (!c) throw notFound("組み合わせ");
  const now = new Date().toISOString();
  await client.batch(
    [
      { sql: "UPDATE combinations SET generation_version_id = ?, updated_at = ? WHERE id = ?", args: [versionId, now, combinationId] },
      { sql: "INSERT INTO audit_logs (id, at, user_id, action, target_type, target_id, before_json, after_json) VALUES (?, ?, ?, 'update', 'combination', ?, ?, ?)", args: [ulid(), now, user.id, combinationId, JSON.stringify({ generationVersionId: c.generation_version_id }), JSON.stringify({ generationVersionId: versionId })] },
    ],
    "write",
  );
}

/** 制作指示書 (F-37) as Markdown. PDF is produced from the print view in the browser. */
export function toMarkdown(g: GenerationView, versionNo?: number): string {
  const v = g.versions.find((x) => x.versionNo === versionNo) ?? g.versions.at(-1);
  if (!v) return "";
  const p = g.input.product;
  const lines: string[] = [
    `# 制作指示書：${p.name}`,
    "",
    `- 版：第${v.versionNo}版（${v.createdAt.slice(0, 10)}）`,
    `- ターゲット：${p.target}`,
    `- 強み：${p.usp}`,
    `- 価格・オファー：${p.offer || "—"}`,
    `- 使えない表現：${p.ngWords || "—"}`,
    "",
    "> 表現チェックは補助です。最終判断は人が行ってください。",
    "",
  ];
  v.plans.forEach((plan, i) => {
    if (!plan) return;
    lines.push(`## 案${i + 1}：${plan.axis}`, "");
    if (plan.banner) {
      lines.push("### バナー案", ...plan.banner.mainCopies.map((c) => `- ${c}`), `- サブコピー：${plan.banner.subCopy}`, `- 構図：${plan.banner.composition}`, "");
    }
    if (plan.video) {
      lines.push(`### 動画案（${plan.video.durationSec}秒）`, `フック案：${plan.video.hooks.join(" ／ ")}`, "", "| 秒数 | 映像 | テロップ | ナレーション |", "|---|---|---|---|");
      for (const s of plan.video.scenes) lines.push(`| ${s.from}〜${s.to}秒 | ${s.visual} | ${s.telop} | ${s.narration} |`);
      lines.push("");
    }
    lines.push("### 記事LP案", `**タイトル**：${plan.article.title}`, "", `**ファーストビュー**：${plan.article.firstView}`, "");
    plan.article.blocks.forEach((b, j) => lines.push(`${j + 1}. **${b.heading}**（${b.type}）`, `   ${b.body.replaceAll("\n", "\n   ")}`));
    lines.push("", `**CTA**：${plan.article.cta}`, "", "### セットの説明", `- 狙い：${plan.rationale.aim}`, `- 仮説：${plan.rationale.hypothesis}`);
    for (const inh of plan.rationale.inherited) lines.push(`- 参考：${g.refs.find((r) => r.combinationId === inh.combinationId)?.title ?? inh.combinationId}（${inh.element}）`);
    if (plan.checks.expression.length > 0) {
      lines.push("", "### 表現チェック", ...plan.checks.expression.map((e) => `- ${e.severity === "ng" ? "使用不可" : "要確認"}：「${e.text}」${e.law ? `（${e.law}）` : ""}${e.alternative ? ` → 言い換え案：${e.alternative}` : ""}`));
    }
    lines.push("");
  });
  return lines.join("\n");
}
