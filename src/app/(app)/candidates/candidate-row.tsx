"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SbCandidate } from "@/server/services/candidates";
import { DISMISS_REASONS, METRIC_LABEL } from "@/lib/domain/constants";
import { formatMetric } from "@/lib/domain/judge-text";
import { date } from "@/lib/format";
import { Button, JudgeBadge, LinkButton, MediaBadge, Select } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";

export function CandidateRow({ c }: { c: SbCandidate }) {
  const router = useRouter();
  const toast = useToast();
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState<string>(DISMISS_REASONS[0]);
  const [busy, setBusy] = useState(false);

  const call = async (path: string, json?: unknown) => {
    setBusy(true);
    try {
      await api(path, { method: "POST", json: json ?? {} });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white border border-line p-4 flex flex-col lg:flex-row gap-4 lg:items-center">
      <div className="w-[60px] h-[90px] shrink-0 bg-thumb-2 border border-dashed border-line-2 hidden sm:flex items-end justify-center text-[10px] text-ink-3 pb-1">記事LP</div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          <JudgeBadge judge={c.judge} />
          <MediaBadge media={c.media} />
        </div>
        <p className="font-bold">{c.pageName ?? "（beyondページ未同期）"}</p>
        <p className="text-sm text-ink-3">
          Version：{c.versionName ?? c.id}　｜　クリエイティブ：{c.creativeName ?? "—"}　｜　候補になった日：{date(c.firstSeenAt)}
        </p>
        {c.dismissReason ? <p className="text-xs text-ink-3 mt-1">対象外の理由：{c.dismissReason}</p> : null}
      </div>
      <dl className="grid grid-cols-3 lg:grid-cols-6 gap-x-5 gap-y-1 text-sm shrink-0">
        {(["spend", "cpa", "mcvr", "cv", "fsver", "oar"] as const).map((m) => {
          const result = c.basis.metrics.find((x) => x.metric === m)?.result;
          return (
            <div key={m}>
              <dt className="text-xs text-ink-3">{METRIC_LABEL[m]}</dt>
              <dd className={`font-bold ${result === "miss" ? "text-red" : ""}`}>{formatMetric(m, c.totals[m])}</dd>
            </div>
          );
        })}
      </dl>
      <div className="flex gap-2 shrink-0">
        {c.status === "open" ? (
          dismissing ? (
            <div className="flex gap-2 items-center">
              <Select value={reason} onChange={(e) => setReason(e.target.value)} className="h-10 w-40" aria-label="対象外の理由">
                {DISMISS_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
              <Button size="sm" variant="dark" disabled={busy} onClick={() => call(`/api/sb/candidates/${c.id}/dismiss`, { reason })}>確定</Button>
              <Button size="sm" onClick={() => setDismissing(false)}>やめる</Button>
            </div>
          ) : (
            <>
              <LinkButton href={`/register?candidate=${c.id}`} variant="dark" size="sm">登録する</LinkButton>
              <Button size="sm" onClick={() => setDismissing(true)}>対象外にする</Button>
            </>
          )
        ) : (
          <Button size="sm" disabled={busy} onClick={() => call(`/api/sb/candidates/${c.id}/restore`)}>未処理に戻す</Button>
        )}
      </div>
    </div>
  );
}
