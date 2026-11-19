import Link from "next/link";
import { ZodError } from "zod";
import { requireUser } from "@/server/auth";
import { categoryTree, listCombinations, parseListQuery, type ListQuery } from "@/server/services/combination-list";
import { listTags } from "@/server/services/admin";
import { GalleryFilters } from "./gallery-filters";
import { GalleryGrid } from "./gallery-grid";
import { EmptyState } from "@/components/ui";

function toParams(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    else if (v !== undefined) params.set(k, v);
  }
  return params;
}

export default async function GalleryPage({ searchParams }: PageProps<"/">) {
  await requireUser("view");
  const params = toParams(await searchParams);
  let query: ListQuery;
  try {
    query = parseListQuery(params);
  } catch (err) {
    const message = err instanceof ZodError ? err.issues[0]?.message : "絞り込み条件が正しくありません";
    return (
      <div className="p-8">
        <EmptyState title={message ?? "絞り込み条件が正しくありません"}>
          <Link href="/" className="underline">
            条件をリセットする
          </Link>
        </EmptyState>
      </div>
    );
  }

  const [tree, list, tagData] = await Promise.all([categoryTree(query), listCombinations(query), listTags()]);
  const allChildren = tree.flatMap((p) => p.children.map((c) => ({ ...c, parent: p })));
  const selectedChild = allChildren.find((c) => c.id === query.category);
  const selectedParent = tree.find((p) => p.id === query.category) ?? selectedChild?.parent;
  const scopeName = selectedChild?.name ?? selectedParent?.name ?? "すべてのカテゴリ";
  const judgeWord = query.judge.length === 1 && query.judge[0] === "hit" ? "勝ち組み合わせ" : "組み合わせ";
  const axisType = tagData.types.find((t) => t.code === "axis");
  const axisTags = tagData.tags.filter((t) => t.typeId === axisType?.id && t.isActive);
  const hookType = tagData.types.find((t) => t.code === "hook");
  const hookTags = tagData.tags.filter((t) => t.typeId === hookType?.id && t.isActive);

  const catHref = (id: string | null): string => {
    const p = new URLSearchParams(params);
    p.delete("cursor");
    if (id) p.set("category", id);
    else p.delete("category");
    return `/?${p.toString()}`;
  };

  return (
    <div className="flex gap-8 px-4 lg:px-8 pt-8 pb-12">
      <aside className="hidden lg:flex flex-col gap-5 w-60 shrink-0" aria-label="業種カテゴリ">
        <Link href={catHref(null)} className={`text-[13px] font-bold ${query.category ? "text-ink-3" : "text-ink"}`}>
          業種カテゴリ
        </Link>
        {tree.map((p) => (
          <div key={p.id} className="flex flex-col gap-1 text-sm">
            <Link href={catHref(p.id)} className={`font-bold ${query.category === p.id ? "text-orange" : ""}`}>
              {p.name}
            </Link>
            {p.children.map((c) => {
              const active = query.category === c.id;
              return (
                <Link key={c.id} href={catHref(c.id)} className={`flex justify-between px-3 py-2.5 ${active ? "bg-orange-tint font-medium" : "hover:bg-white"}`}>
                  <span>{c.name}</span>
                  <span className="text-ink-3">{c.count}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </aside>

      <div className="flex-1 min-w-0 flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[13px] text-ink-3">{selectedChild ? `${selectedChild.parent.name} ＞ ${selectedChild.name}` : scopeName}</p>
            <h1 className="text-[28px] font-bold leading-tight">
              {scopeName}の{judgeWord}　{list.total}件
            </h1>
          </div>
        </div>
        <GalleryFilters query={query} axisTags={axisTags.map((t) => ({ id: t.id, name: t.name }))} hookTags={hookTags.map((t) => ({ id: t.id, name: t.name }))} categories={tree} />
        <GalleryGrid key={params.toString()} initial={list} params={params.toString()} judgeFilter={query.judge} />
      </div>
    </div>
  );
}
