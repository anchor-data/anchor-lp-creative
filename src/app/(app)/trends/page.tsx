import { requireUser } from "@/server/auth";
import { EmptyState, PageTitle } from "@/components/ui";

/** S-10 傾向分析 is phase 2 (spec ch.14). */
export default async function TrendsPage() {
  await requireUser("view");
  return (
    <div className="px-4 lg:px-8 pt-7 pb-12">
      <PageTitle>傾向分析</PageTitle>
      <EmptyState title="傾向分析は第2フェーズで追加します">訴求軸・フック種別・記事構成ごとの当たり率・平均CPA・平均MCVRと、AI要約を表示する予定です。</EmptyState>
    </div>
  );
}
