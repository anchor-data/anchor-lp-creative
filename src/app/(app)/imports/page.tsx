import { requireUser } from "@/server/auth";
import { listDproCandidates } from "@/server/services/candidates";
import { listCategoriesAdmin } from "@/server/services/admin";
import { mediaLabel } from "@/lib/domain/constants";
import { date, yenCompact } from "@/lib/format";
import { Chip, EmptyState } from "@/components/ui";
import { ImportList } from "./import-list";

export default async function ImportsPage() {
  await requireUser("review_candidates");
  const [data, cats] = await Promise.all([listDproCandidates(), listCategoriesAdmin()]);
  const parents = cats.filter((c) => !c.parentId);
  const categoryOptions = cats.filter((c) => c.parentId && c.isActive).map((c) => ({ id: c.id, label: `${parents.find((p) => p.id === c.parentId)?.name ?? ""} ＞ ${c.name}` }));
  return (
    <div className="px-4 lg:px-8 pt-7 pb-12 flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-tight">動画広告分析Proからの取り込み候補　{data.items.length}件</h1>
          <p className="text-sm text-ink-3 mt-1.5">
            最終取り込み：{date(data.lastFetchedAt)}（毎週月曜）　｜　承認したものだけが「市場事例」として蓄積に入ります
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {data.conditions.length === 0 ? <Chip>取り込み条件は未設定です（管理画面 A-04）</Chip> : null}
        {data.conditions.map((c, i) => (
          <div key={i} className="contents">
            <Chip>条件：{c.category ?? "—"}</Chip>
            <Chip>媒体：{c.media.map(mediaLabel).join("・") || "すべて"}</Chip>
            <Chip>推定消化額：{c.minEstSpend ? `${yenCompact(c.minEstSpend)}以上` : "下限なし"}</Chip>
            <Chip>配信日数：{c.minDays ? `${c.minDays}日以上` : "下限なし"}</Chip>
            <Chip>遷移先：{c.lpType === "article_only" ? "記事LPのみ" : "すべて"}</Chip>
          </div>
        ))}
      </div>
      {data.items.length === 0 ? (
        <EmptyState title="未処理の取り込み候補はありません">DProの取り込み（第2フェーズ）またはメンバーのAIツールからの送信（方式B）で候補が追加されます。</EmptyState>
      ) : (
        <ImportList items={data.items} categories={categoryOptions} />
      )}
    </div>
  );
}
