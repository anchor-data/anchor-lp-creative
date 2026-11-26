"use client";
// STEP4 組み合わせと実績 (Figma 5-4). Judging is manual for now; the auto judgment is shown for reference.
import { useEffect, useState } from "react";
import { JUDGE_LABEL, MEDIA, METRIC_LABEL } from "@/lib/domain/constants";
import type { JudgeBasis, JudgeResult, MetricBasis } from "@/lib/domain/judge";
import { basisSummary, formatMetric, thresholdText } from "@/lib/domain/judge-text";
import { pct, ratio, yen } from "@/lib/format";
import { Button, Field, Input, Select } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";
import type { FormState, ManualJudge } from "../form-state";
import { SectionLabel, toNumber, Toggle, ToggleGroup, type StepProps } from "./shared";
import { SbFillPanel } from "./sb-fill-panel";
import { SB_ALL_CREATIVES, SB_ALL_CREATIVES_LABEL, isAllCreatives } from "@/lib/domain/sb-creative";

interface SbCreativeOption {
  id: string;
  name: string;
  spend: number | null;
  pv: number | null;
}

export interface JudgePreview {
  judge: JudgeResult;
  cpa: number | null;
}

const MANUAL_FIELDS = [
  ["spend", "消化額（円）", true],
  ["cv", "CV数", true],
  ["imp", "表示回数", false],
  ["click", "クリック数", false],
  ["pv", "記事PV", false],
  ["mcv", "商品LPへの遷移数（MCV）", false],
  ["fsver", "FSVER（%）", false],
  ["oar", "OAR（%）", false],
] as const;

const JUDGE_CHOICES: { value: ManualJudge; label: string }[] = [
  { value: "hit", label: "当たり" },
  { value: "fair", label: "まずまず" },
  { value: "miss", label: "外れ" },
  { value: "", label: "未判定" },
];

const BOX_TONE: Record<string, string> = { hit: "border-red", fair: "border-orange", miss: "border-ink" };
const BADGE_TONE: Record<string, string> = { hit: "bg-red text-white", fair: "bg-orange text-ink", miss: "bg-white text-ink border border-ink" };

export function CombinationStep({ state, update, errors, categoryId, categoryName, onPreview }: StepProps & { categoryId: string | null; categoryName: string; onPreview: (p: JudgePreview | null) => void }) {
  const c = state.combination;
  const a = state.article;
  const toast = useToast();
  const [creatives, setCreatives] = useState<SbCreativeOption[]>([]);
  const [metricsVersion, setMetricsVersion] = useState(0);
  const [basis, setBasis] = useState<JudgeBasis | null>(null);
  const set = (patch: Partial<FormState["combination"]>) => update((s) => ({ ...s, combination: { ...s.combination, ...patch } }));
  const setManual = (k: keyof FormState["combination"]["manual"], v: string) => set({ manual: { ...c.manual, [k]: v } });

  const creativesKey = c.metricsSource === "sb" && a.sbPageId && a.sbVersionId ? [a.sbPageId, a.sbVersionId, c.startDate, c.endDate].join("|") : "";
  const [loadedKey, setLoadedKey] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const loadingCreatives = refreshing || (creativesKey !== "" && loadedKey !== creativesKey);

  const fetchCreatives = (refresh: boolean) => {
    const q = new URLSearchParams({ versionId: a.sbVersionId });
    if (c.startDate) q.set("from", c.startDate);
    if (c.endDate) q.set("to", c.endDate);
    if (refresh) q.set("refresh", "1");
    return api<{ items: SbCreativeOption[] }>(`/api/sb/pages/${encodeURIComponent(a.sbPageId)}/creatives?${q}`).then((r) => r.items);
  };
  const applyCreatives = (key: string, items: SbCreativeOption[]) => {
    setCreatives(items);
    setLoadedKey(key);
    setMetricsVersion((n) => n + 1);
  };
  useEffect(() => {
    if (!creativesKey) return;
    let live = true;
    fetchCreatives(false)
      .then((items) => { if (live) applyCreatives(creativesKey, items); })
      .catch((err: unknown) => { if (live) { setLoadedKey(creativesKey); toast.error(errorMessage(err)); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on page, version and period
  }, [creativesKey]);
  const reloadCreatives = async () => {
    if (!creativesKey) return;
    setRefreshing(true);
    try {
      applyCreatives(creativesKey, await fetchCreatives(true));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  };

  // Auto judgment (reference only while judging is manual).
  const manualKey = JSON.stringify(c.manual);
  useEffect(() => {
    if (!c.startDate) return;
    const t = setTimeout(async () => {
      const num = (v: string) => (v.trim() === "" ? undefined : Number(v.replaceAll(",", "")));
      const body =
        c.metricsSource === "sb" && a.sbVersionId && c.sbCreativeId && c.media
          ? { categoryId, startDate: c.startDate, endDate: c.endDate || undefined, sb: { sbVersionId: a.sbVersionId, sbCreativeId: c.sbCreativeId, media: c.media } }
          : c.metricsSource === "manual" && c.manual.spend && c.manual.cv
            ? { categoryId, startDate: c.startDate, endDate: c.endDate || undefined, manual: Object.fromEntries(Object.entries(c.manual).map(([k, v]) => [k, num(v)])) }
            : null;
      if (!body) {
        setBasis(null);
        onPreview(null);
        return;
      }
      try {
        const res = await api<{ basis: JudgeBasis }>("/api/registrations/preview-judge", { method: "POST", json: body });
        setBasis(res.basis);
        const spend = num(c.manual.spend) ?? null;
        const cv = num(c.manual.cv) ?? null;
        onPreview({ judge: res.basis.judge, cpa: res.basis.metrics.find((m) => m.metric === "cpa")?.value ?? (spend !== null && cv ? spend / cv : null) });
      } catch {
        setBasis(null);
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- manual is tracked via manualKey
  }, [c.metricsSource, c.startDate, c.endDate, a.sbVersionId, c.sbCreativeId, c.media, manualKey, categoryId, metricsVersion]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="媒体" required error={errors.media}>
          <Select value={c.media} onChange={(e) => set({ media: e.target.value })} invalid={Boolean(errors.media)}>
            <option value="">選んでください</option>
            {MEDIA.map((md) => <option key={md.code} value={md.code}>{md.label}</option>)}
          </Select>
        </Field>
        <Field label="配信期間" required error={errors.startDate} hint="配信中なら終了日は空欄">
          <div className="flex items-center gap-2">
            <Input type="date" value={c.startDate} onChange={(e) => set({ startDate: e.target.value })} invalid={Boolean(errors.startDate)} aria-label="配信開始日" />
            <span>〜</span>
            <Input type="date" value={c.endDate} onChange={(e) => set({ endDate: e.target.value })} aria-label="配信終了日" />
          </div>
        </Field>
      </div>

      <div className="flex flex-col gap-2.5">
        <SectionLabel>実績の取得方法</SectionLabel>
        <ToggleGroup>
          <Toggle active={c.metricsSource === "sb"} onClick={() => set({ metricsSource: "sb" })}>Squad beyond連携</Toggle>
          <Toggle active={c.metricsSource === "manual"} onClick={() => set({ metricsSource: "manual" })}>手入力</Toggle>
          <Toggle disabled title="CSV取り込みは準備中です">CSVを取り込む（準備中）</Toggle>
        </ToggleGroup>
      </div>

      {c.metricsSource === "sb" ? (
        <SbMetrics state={state} creatives={creatives} loading={loadingCreatives} onReload={() => void reloadCreatives()} basis={basis} errors={errors} onCreative={(id) => set({ sbCreativeId: id })} />
      ) : (
        <>
        {a.sbVersionId ? <SbFillPanel state={state} onFill={(patch) => update((st) => ({ ...st, combination: { ...st.combination, manual: { ...st.combination.manual, ...patch } } }))} /> : null}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {MANUAL_FIELDS.map(([k, label, req]) => (
            <Field key={k} label={label} required={req} error={errors[`manual.${k}`]}>
              <Input value={c.manual[k]} onChange={(e) => setManual(k, e.target.value)} inputMode="decimal" invalid={Boolean(errors[`manual.${k}`])} />
            </Field>
          ))}
        </div>
        </>
      )}

      <JudgeBox state={state} basis={basis} categoryName={categoryName} errors={errors} set={set} />
    </div>
  );
}

interface SbMetricsProps {
  state: FormState;
  creatives: SbCreativeOption[];
  loading: boolean;
  onReload: () => void;
  basis: JudgeBasis | null;
  errors: Record<string, string>;
  onCreative: (id: string) => void;
}

function SbMetrics({ state, creatives, loading, onReload, basis, errors, onCreative }: SbMetricsProps) {
  const c = state.combination;
  const hasPage = Boolean(state.article.sbPageId && state.article.sbVersionId);
  const placeholder = !hasPage
    ? "STEP3でSquad beyondのページとVersionを選んでください"
    : loading ? "配信期間の実績を読み込んでいます…"
      : creatives.length === 0 ? (c.startDate ? "この期間にこのVersionの配信はありません" : "配信開始日を入れると読み込みます") : "選んでください";
  return (
    <div className="flex flex-col gap-3">
      <Field label="クリエイティブ（パラメータ）" required error={errors.sbVersionId ?? errors.sbCreativeId} hint="beyondページ・Versionは STEP3 で選んだもの。配信期間の実績をSquad beyondから読み込みます（消化額の多い順）。「すべてのパラメータ」はVersion全体の合計で登録します">
        <div className="flex gap-2">
          <Select value={c.sbCreativeId} onChange={(e) => onCreative(e.target.value)} disabled={!hasPage || loading}>
            <option value="">{placeholder}</option>
            {hasPage && (creatives.length > 0 || isAllCreatives(c.sbCreativeId)) ? <option value={SB_ALL_CREATIVES}>{SB_ALL_CREATIVES_LABEL}</option> : null}
            {creatives.map((cr) => <option key={cr.id} value={cr.id}>{cr.name}{cr.spend !== null ? `（消化 ${yen(cr.spend)}・PV ${cr.pv ?? 0}）` : ""}</option>)}
          </Select>
          <Button size="sm" onClick={onReload} disabled={!hasPage || loading || !c.startDate} title="Squad beyondから読み込み直す">更新</Button>
        </div>
      </Field>
      {basis && basis.metrics.length > 0 ? (
        <>
          <p className="text-[13px] text-ink-2">Squad beyondから取得した実績　{basis.window.from}〜{basis.window.to}の累計</p>
          <div className="grid gap-2 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            {basis.metrics.map((m) => <MetricTile key={m.metric} m={m} />)}
          </div>
        </>
      ) : null}
    </div>
  );
}

function MetricTile({ m }: { m: MetricBasis }) {
  const note = m.result === "no_data" ? "データなし" : m.hit !== null && m.hit !== undefined ? `目標 ${thresholdText(m, m.hit)}${m.result === "hit" ? " ✓" : ""}` : "基準なし";
  return (
    <div className="border border-line bg-white px-3.5 py-3 min-w-0">
      <p className="text-xs text-ink-3">{METRIC_LABEL[m.metric]}</p>
      <p className="text-xl font-bold mt-0.5 truncate">{formatMetric(m.metric, m.value)}</p>
      <p className="text-[11px] text-ink-3 mt-0.5 truncate">{note}</p>
    </div>
  );
}

function JudgeBox({ state, basis, categoryName, errors, set }: { state: FormState; basis: JudgeBasis | null; categoryName: string; errors: Record<string, string>; set: (patch: Partial<FormState["combination"]>) => void }) {
  const c = state.combination;
  const m = c.manual;
  const spend = toNumber(m.spend);
  const cv = toNumber(m.cv);
  const cpa = spend !== null && cv ? spend / cv : null;
  const target = toNumber(c.targetCpa);
  const judge = c.judge;
  return (
    <div className={`border-2 px-4 py-4 flex flex-col gap-4 ${judge ? BOX_TONE[judge] : "border-line-2"}`}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className={`px-3 py-1.5 text-base font-bold ${judge ? BADGE_TONE[judge] : "bg-canvas text-ink-3"}`}>判定：{judge ? JUDGE_LABEL[judge] : "未判定"}</span>
        <span className="text-[13px] text-ink-2 flex-1 min-w-60">
          {c.metricsSource === "manual" && spend !== null ? `CPA ${yen(cpa)}${target ? `（目標 ${yen(target)}・${cpa !== null && cpa <= target ? "目標内" : "目標超え"}）` : ""} ／ CVR ${pct(ratio(cv, toNumber(m.click)))} ／ CTR ${pct(ratio(toNumber(m.click), toNumber(m.imp)))} ／ 遷移率 ${pct(ratio(toNumber(m.mcv), toNumber(m.pv)))}` : "実績と目標CPAを見て、判定を選んでください。"}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-ink-3">判定（手動）</p>
        <ToggleGroup>
          {JUDGE_CHOICES.map((o) => (
            <Toggle key={o.label} active={judge === o.value} onClick={() => set({ judge: o.value })}>{o.label}</Toggle>
          ))}
        </ToggleGroup>
      </div>
      <div className="grid gap-3 md:grid-cols-[14rem_1fr]">
        <Field label="目標CPA（円・任意）" error={errors.targetCpa}>
          <Input value={c.targetCpa} onChange={(e) => set({ targetCpa: e.target.value })} inputMode="numeric" placeholder="3500" invalid={Boolean(errors.targetCpa)} />
        </Field>
        <Field label="判定の理由（任意）" error={errors["override.reason"]} hint="詳細画面の判定バッジに表示します">
          <Input value={c.judgeReason} maxLength={500} onChange={(e) => set({ judgeReason: e.target.value })} placeholder="CPA目標内・消化額基準クリア" disabled={!judge} invalid={Boolean(errors["override.reason"])} />
        </Field>
      </div>
      <p className="text-xs text-ink-4">
        自動判定（参考）：{basis ? `${JUDGE_LABEL[basis.judge]} — ${categoryName ? `${categoryName}の基準。` : ""}${basisSummary(basis)}` : "実績を入力すると表示します"}
      </p>
    </div>
  );
}
