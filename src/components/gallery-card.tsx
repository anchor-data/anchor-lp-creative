import Link from "next/link";
import type { CardRow } from "@/server/services/combination-list";
import { compactNumber, pct, yen, yenCompact } from "@/lib/format";
import { JudgeBadge, MarketJudgeBadge, MediaBadge, SourceBadge } from "./ui";

function Thumb({ src, label, dashed }: { src: string | null; label: string; dashed?: boolean }) {
  return (
    <div className={`relative flex-1 min-w-0 h-[193px] overflow-hidden ${dashed ? "bg-thumb-2 border border-dashed border-line-2" : "bg-thumb"}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- private R2 files served via authenticated route
        <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover object-top" loading="lazy" />
      ) : null}
      <span className="absolute left-2.5 bottom-2.5 text-xs font-bold text-ink-2 bg-white/70 px-1">{label}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="text-base font-bold truncate">{value}</p>
    </div>
  );
}

/** Gallery card (Figma "Gallery card"); metrics per spec S-01. */
export function GalleryCard({ row }: { row: CardRow }) {
  const kindLabel = row.kind === "video" ? `動画${row.durationSec ? ` ${Math.round(row.durationSec)}秒` : ""}` : "バナー";
  return (
    <Link href={`/combinations/${row.id}`} className="bg-white border border-line p-4 flex flex-col gap-3.5 hover:border-ink transition-colors">
      <div className="flex gap-2">
        <Thumb src={row.thumbnailKey ? `/api/files/${row.thumbnailKey}` : null} label={kindLabel} />
        <Thumb src={row.fvKey ? `/api/files/${row.fvKey}` : null} label="記事LP ファーストビュー" dashed />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <SourceBadge origin={row.origin} long />
        {row.origin === "market" ? <MarketJudgeBadge /> : <JudgeBadge judge={row.judge} manual={row.judgeManual} />}
        <MediaBadge media={row.media} />
      </div>
      <p className="text-base font-bold leading-normal line-clamp-2">
        {row.productName} × 記事「{row.articleTitle ?? "（無題）"}」
      </p>
      <div className="flex gap-2 border-t border-line-3 pt-3">
        {row.origin === "own" ? (
          <>
            <Metric label="配信金額" value={yenCompact(row.spend)} />
            <Metric label="CPA" value={yen(row.cpa)} />
            <Metric label="MCVR" value={pct(row.mcvr)} />
          </>
        ) : (
          <>
            <Metric label="推定消化額" value={yenCompact(row.estSpend)} />
            <Metric label="配信日数" value={row.deliveryDays !== null ? `${row.deliveryDays}日` : "—"} />
            <Metric label="再生数" value={compactNumber(row.views)} />
          </>
        )}
      </div>
      {row.origin === "market" ? <p className="text-[11px] text-ink-4 -mt-2">※ 推定値</p> : null}
      {row.tags.length > 0 ? <p className="text-[13px] text-ink-3 truncate">{row.tags.map((t) => `#${t}`).join(" ")}</p> : null}
    </Link>
  );
}

export function GalleryCardSkeleton() {
  return (
    <div className="bg-white border border-line p-4 flex flex-col gap-3.5">
      <div className="flex gap-2">
        <div className="skeleton flex-1 h-[193px]" />
        <div className="skeleton flex-1 h-[193px]" />
      </div>
      <div className="skeleton h-5 w-40" />
      <div className="skeleton h-6 w-full" />
      <div className="skeleton h-10 w-full" />
    </div>
  );
}
