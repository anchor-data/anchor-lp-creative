// 取り込み候補 › Squad beyond tab (S-05): unregistered hit/fair combinations from the daily SB import.
import Link from "next/link";
import { SB_CANDIDATES_PAGE_SIZE, candidatePages, listSbCandidates } from "@/server/services/candidates";
import { JUDGE_LABEL, MEDIA } from "@/lib/domain/constants";
import { EmptyState } from "@/components/ui";
import { SB_MAX_PAGES, getRefreshView } from "@/server/sb-refresh";
import { CandidateRow } from "./sb-candidate-row";
import { SbRefresh } from "./sb-refresh";
import { SbSearch } from "./sb-search";

export interface SbTabFilters {
  dismissed: boolean;
  judge?: string;
  media?: string;
  page?: string;
  /** How many rows to show (grows by SB_CANDIDATES_PAGE_SIZE with 「さらに表示」). */
  show?: string;
}

const JUDGES = ["hit", "fair", "pending", "miss"] as const;

const PILL = "h-10 px-[14px] text-sm inline-flex items-center border";

export async function SbTab({ filters }: { filters: SbTabFilters }) {
  const { dismissed, media, page } = filters;
  const judge = JUDGES.find((j) => j === filters.judge);
  const limit = Math.max(SB_CANDIDATES_PAGE_SIZE, Number(filters.show) || SB_CANDIDATES_PAGE_SIZE);
  const status = dismissed ? "dismissed" : "open";
  const [{ items, total }, pages, refresh] = await Promise.all([
    listSbCandidates({ status, judge: judge ? [judge] : [], media, page, limit }),
    candidatePages(),
    getRefreshView(),
  ]);

  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams({ tab: "sb" });
    const base: Record<string, string | undefined> = { status: dismissed ? "dismissed" : undefined, judge, media, page };
    for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) p.set(k, v);
    return `/imports?${p.toString()}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-ink-3 max-w-[640px]">「最新にする」でSquad beyondの直近30日に配信金額が多いbeyondページ（上位{SB_MAX_PAGES}件）から配信実績を取り込み、未登録のVersion×媒体を成果の良い順に並べます。それ以外のページは検索して取り込めます。登録すると「自社実績」として蓄積に入り、以後は毎朝自動で数値が更新されます。</p>
        <SbRefresh initial={refresh} maxPages={SB_MAX_PAGES} />
      </div>
      <SbSearch />
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href({ status: null })} className={`${PILL} ${!dismissed ? "bg-ink text-white border-ink" : "bg-white border-line-2"}`}>未処理　{dismissed ? "" : total}</Link>
        <Link href={href({ status: "dismissed" })} className={`${PILL} ${dismissed ? "bg-ink text-white border-ink" : "bg-white border-line-2"}`}>対象外にしたもの</Link>
        <span className="w-4" />
        <form className="flex flex-wrap items-center gap-2" action="/imports">
          <input type="hidden" name="tab" value="sb" />
          {dismissed ? <input type="hidden" name="status" value="dismissed" /> : null}
          <select name="media" defaultValue={media ?? ""} className="h-10 border border-line-2 bg-white px-3 text-sm" aria-label="媒体">
            <option value="">媒体：すべて</option>
            {MEDIA.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
          </select>
          <select name="page" defaultValue={page ?? ""} className="h-10 border border-line-2 bg-white px-3 text-sm" aria-label="beyondページ">
            <option value="">beyondページ：すべて</option>
            {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select name="judge" defaultValue={judge ?? ""} className="h-10 border border-line-2 bg-white px-3 text-sm" aria-label="判定">
            <option value="">判定：すべて</option>
            {JUDGES.map((j) => <option key={j} value={j}>{JUDGE_LABEL[j]}</option>)}
          </select>
          <button type="submit" className="h-10 px-[14px] text-sm border border-ink bg-white">絞り込む</button>
        </form>
      </div>
      {items.length === 0 ? (
        <EmptyState title={dismissed ? "対象外にした候補はありません" : judge ? "この判定の候補はありません" : "未処理の候補はありません"}>
          {dismissed ? null : "「最新にする」でSquad beyondの実績を取り込むと、当たり・まずまずの未登録の組み合わせをここに並べます。"}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((c) => <CandidateRow key={c.id} c={c} />)}
          <div className="flex items-center justify-center gap-4 py-2 text-sm text-ink-3">
            <span>{total}件中 {items.length}件を表示</span>
            {items.length < total ? (
              <Link href={href({ show: String(limit + SB_CANDIDATES_PAGE_SIZE) })} scroll={false} className="h-10 px-[14px] inline-flex items-center border border-ink bg-white text-ink">
                さらに{Math.min(SB_CANDIDATES_PAGE_SIZE, total - items.length)}件表示
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
