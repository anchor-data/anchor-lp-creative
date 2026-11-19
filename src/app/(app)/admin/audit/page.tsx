import { auditQuerySchema, listAuditLogs, listUsers } from "@/server/services/admin";
import { dateTime } from "@/lib/format";
import { Card, PageTitle } from "@/components/ui";

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const sp = await searchParams;
  const q = auditQuerySchema.parse(Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string" && v)));
  const [rows, users] = await Promise.all([listAuditLogs(q), listUsers()]);
  const csvParams = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
  csvParams.set("format", "csv");
  return (
    <>
      <PageTitle eyebrow="A-08" aside={<a href={`/api/admin/audit-logs?${csvParams.toString()}`} className="inline-flex items-center h-10 px-4 text-sm border border-ink bg-white">CSVで書き出し</a>}>監査ログ</PageTitle>
      <form className="flex flex-wrap gap-2 mb-4 text-sm" action="/admin/audit">
        <input type="date" name="from" defaultValue={q.from} className="h-10 border border-line-2 bg-white px-2" aria-label="開始日" />
        <input type="date" name="to" defaultValue={q.to} className="h-10 border border-line-2 bg-white px-2" aria-label="終了日" />
        <select name="userId" defaultValue={q.userId ?? ""} className="h-10 border border-line-2 bg-white px-2" aria-label="操作者">
          <option value="">操作者：すべて</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          <option value="system">system（ジョブ）</option>
        </select>
        <select name="action" defaultValue={q.action ?? ""} className="h-10 border border-line-2 bg-white px-2" aria-label="操作種別">
          <option value="">操作種別：すべて</option>
          {["create", "update", "delete", "restore", "approve", "reject", "export", "judge_override", "judge_change", "setting_change"].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input name="targetType" defaultValue={q.targetType} placeholder="対象（combinationなど）" className="h-10 border border-line-2 bg-white px-2" />
        <button type="submit" className="h-10 px-4 border border-ink bg-white">絞り込む</button>
      </form>
      <Card className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-ink-3 border-b border-line"><th className="text-left font-normal px-3 py-2">日時</th><th className="text-left font-normal">操作者</th><th className="text-left font-normal">操作</th><th className="text-left font-normal">対象</th><th className="text-left font-normal">変更前</th><th className="text-left font-normal">変更後</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line-3 align-top">
                <td className="px-3 py-2 whitespace-nowrap">{dateTime(r.at)}</td><td>{r.user}</td><td>{r.action}</td>
                <td>{r.targetType}<br /><span className="text-ink-4">{r.targetId}</span></td>
                <td className="max-w-[260px] break-all text-ink-3">{r.before?.slice(0, 300)}</td>
                <td className="max-w-[260px] break-all">{r.after?.slice(0, 300)}</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-4 text-ink-3">該当するログはありません</td></tr> : null}
          </tbody>
        </table>
      </Card>
    </>
  );
}
