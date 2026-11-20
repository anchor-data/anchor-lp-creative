// 取り込み候補 › 動画広告分析Pro tab (S-06). The DPro connection is not live yet (U-10/U-11),
// so this normally shows the empty state; approved items become 市場事例.
import { listDproCandidates } from "@/server/services/candidates";
import { listCategoriesAdmin } from "@/server/services/admin";
import { date } from "@/lib/format";
import { EmptyState } from "@/components/ui";
import { ImportList } from "./import-list";

export async function DproTab() {
  const [data, cats] = await Promise.all([listDproCandidates(), listCategoriesAdmin()]);
  const parents = cats.filter((c) => !c.parentId);
  const categoryOptions = cats.filter((c) => c.parentId && c.isActive).map((c) => ({ id: c.id, label: `${parents.find((p) => p.id === c.parentId)?.name ?? ""} ＞ ${c.name}` }));

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-ink-3">
        動画広告分析Proの広告から、条件に合うものを候補として並べます。承認したものだけが「市場事例」として蓄積に入ります。
        {data.lastFetchedAt ? `　最終取り込み：${date(data.lastFetchedAt)}` : ""}
      </p>
      {data.items.length === 0 ? (
        <EmptyState title="動画広告分析Proのデータはまだありません">動画広告分析Proとの連携は準備中です。つながり次第、ここに取り込み候補が並びます。</EmptyState>
      ) : (
        <ImportList items={data.items} categories={categoryOptions} />
      )}
    </div>
  );
}
