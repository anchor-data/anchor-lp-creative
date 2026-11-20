import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { ApiError } from "@/server/http";
import { getCombinationDetail, getDailyMetrics, getRelated, type CombinationDetail, type RelatedRow } from "@/server/services/combination-detail";
import { blockLabel, JUDGE_LABEL, mediaLabel } from "@/lib/domain/constants";
import { can, canDelete } from "@/lib/domain/permissions";
import { compactNumber, date, dateTime, int, pct, yen } from "@/lib/format";
import { Card, CardTitle, Chip, JudgeBadge, LegalNote, LinkButton, MarketJudgeBadge, MediaBadge, SourceBadge, StatTile } from "@/components/ui";
import { DetailActions, JudgeBasisLine, MemoComposer } from "./detail-client";
import { DailyChart } from "./daily-chart";

export default async function CombinationPage({ params, searchParams }: PageProps<"/combinations/[id]">) {
  const user = await requireUser("view");
  const { id } = await params;
  const justRegistered = (await searchParams).registered === "1";
  let d: CombinationDetail;
  try {
    d = await getCombinationDetail(id);
  } catch (err) {
    if (err instanceof ApiError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const [related, daily] = await Promise.all([getRelated(id), d.metricsSource === "sb" ? getDailyMetrics(id) : Promise.resolve([])]);
  const kindLabel = d.creative.kind === "video" ? `動画 ${d.creative.durationSec ? `${Math.round(d.creative.durationSec)}秒` : ""}${d.creative.width && d.creative.height ? `・${aspect(d.creative.width, d.creative.height)}` : ""}` : `バナー${d.creative.width ? `・${d.creative.width}×${d.creative.height}` : ""}`;

  return (
    <div className="px-4 lg:px-8 pt-7 pb-12 flex flex-col gap-6">
      {justRegistered ? (
        <div className="bg-ink text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>登録しました。同じ商材の外れた組み合わせも登録すると、何が効いたかを比べられます。</span>
          <Link href="/register" className="underline font-bold">同じ商材の外れた組み合わせも登録する</Link>
        </div>
      ) : null}
      <Link href={`/?category=${d.category.id}`} className="text-sm underline underline-offset-2 w-fit">
        ← {d.category.name}のギャラリーに戻る
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-1.5">
            <SourceBadge origin={d.origin} long />
            {d.origin === "market" ? <MarketJudgeBadge /> : <JudgeBadge judge={d.judge} manual={Boolean(d.judgeManual) && !d.judgeManual?.reason} detail={d.judgeManual?.reason || undefined} />}
            <MediaBadge media={d.media} />
            <Chip>配信期間 {date(d.startDate)}〜{d.endDate ? date(d.endDate) : "配信中"}</Chip>
          </div>
          <h1 className="text-[28px] font-bold leading-tight">
            {d.product.name} × 記事「{d.article.title ?? "（無題）"}」
          </h1>
          <p className="text-sm text-ink-3">
            {d.category.parentName ? `${d.category.parentName} ＞ ` : ""}
            {d.category.name}　｜　登録：{d.createdBy.name}　｜　{date(d.createdAt)}
          </p>
          {d.origin === "own" && !d.judgeManual ? <JudgeBasisLine basis={d.basis} /> : null}
          {d.autoChangedSinceManual ? <p className="text-sm text-orange font-bold">自動判定が変わりました（現在の自動判定：{d.judgeAuto ? JUDGE_LABEL[d.judgeAuto] : "—"}）</p> : null}
          {d.judgeManual ? <p className="text-xs text-ink-3">手動判定（{d.judgeManual.by ?? "—"}・{dateTime(d.judgeManual.at)}）</p> : null}
        </div>
        <DetailActions
          id={d.id}
          updatedAt={d.updatedAt}
          origin={d.origin}
          hasManual={Boolean(d.judgeManual)}
          canOverride={can(user.role, "judge_override")}
          canDelete={canDelete(user.role, user.id, d.createdBy.id)}
        />
      </div>

      {d.origin === "own" ? (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
            <StatTile label="消化額" value={yen(d.totals.spend)} />
            <StatTile label="CPA" note={d.targetCpa !== null ? `目標 ${yen(d.targetCpa)}` : undefined} value={yen(d.totals.cpa)} />
            <StatTile label="CVR" value={pct(d.totals.cvr)} />
            <StatTile label="CTR" value={pct(d.totals.ctr)} />
            <StatTile label="記事→商品LP遷移率" value={pct(d.totals.mcvr)} />
          </div>
          <Card className="p-4">
            <p className="text-xs text-ink-3 mb-2">参考指標</p>
            <dl className="grid gap-x-6 gap-y-2 grid-cols-2 md:grid-cols-4 xl:grid-cols-6 text-sm">
              {[
                ["CV数", int(d.totals.cv)], ["FSVER", pct(d.totals.fsver)], ["OAR", pct(d.totals.oar)], ["PV", int(d.totals.pv)], ["CLICK", int(d.totals.click)],
                ["CTVR", pct(d.totals.ctvr)], ["MCPA", yen(d.totals.mcpa)], ["FVER", pct(d.totals.fver)], ["SVER", pct(d.totals.sver)],
                ["媒体IMP", int(d.totals.mediaImp)], ["媒体CTR", pct(d.totals.mediaCtr)], ["媒体CPM", yen(d.totals.mediaCpm)], ["媒体CPC", yen(d.totals.mediaCpc)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 border-b border-line-3 py-1">
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </>
      ) : (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <StatTile label="推定消化額" value={yen(d.market?.estSpend ?? null)} note="推定値" />
          <StatTile label="配信日数" value={d.market?.deliveryDays !== null && d.market?.deliveryDays !== undefined ? `${d.market.deliveryDays}日` : "—"} note="推定値" />
          <StatTile label="再生数" value={compactNumber(d.market?.views ?? null)} note="推定値" />
          <StatTile label="取得日" value={date(d.market?.snapshotDate ?? null)} />
        </div>
      )}

      {daily.length > 0 ? (
        <Card className="p-5">
          <CardTitle aside={<span className="text-xs text-ink-3">{mediaLabel(d.media)}</span>}>日別推移</CardTitle>
          <DailyChart points={daily} />
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <CardTitle>クリエイティブ　{kindLabel}</CardTitle>
          <div className="flex flex-col sm:flex-row gap-4">
            <CreativeMedia d={d} />
            <div className="flex-1 min-w-0">
              {d.creative.mainCopy ? (
                <div className="mb-4">
                  <p className="text-xs font-bold text-ink-3 mb-1">メインコピー</p>
                  <p className="text-sm">{d.creative.mainCopy}</p>
                </div>
              ) : null}
              <p className="text-xs font-bold text-ink-3 mb-2">台本</p>
              {d.creative.script.length > 0 ? (
                <ol className="flex flex-col gap-2.5">
                  {d.creative.script.map((s, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="w-16 shrink-0 text-ink-3">
                        {s.from}〜{s.to}秒
                      </span>
                      <span>{[s.narration, s.telop && `［テロップ］${s.telop}`, s.visual && `［映像］${s.visual}`].filter(Boolean).join(" ")}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-ink-4">台本は登録されていません</p>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <CardTitle aside={d.article.screenshotKey ? <a href={`/api/files/${d.article.screenshotKey}`} target="_blank" rel="noreferrer" className="text-sm underline">全画面を見る</a> : null}>記事LP</CardTitle>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative w-full sm:w-[200px] h-[356px] shrink-0 bg-thumb-2 border border-dashed border-line-2 overflow-hidden">
              {d.article.fvKey || d.article.screenshotKey ? (
                // eslint-disable-next-line @next/next/no-img-element -- private R2 file
                <img src={`/api/files/${d.article.fvKey ?? d.article.screenshotKey}`} alt="記事LPのスクリーンショット" className="w-full h-full object-cover object-top" />
              ) : null}
              <span className="absolute left-3 bottom-3 text-xs font-bold text-ink-2">登録時のスクリーンショット</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-ink-3 mb-2">記事の構成（AIで分解）</p>
              {d.article.blocks.length > 0 ? (
                <ol className="flex flex-col gap-2 text-sm">
                  {d.article.blocks.map((b, i) => (
                    <li key={i}>
                      {i + 1}. {blockLabel(b.type)}：{b.heading}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-ink-4">構成ブロックは未登録です</p>
              )}
              <dl className="mt-4 text-xs flex flex-col gap-1 break-all">
                <div><dt className="inline text-ink-3">記事LP：</dt><dd className="inline"><a className="underline" href={d.article.url} target="_blank" rel="noreferrer noopener">{d.article.url}</a></dd></div>
                {d.article.finalLpUrl ? <div><dt className="inline text-ink-3">最終LP：</dt><dd className="inline"><a className="underline" href={d.article.finalLpUrl} target="_blank" rel="noreferrer noopener">{d.article.finalLpUrl}</a></dd></div> : null}
              </dl>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <CardTitle>タグと勝因メモ</CardTitle>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {d.tags.length > 0 ? d.tags.map((t) => <Chip key={`${t.type}${t.name}`} className="!text-xs">{t.type}：{t.name}</Chip>) : <span className="text-sm text-ink-4">タグなし</span>}
          </div>
          <div className="flex flex-col gap-3">
            {d.memos.map((m) => (
              <div key={m.id} className="bg-canvas px-4 py-3.5">
                <p className="text-xs font-bold text-ink-3">
                  {m.kind === "win" ? "勝因メモ" : m.kind === "miss" ? "外れた理由メモ" : "次に試したいこと"}（{m.author}）
                </p>
                <p className="text-sm mt-1 whitespace-pre-wrap">{m.body}</p>
              </div>
            ))}
            {can(user.role, "register") ? <MemoComposer combinationId={d.id} isMiss={d.judge === "miss"} /> : null}
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <RelatedTable title="同じクリエイティブ × 別の記事" head="記事" rows={related.sameCreative} />
          <RelatedTable title="同じ記事 × 別のクリエイティブ" head="クリエイティブ" rows={related.sameArticle} />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <CardTitle>連携情報</CardTitle>
          {d.sb ? (
            <dl className="text-sm grid grid-cols-[8rem_1fr] gap-y-1.5">
              <dt className="text-ink-3">beyondページ</dt><dd>{d.sb.pageName ?? "—"}</dd>
              <dt className="text-ink-3">Version</dt><dd>{d.sb.versionName ?? "—"}</dd>
              <dt className="text-ink-3">クリエイティブ</dt><dd>{d.sb.creativeName ?? "—"}</dd>
              <dt className="text-ink-3">最終取得日時</dt><dd>{dateTime(d.sb.fetchedAt)}</dd>
            </dl>
          ) : d.dpro ? (
            <dl className="text-sm grid grid-cols-[8rem_1fr] gap-y-1.5">
              <dt className="text-ink-3">広告主</dt><dd>{d.dpro.advertiser ?? "—"}</dd>
              <dt className="text-ink-3">取得日</dt><dd>{date(d.dpro.fetchedAt)}</dd>
              <dt className="text-ink-3">元データ</dt><dd>{d.dpro.detailUrl ? <a href={d.dpro.detailUrl} target="_blank" rel="noreferrer noopener" className="underline">DProで開く</a> : "—"}</dd>
            </dl>
          ) : (
            <p className="text-sm text-ink-3">手入力・CSVの実績です</p>
          )}
        </Card>
        <Card className={`p-5 ${d.expressionHits.length > 0 ? "border-orange bg-orange-tint" : ""}`}>
          <CardTitle>表現チェック{d.expressionHits.length > 0 ? `：要確認 ${d.expressionHits.length}件` : ""}</CardTitle>
          {d.expressionHits.length > 0 ? (
            <ul className="flex flex-col gap-2 text-sm">
              {d.expressionHits.map((h, i) => (
                <li key={i}>
                  <span className="font-bold">{h.severity === "ng" ? "使用不可" : "要確認"}</span>（{h.field}）「{h.text}」{h.law ? `／${h.law}` : ""}
                  {h.alternative ? `　言い換え案：${h.alternative}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">現在のNG表現辞書に当たる表現はありません</p>
          )}
          <div className="mt-3">
            <LegalNote />
          </div>
        </Card>
      </div>

      <div>
        <LinkButton href={`/generate?ref=${d.id}`} variant="primary" className="md:hidden">
          この組み合わせを参考に生成
        </LinkButton>
      </div>
    </div>
  );
}

function aspect(w: number, h: number): string {
  const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b));
  const d = g(w, h);
  return `${w / d}:${h / d}`;
}

function CreativeMedia({ d }: { d: CombinationDetail }) {
  const src = d.creative.r2Key ? `/api/files/${d.creative.r2Key}` : null;
  const box = "relative w-full sm:w-[200px] h-[356px] shrink-0 bg-ink-3 overflow-hidden flex items-center justify-center";
  if (src && d.creative.kind === "video") {
    return (
      <div className={box}>
        <video src={src} controls preload="metadata" className="w-full h-full object-contain" />
      </div>
    );
  }
  if (src) {
    return (
      <a href={src} target="_blank" rel="noreferrer" className={`${box} bg-thumb`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- private R2 file */}
        <img src={src} alt="バナー" className="w-full h-full object-contain" />
      </a>
    );
  }
  return (
    <div className={box}>
      {d.creative.sourceUrl ? (
        <a href={d.creative.sourceUrl} target="_blank" rel="noreferrer noopener" className="flex size-14 items-center justify-center bg-white text-2xl" aria-label="クリエイティブを開く">
          ▶
        </a>
      ) : (
        <span className="text-white text-xs">ファイル未登録</span>
      )}
    </div>
  );
}

function RelatedTable({ title, head, rows }: { title: string; head: string; rows: RelatedRow[] }) {
  return (
    <Card className="p-5">
      <CardTitle>{title}</CardTitle>
      {rows.length <= 1 ? (
        <p className="text-sm text-ink-3">まだありません</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ink-3 border-b border-line-3">
              <th className="text-left font-normal py-2 px-1.5">{head}</th>
              <th className="text-left font-normal py-2 px-1.5 w-20">CPA</th>
              <th className="text-left font-normal py-2 px-1.5 w-20">MCVR</th>
              <th className="text-left font-normal py-2 px-1.5 w-20">判定</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line-3">
                <td className={`py-2.5 px-1.5 ${r.isSelf ? "font-bold" : ""}`}>{r.isSelf ? `${r.label}（この組み合わせ）` : <Link className="hover:underline" href={`/combinations/${r.id}`}>{r.label}</Link>}</td>
                <td className="py-2.5 px-1.5">{yen(r.cpa)}</td>
                <td className="py-2.5 px-1.5">{pct(r.mcvr)}</td>
                <td className={`py-2.5 px-1.5 ${r.judge === "hit" ? "text-red font-bold" : r.judge === "miss" ? "font-bold" : ""}`}>{r.judge ? JUDGE_LABEL[r.judge] : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
