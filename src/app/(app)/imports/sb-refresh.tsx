"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SbRefreshView } from "@/server/sb-refresh";
import { date, dateTime } from "@/lib/format";
import { Button, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";

type Mode = "latest" | "more";

function statusText(v: SbRefreshView, batchSize: number): string {
  if (v.status === "never") return `「最新にする」で直近30日にPVが多いbeyondページ${batchSize}件分を取り込みます`;
  const fails = v.failures.length > 0 ? `・取得できなかったページ ${v.failures.length}件` : "";
  return `${date(v.rangeStart)}〜${date(v.rangeEnd)} のPV上位 ${v.loadedBatches * batchSize}件まで取り込み済み（${dateTime(v.at)}）${fails}`;
}

/** 「最新にする」 reloads the top pages; 「さらに読み込む」 adds the next few. Each click is a handful of API calls. */
export function SbRefresh({ initial, batchSize }: { initial: SbRefreshView; batchSize: number }) {
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = useState(initial);
  const [loading, setLoading] = useState<Mode | null>(null);

  const load = async (mode: Mode) => {
    setLoading(mode);
    try {
      setView(await api<SbRefreshView>("/api/sb/refresh", { method: "POST", json: { mode } }));
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        {view.status === "done" && view.hasMore ? (
          <Button size="sm" variant="ghost" onClick={() => void load("more")} disabled={loading !== null} aria-busy={loading === "more"} className="gap-2">
            {loading === "more" ? <Spinner /> : null}
            さらに{batchSize}件読み込む
          </Button>
        ) : null}
        <Button size="sm" onClick={() => void load("latest")} disabled={loading !== null} aria-busy={loading === "latest"} className="gap-2">
          {loading === "latest" ? <Spinner /> : null}
          {loading === "latest" ? "取得中…" : "最新にする"}
        </Button>
      </div>
      <span className="text-xs text-ink-3 text-right" aria-live="polite">{statusText(view, batchSize)}</span>
    </div>
  );
}
