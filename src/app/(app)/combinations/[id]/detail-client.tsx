"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { JudgeBasis } from "@/lib/domain/judge";
import { basisSummary, formatMetric, thresholdText } from "@/lib/domain/judge-text";
import { METRIC_LABEL } from "@/lib/domain/constants";
import { Button, LinkButton, Select, Textarea } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { EditPanel, type EditPanelProps } from "./edit-panel";

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

interface DetailActionsProps {
  id: string;
  canEdit: boolean;
  canDelete: boolean;
  edit: Omit<EditPanelProps, "id" | "onClose">;
}

export function DetailActions({ id, canEdit, canDelete, edit }: DetailActionsProps) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col items-end gap-3">
      <div className="flex flex-wrap gap-2.5 justify-end">
        {canEdit ? (
          <Button className="hidden md:inline-flex" onClick={() => setEditing((o) => !o)}>編集</Button>
        ) : null}
        {canDelete ? (
          <Button
            className="hidden md:inline-flex"
            disabled={busy}
            onClick={async () => {
              const ok = await confirm({
                title: "この組み合わせを削除しますか？",
                message: "ギャラリーと検索に表示されなくなります。削除から30日間は復元できます。",
                confirmLabel: "削除する",
                danger: true,
              });
              if (!ok) return;
              setBusy(true);
              try {
                await api(`/api/combinations/${id}`, { method: "DELETE" });
                toast.info("削除しました（30日間は復元できます）");
                // Leave the page without refreshing it first: the deleted record would render as 404.
                router.replace("/");
              } catch (err) {
                toast.error(errorMessage(err));
                setBusy(false);
              }
            }}
          >
            削除
          </Button>
        ) : null}
        <LinkButton href={`/generate?ref=${id}`} variant="primary" className="hidden md:inline-flex">
          この組み合わせを参考に生成
        </LinkButton>
      </div>
      {editing ? <EditPanel id={id} {...edit} onClose={() => setEditing(false)} /> : null}
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
