// 取り込み候補 › Squad beyond tab (S-05): unregistered hit/fair combinations from the daily SB import.
import Link from "next/link";
import { listSbCandidates } from "@/server/services/candidates";
import { sbPages } from "@/server/services/registration";
import { MEDIA } from "@/lib/domain/constants";
import { EmptyState } from "@/components/ui";
import { CandidateRow } from "./sb-candidate-row";

export interface SbTabFilters {
  dismissed: boolean;
  includeMiss: boolean;
  media?: string;
  page?: string;
}

const PILL = "h-10 px-[14px] text-sm inline-flex items-center border";

export async function SbTab({ filters }: { filters: SbTabFilters }) {
  const { dismissed, includeMiss, media, page } = filters;
  const status = dismissed ? "dismissed" : "open";
  const [items, pages] = await Promise.all([listSbCandidates({ status, judge: [], includeMiss, media, page }), sbPages()]);

  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams({ tab: "sb" });
    const base: Record<string, string | undefined> = { status: dismissed ? "dismissed" : undefined, includeMiss: includeMiss ? "1" : undefined, media, page };
    for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) p.set(k, v);
    return `/imports?${p.toString()}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-ink-3">Squad beyondの配信実績を毎朝取り込み、当たり・まずまずで未登録の組み合わせを並べます。登録すると「自社実績」として蓄積に入ります。</p>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href({ status: null })} className={`${PILL} ${!dismissed ? "bg-ink text-white border-ink" : "bg-white border-line-2"}`}>未処理　{dismissed ? "" : items.length}</Link>
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
          <label className="text-sm flex items-center gap-1.5">
            <input type="checkbox" name="includeMiss" value="1" defaultChecked={includeMiss} />同じ商材の外れも表示
          </label>
          <button type="submit" className="h-10 px-[14px] text-sm border border-ink bg-white">絞り込む</button>
        </form>
      </div>
      {items.length === 0 ? (
        <EmptyState title={dismissed ? "対象外にした候補はありません" : "未処理の候補はありません"}>
          {dismissed ? null : "Squad beyondの実績を毎朝取り込み、当たり・まずまずの未登録の組み合わせをここに並べます。"}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((c) => <CandidateRow key={c.id} c={c} />)}
        </div>
      )}
    </div>
  );
}
