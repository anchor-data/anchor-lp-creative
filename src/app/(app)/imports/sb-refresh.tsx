"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SbRefreshState } from "@/server/jobs";
import { dateTime } from "@/lib/format";
import { Button } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";

const POLL_MS = 5_000;

function statusText(s: SbRefreshState): string {
  if (s.status === "running") return "Squad beyondから取得中…（数分かかることがあります）";
  if (s.status === "never") return "毎朝6時に自動で取り込みます";
  const at = dateTime(s.finishedAt ?? s.startedAt);
  return s.status === "failed" ? `前回の更新は失敗しました（${at}）` : `最終更新 ${at}`;
}

/** 「最新にする」: runs J-16 (yesterday's not-yet-fetched pages + candidate extraction) and polls until done. */
export function SbRefresh({ initial }: { initial: SbRefreshState }) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const running = state.status === "running";

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      try {
        const next = await api<SbRefreshState>("/api/sb/refresh");
        if (next.status === "running") return;
        setState(next);
        if (next.status === "failed") toast.error(next.error ?? "更新に失敗しました");
        else toast.info("取り込み候補を更新しました");
        router.refresh();
      } catch {
        /* keep polling; a transient error should not stop the indicator */
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [running, router, toast]);

  const start = async () => {
    setBusy(true);
    try {
      const res = await api<{ started: boolean; state: SbRefreshState }>("/api/sb/refresh", { method: "POST", json: {} });
      setState(res.state);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const coolingDown = Boolean(state.nextAllowedAt);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" onClick={start} disabled={busy || running || coolingDown} title={coolingDown ? `次に更新できるのは ${dateTime(state.nextAllowedAt)} 以降です` : undefined}>
        {running ? "取得中…" : "最新にする"}
      </Button>
      <span className="text-xs text-ink-3" aria-live="polite">{statusText(state)}</span>
    </div>
  );
}
