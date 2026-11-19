"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { JudgeBasis } from "@/lib/domain/judge";
import { basisSummary, formatMetric, thresholdText } from "@/lib/domain/judge-text";
import { METRIC_LABEL } from "@/lib/domain/constants";
import { Button, Field, LinkButton, Select, Textarea } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";

export function JudgeBasisLine({ basis }: { basis: JudgeBasis | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-left text-ink-3 hover:text-ink underline-offset-2 hover:underline" aria-expanded={open}>
        判定の根拠：{basisSummary(basis)} {basis?.metrics.length ? (open ? "▴" : "▾") : ""}
      </button>
      {open && basis && basis.metrics.length > 0 ? (
        <table className="mt-2 bg-white border border-line text-xs">
          <thead>
            <tr className="text-ink-3">
              <th className="px-3 py-1.5 text-left font-normal">指標</th>
              <th className="px-3 py-1.5 text-left font-normal">値</th>
              <th className="px-3 py-1.5 text-left font-normal">当たり基準</th>
              <th className="px-3 py-1.5 text-left font-normal">まずまず基準</th>
              <th className="px-3 py-1.5 text-left font-normal">結果</th>
            </tr>
          </thead>
          <tbody>
            {basis.metrics.map((m) => (
              <tr key={m.metric} className="border-t border-line-3">
                <td className="px-3 py-1.5">{METRIC_LABEL[m.metric]}</td>
                <td className="px-3 py-1.5">{formatMetric(m.metric, m.value)}</td>
                <td className="px-3 py-1.5">{thresholdText(m, m.hit)}</td>
                <td className="px-3 py-1.5">{thresholdText(m, m.fair)}</td>
                <td className="px-3 py-1.5 font-bold">{{ hit: "満たす", fair: "まずまず", miss: "満たさない", no_data: "データなし" }[m.result]}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-3 text-ink-3">
              <td colSpan={5} className="px-3 py-1.5">
                判定期間 {basis.window.from}〜{basis.window.to}（{basis.window.days}日）／{basis.phase === "early" ? "初期基準" : "目標基準"}で判定
              </td>
            </tr>
          </tfoot>
        </table>
      ) : null}
    </div>
  );
}

export function DetailActions(props: { id: string; updatedAt: string; origin: "own" | "market"; hasManual: boolean; canOverride: boolean; canDelete: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [overriding, setOverriding] = useState(false);
  const [judge, setJudge] = useState<"hit" | "fair" | "miss">("hit");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast.info(done);
      router.refresh();
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-3">
      <div className="flex flex-wrap gap-2.5 justify-end">
        {props.canOverride && props.origin === "own" ? (
          props.hasManual ? (
            <Button disabled={busy} onClick={() => run(() => api(`/api/combinations/${props.id}/judge-override?updatedAt=${encodeURIComponent(props.updatedAt)}`, { method: "DELETE" }), "自動判定に戻しました")}>
              自動判定に戻す
            </Button>
          ) : (
            <Button className="hidden md:inline-flex" onClick={() => setOverriding((o) => !o)}>判定を手動で変える</Button>
          )
        ) : null}
        {props.canDelete ? (
          <Button
            className="hidden md:inline-flex"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm("この組み合わせを削除しますか？（30日間は復元できます）")) return;
              const okDone = await run(() => api(`/api/combinations/${props.id}`, { method: "DELETE" }), "削除しました");
              if (okDone) router.push("/");
            }}
          >
            削除
          </Button>
        ) : null}
        <LinkButton href={`/generate?ref=${props.id}`} variant="primary" className="hidden md:inline-flex">
          この組み合わせを参考に生成
        </LinkButton>
      </div>
      {overriding ? (
        <div className="bg-white border border-line-2 p-4 w-full md:w-96 flex flex-col gap-3">
          <Field label="手動の判定" required>
            <Select value={judge} onChange={(e) => setJudge(e.target.value as typeof judge)}>
              <option value="hit">当たり</option>
              <option value="fair">まずまず</option>
              <option value="miss">外れ</option>
            </Select>
          </Field>
          <Field label="理由" required hint="1〜500文字" error={reason.length > 500 ? "理由は500文字以内にしてください" : null}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setOverriding(false)}>やめる</Button>
            <Button
              size="sm"
              variant="primary"
              disabled={busy || reason.trim().length === 0 || reason.length > 500}
              onClick={async () => {
                const okDone = await run(() => api(`/api/combinations/${props.id}/judge-override`, { method: "PUT", json: { judge, reason, updatedAt: props.updatedAt } }), "判定を手動で変更しました");
                if (okDone) setOverriding(false);
              }}
            >
              保存
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MemoComposer({ combinationId, isMiss }: { combinationId: string; isMiss: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"win" | "next" | "miss">(isMiss ? "miss" : "win");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <Button size="sm" className="w-fit hidden md:inline-flex" onClick={() => setOpen(true)}>
        ＋ メモを追加
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 border border-line-2 p-3">
      <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="h-9 w-48">
        <option value="win">勝因メモ</option>
        <option value="miss">外れた理由メモ</option>
        <option value="next">次に試したいこと</option>
      </Select>
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder="何が効いたか・次に試したいこと" />
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={() => setOpen(false)}>やめる</Button>
        <Button
          size="sm"
          variant="dark"
          disabled={busy || !body.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await api("/api/memos", { method: "POST", json: { combinationId, kind, body } });
              setBody("");
              setOpen(false);
              router.refresh();
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          追加
        </Button>
      </div>
    </div>
  );
}
