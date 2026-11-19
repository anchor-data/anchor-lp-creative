import { requireUser } from "@/server/auth";
import { getRawClient } from "@/server/db/client";
import { dateTime } from "@/lib/format";
import { Card, EmptyState, PageTitle } from "@/components/ui";

/** S-09 (phase 2): read-only list of the latest approved playbooks for now. */
export default async function PlaybooksPage() {
  await requireUser("view");
  const res = await getRawClient().execute(`
    SELECT pb.*, c.name cname, u.name approver FROM playbooks pb JOIN categories c ON c.id = pb.category_id LEFT JOIN users u ON u.id = pb.approved_by
    WHERE pb.status = 'approved' ORDER BY c.sort_order, pb.kind, pb.version_no DESC`);
  return (
    <div className="px-4 lg:px-8 pt-7 pb-12">
      <PageTitle eyebrow="承認済みの最新版（下書きの承認・差分表示は第2フェーズで追加します）">勝ちパターン集</PageTitle>
      {res.rows.length === 0 ? (
        <EmptyState title="承認済みの勝ちパターン集はまだありません" />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {res.rows.map((r) => (
            <Card key={String(r.id)} className="p-5">
              <h2 className="font-bold">{String(r.cname)}　{r.kind === "win" ? "勝ちパターン集" : "避けるパターン"}（第{String(r.version_no)}版）</h2>
              <p className="text-xs text-ink-3 mt-1">承認：{String(r.approver ?? "—")}・{dateTime(r.approved_at ? String(r.approved_at) : null)}</p>
              <ul className="mt-3 text-sm flex flex-col gap-1.5">
                {String(r.body_md).split("\n").filter((l) => l.trim()).map((l, i) => <li key={i}>{l.replace(/^-\s*/, "・")}</li>)}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
