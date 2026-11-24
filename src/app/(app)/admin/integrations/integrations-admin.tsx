"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { dateTime } from "@/lib/format";
import { Button, Card, CardTitle, Field, Input, Select } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";

interface Props {
  status: { sb: { configured: boolean; keyExpiresOn: string | null; daysLeft: number | null; usageToday: number; lastHealth: { status: string; at: string; error: string | null } | null }; dpro: { configured: boolean; usageToday: number } };
  runs: { id: string; job: string; targetDate: string | null; status: string; items: number | null; error: string | null; startedAt: string; finishedAt: string | null }[];
  jobs: { id: string; label: string }[];
}

const STATUS_LABEL: Record<string, string> = { running: "実行中", succeeded: "成功", failed: "失敗", skipped: "スキップ" };

export function IntegrationsAdmin({ status, runs, jobs }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [job, setJob] = useState(jobs[0]?.id ?? "");
  const [targetDate, setTargetDate] = useState("");
  const [expiry, setExpiry] = useState(status.sb.keyExpiresOn ?? "");
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Card className="p-5">
          <CardTitle>Squad beyond</CardTitle>
          <dl className="text-sm grid grid-cols-[9rem_1fr] gap-y-2">
            <dt className="text-ink-3">接続設定</dt><dd>{status.sb.configured ? "設定済み" : "未設定（Secretsに SQUAD_BEYOND_API_KEY）"}</dd>
            <dt className="text-ink-3">直近の疎通確認</dt><dd>{status.sb.lastHealth ? `${STATUS_LABEL[status.sb.lastHealth.status] ?? status.sb.lastHealth.status}（${dateTime(status.sb.lastHealth.at)}）` : "まだありません"}</dd>
            <dt className="text-ink-3">APIキーの有効期限</dt><dd className={status.sb.daysLeft !== null && status.sb.daysLeft <= 30 ? "text-red font-bold" : ""}>{status.sb.keyExpiresOn ? `${status.sb.keyExpiresOn}（残り${status.sb.daysLeft}日）` : "未登録"}</dd>
            <dt className="text-ink-3">本日の利用回数</dt><dd>{status.sb.usageToday} / 15,000</dd>
          </dl>
          <div className="flex gap-2 items-end mt-4">
            <Field label="キーを入れ替えたときの新しい有効期限"><Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="h-9" /></Field>
            <Button size="sm" disabled={!expiry} onClick={async () => { try { await api("/api/admin/integrations/squadbeyond/key-expiry", { method: "PUT", json: { expiresOn: expiry } }); toast.info("登録しました"); router.refresh(); } catch (err) { toast.error(errorMessage(err)); } }}>登録</Button>
          </div>
          <p className="text-xs text-ink-4 mt-2">APIキーの値は画面には表示しません。入れ替えはSecretsで行います。</p>
        </Card>
        <Card className="p-5">
          <CardTitle>動画広告分析Pro（DPro）</CardTitle>
          <p className="text-sm text-ink-3">接続方式は回答待ち（U-10）です。方式B（メンバーのAIツールから POST /api/dpro/candidates）で候補を受け付けられます。</p>
          <p className="text-sm mt-2">本日の利用回数：{status.dpro.usageToday}</p>
        </Card>
      </div>
      <Card className="p-5">
        <CardTitle>ジョブの手動実行</CardTitle>
        <div className="flex flex-wrap gap-2 items-end">
          <Field label="ジョブ"><Select value={job} onChange={(e) => setJob(e.target.value)} className="h-10 w-80">{jobs.map((j) => <option key={j.id} value={j.id}>{j.id} {j.label}</option>)}</Select></Field>
          <Field label="対象日（空欄＝前日）"><Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="h-10" /></Field>
          <Button variant="dark" size="sm" disabled={busy} onClick={async () => { setBusy(true); try { const r = await api<{ status: string; items: number | null; error: string | null }>(`/api/admin/jobs/${job}/run`, { method: "POST", json: targetDate ? { targetDate } : {} }); if (r.status === "failed") toast.error(`失敗しました：${r.error}`); else toast.info(`${STATUS_LABEL[r.status] ?? r.status}（${r.items ?? 0}件）`); router.refresh(); } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); } }}>{busy ? "実行中…" : "実行"}</Button>
        </div>
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-ink-3 border-b border-line"><th className="text-left font-normal px-4 py-2.5">ジョブ</th><th className="text-left font-normal">対象日</th><th className="text-left font-normal">状態</th><th className="text-left font-normal">件数</th><th className="text-left font-normal">開始</th><th className="text-left font-normal">終了</th><th className="text-left font-normal">エラー</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-line-3">
                <td className="px-4 py-2">{r.job}</td><td>{r.targetDate ?? "—"}</td>
                <td className={r.status === "failed" ? "text-red font-bold" : ""}>{STATUS_LABEL[r.status] ?? r.status}</td>
                <td>{r.items ?? "—"}</td><td>{dateTime(r.startedAt)}</td><td>{dateTime(r.finishedAt)}</td>
                <td className="text-xs text-ink-3 max-w-xs truncate" title={r.error ?? ""}>{r.error ?? ""}</td>
              </tr>
            ))}
            {runs.length === 0 ? <tr><td colSpan={7} className="px-4 py-4 text-ink-3">実行履歴はまだありません</td></tr> : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
