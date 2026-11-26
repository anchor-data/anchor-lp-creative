"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SbRefreshView } from "@/server/sb-refresh";
import { date, dateTime } from "@/lib/format";
import { Button, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";

interface SbRefreshProps {
  initial: SbRefreshView;
  maxPages: number;
}

function statusText(v: SbRefreshView, maxPages: number): string {
  if (v.status === "never") return `「最新にする」で直近30日に配信金額が多いbeyondページ${maxPages}件までを取り込みます`;
  const fails = v.failures.length > 0 ? `・取得できなかったページ ${v.failures.length}件` : "";
  const partial = v.hasMore ? "（途中まで）" : "";
  return `${date(v.rangeStart)}〜${date(v.rangeEnd)} の配信金額上位 ${v.loadedPages}件を取り込み済み${partial}（${dateTime(v.at)}）${fails}`;
}

/**
 * 「最新にする」 loads the top pages by ad spend. The server takes them a batch at a time, so the
 * button keeps asking for the next batch until the top is loaded; an interrupted run resumes the same way.
 */
export function SbRefresh({ initial, maxPages }: SbRefreshProps) {
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = useState(initial);
  const [progress, setProgress] = useState<number | null>(null);

  const loadAll = async (resume: boolean) => {
    setProgress(resume ? view.loadedPages : 0);
    try {
      let next = await api<SbRefreshView>("/api/sb/refresh", { method: "POST", json: { mode: resume ? "more" : "latest" } });
      setView(next);
      setProgress(next.loadedPages);
      while (next.hasMore) {
        next = await api<SbRefreshView>("/api/sb/refresh", { method: "POST", json: { mode: "more" } });
        setView(next);
        setProgress(next.loadedPages);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setProgress(null);
      router.refresh();
    }
  };

  const loading = progress !== null;
  const resumable = view.status === "done" && view.hasMore && view.loadedPages > 0;
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        {resumable && !loading ? (
          <Button size="sm" variant="ghost" onClick={() => void loadAll(true)}>続きを読み込む</Button>
        ) : null}
        <Button size="sm" onClick={() => void loadAll(false)} disabled={loading} aria-busy={loading} className="gap-2">
          {loading ? <Spinner /> : null}
          {loading ? `取得中… ${progress}/${maxPages}件` : "最新にする"}
        </Button>
      </div>
      <span className="text-xs text-ink-3 text-right" aria-live="polite">{statusText(view, maxPages)}</span>
    </div>
  );
}
