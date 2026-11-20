import Link from "next/link";
import { requireUser } from "@/server/auth";
import { countOpenCandidates } from "@/server/services/candidates";
import { PageTitle } from "@/components/ui";
import { DproTab } from "./dpro-tab";
import { SbTab } from "./sb-tab";

type Tab = "sb" | "dpro";
const TABS: { key: Tab; label: string }[] = [
  { key: "sb", label: "Squad beyond" },
  { key: "dpro", label: "動画広告分析Pro" },
];

const str = (v: string | string[] | undefined): string | undefined => (typeof v === "string" && v ? v : undefined);

/** 取り込み候補: Squad beyond (自社実績) and 動画広告分析Pro (市場事例) candidates, one tab each. */
export default async function ImportsPage({ searchParams }: PageProps<"/imports">) {
  await requireUser("review_candidates");
  const sp = await searchParams;
  const tab: Tab = sp.tab === "dpro" ? "dpro" : "sb";
  const counts = await countOpenCandidates();
  const countOf: Record<Tab, number> = { sb: counts.sb, dpro: counts.dpro };

  return (
    <div className="px-4 lg:px-8 pt-7 pb-12">
      <PageTitle>取り込み候補</PageTitle>
      <div className="flex border-b border-line-2 mb-6" role="tablist">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={`/imports?tab=${t.key}`}
              role="tab"
              aria-selected={active}
              className={`-mb-px px-5 h-11 inline-flex items-center gap-2 text-sm border-b-2 ${active ? "border-red font-bold text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
            >
              {t.label}
              {countOf[t.key] > 0 ? <span className={`text-xs px-2 py-px ${active ? "bg-red text-white" : "bg-chip text-ink-2"}`}>{countOf[t.key]}</span> : null}
            </Link>
          );
        })}
      </div>
      {tab === "sb" ? (
        <SbTab filters={{ dismissed: sp.status === "dismissed", includeMiss: sp.includeMiss === "1", media: str(sp.media), page: str(sp.page) }} />
      ) : (
        <DproTab />
      )}
    </div>
  );
}
