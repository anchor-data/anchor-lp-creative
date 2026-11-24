"use client";
// STEP4「手入力」with a linked Squad beyond Version: fills the figures from the Version's totals for the
// delivery period (same numbers as the 事例一括登録シート). Runs once on its own while the fields are empty.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";
import { yen } from "@/lib/format";
import type { FormState } from "../form-state";

interface VersionTotals {
  spend: number | null;
  pv: number | null;
  mcv: number | null;
  cv: number | null;
  fsver: number | null;
  oar: number | null;
  days: number;
  start: string;
  end: string;
}

type Manual = FormState["combination"]["manual"];

const str = (v: number | null): string => (v === null ? "" : String(Math.round(v * 100) / 100));

/** Manual fields from Version totals; ad impressions and clicks are not in Squad beyond's version summary. */
export function manualFromTotals(t: VersionTotals): Partial<Manual> {
  return { spend: str(t.spend), pv: str(t.pv), mcv: str(t.mcv), cv: str(t.cv), fsver: str(t.fsver), oar: str(t.oar) };
}

interface SbFillPanelProps {
  state: FormState;
  onFill: (patch: Partial<Manual>) => void;
}

export function SbFillPanel({ state, onFill }: SbFillPanelProps) {
  const a = state.article;
  const c = state.combination;
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [filled, setFilled] = useState<VersionTotals | null>(null);
  const autoKey = useRef("");

  const fetchTotals = () => {
    const q = new URLSearchParams({ from: c.startDate });
    if (c.endDate) q.set("to", c.endDate);
    return api<VersionTotals>(`/api/sb/versions/${encodeURIComponent(a.sbVersionId)}/totals?${q}`);
  };
  const apply = (t: VersionTotals) => {
    if (t.spend === null && t.pv === null) {
      toast.error("この期間にこのVersionの配信実績がSquad beyondにありません");
      return;
    }
    onFill(manualFromTotals(t));
    setFilled(t);
  };

  const fill = async () => {
    setLoading(true);
    try {
      apply(await fetchTotals());
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // First time a period is set with empty fields: fill without asking.
  const empty = Object.values(c.manual).every((v) => !v.trim());
  const key = a.sbVersionId && c.startDate ? `${a.sbVersionId}|${c.startDate}|${c.endDate}` : "";
  useEffect(() => {
    if (!key || !empty || autoKey.current === key) return;
    autoKey.current = key;
    let live = true;
    fetchTotals().then((t) => { if (live) apply(t); }).catch(() => undefined);
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on version and period
  }, [key]);

  return (
    <div className="border border-ink bg-canvas px-4 py-3 text-sm flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-bold">Squad beyondの実績：</span>
          {a.sbPageName} ／ {a.sbVersionName || a.sbVersionId}
        </span>
        <Button size="xs" onClick={() => void fill()} disabled={loading || !c.startDate}>
          {loading ? "取得しています…" : filled ? "取り直す" : "実績を入れる"}
        </Button>
      </div>
      <p className="text-xs text-ink-3">
        {!c.startDate
          ? "配信開始日を入れると、Versionの実績（消化額・PV・MCV・CV・FSVER・OAR）を入れます。"
          : filled
            ? `${filled.start}〜${filled.end}（${filled.days}日）のVersion全体の合計を入れました：消化 ${yen(filled.spend)}・CV ${filled.cv ?? 0}。表示回数・クリック数は媒体の数字なので手で入れてください。`
            : "Versionの配信期間の合計を手入力の欄に入れます。入れた後も修正できます。"}
      </p>
    </div>
  );
}
