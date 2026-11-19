import Link from "next/link";
import { requireUser } from "@/server/auth";
import { listGenerations } from "@/server/services/generation";
import { dateTime } from "@/lib/format";
import { EmptyState, PageTitle } from "@/components/ui";

/** S-08 自分の生成案 */
export default async function HistoryPage() {
  const user = await requireUser("generate");
  const items = await listGenerations(user);
  const byProduct = new Map<string, typeof items>();
  for (const it of items) byProduct.set(it.productName, [...(byProduct.get(it.productName) ?? []), it]);
  return (
    <div className="px-4 lg:px-8 pt-7 pb-12">
      <PageTitle>自分の生成案</PageTitle>
      {items.length === 0 ? (
        <EmptyState title="まだ生成案はありません"><Link href="/generate" className="underline">生成ワークスペース</Link>から作成できます。</EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {[...byProduct.entries()].map(([name, gens]) => (
            <section key={name} className="bg-white border border-line">
              <h2 className="font-bold px-5 py-3 border-b border-line">{name}</h2>
              <ul className="divide-y divide-line-3">
                {gens.map((g) => (
                  <li key={g.id}>
                    <Link href={`/generate/${g.id}`} className="flex flex-wrap justify-between gap-3 px-5 py-3 hover:bg-canvas text-sm">
                      <span>{g.axes.join(" ／ ") || "（訴求軸なし）"}</span>
                      <span className="text-ink-3">版 {g.versions}・{g.linked > 0 ? `配信済み ${g.linked}件・` : ""}{dateTime(g.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
