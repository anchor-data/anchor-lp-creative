import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { ApiError } from "@/server/http";
import { getGeneration, type GenerationView } from "@/server/services/generation";
import { blockLabel } from "@/lib/domain/constants";
import { PrintButton } from "./print-button";

/** 制作指示書の印刷ビュー: the browser's "PDFとして保存" produces the PDF (F-37). */
export default async function PrintPage({ params, searchParams }: PageProps<"/generate/[id]/print">) {
  const user = await requireUser("generate");
  let g: GenerationView;
  try {
    g = await getGeneration(user, (await params).id);
  } catch (err) {
    if (err instanceof ApiError) notFound();
    throw err;
  }
  const sp = await searchParams;
  const v = g.versions.find((x) => String(x.versionNo) === sp.version) ?? g.versions.at(-1);
  if (!v) notFound();
  const p = g.input.product;
  return (
    <div className="bg-white max-w-[800px] mx-auto p-10 text-sm leading-relaxed print:p-0">
      <div className="flex justify-between items-start print:hidden mb-6">
        <p className="text-ink-3">ブラウザの印刷から「PDFとして保存」を選んでください</p>
        <PrintButton />
      </div>
      <h1 className="text-2xl font-bold">制作指示書：{p.name}</h1>
      <p className="text-ink-3 mt-1">第{v.versionNo}版・{v.createdAt.slice(0, 10)}</p>
      <table className="mt-4 w-full border border-line">
        <tbody>
          {[["ターゲット", p.target], ["強み", p.usp], ["価格・オファー", p.offer || "—"], ["使えない表現", p.ngWords || "—"]].map(([k, val]) => (
            <tr key={k} className="border-b border-line"><th className="text-left bg-canvas px-3 py-2 w-36 font-normal">{k}</th><td className="px-3 py-2">{val}</td></tr>
          ))}
        </tbody>
      </table>
      {v.plans.map((plan, i) =>
        plan ? (
          <section key={i} className="mt-8 break-inside-avoid-page">
            <h2 className="text-lg font-bold border-b-2 border-red pb-1">案{i + 1}：{plan.axis}</h2>
            {plan.banner ? (
              <div className="mt-3">
                <h3 className="font-bold">バナー案</h3>
                <ul className="list-disc pl-5">{plan.banner.mainCopies.map((c, j) => <li key={j}>{c}</li>)}</ul>
                <p>サブコピー：{plan.banner.subCopy}</p>
                <p>構図：{plan.banner.composition}</p>
              </div>
            ) : null}
            {plan.video ? (
              <div className="mt-3">
                <h3 className="font-bold">動画案（{plan.video.durationSec}秒）</h3>
                <p>フック案：{plan.video.hooks.join(" ／ ")}</p>
                <table className="w-full border border-line mt-1 text-xs">
                  <thead className="bg-canvas"><tr><th className="px-2 py-1 text-left">秒数</th><th className="px-2 py-1 text-left">映像</th><th className="px-2 py-1 text-left">テロップ</th><th className="px-2 py-1 text-left">ナレーション</th></tr></thead>
                  <tbody>{plan.video.scenes.map((s, j) => <tr key={j} className="border-t border-line"><td className="px-2 py-1 whitespace-nowrap">{s.from}〜{s.to}秒</td><td className="px-2 py-1">{s.visual}</td><td className="px-2 py-1">{s.telop}</td><td className="px-2 py-1">{s.narration}</td></tr>)}</tbody>
                </table>
              </div>
            ) : null}
            <div className="mt-3">
              <h3 className="font-bold">記事LP案</h3>
              <p><b>タイトル：</b>{plan.article.title}</p>
              <p><b>ファーストビュー：</b>{plan.article.firstView}</p>
              <ol className="list-decimal pl-5 mt-1">{plan.article.blocks.map((b, j) => <li key={j} className="mt-1"><b>{blockLabel(b.type)}：{b.heading}</b><p className="whitespace-pre-wrap">{b.body}</p></li>)}</ol>
              <p className="mt-1"><b>CTA：</b>{plan.article.cta}</p>
            </div>
            {plan.checks.expression.length > 0 ? (
              <div className="mt-3 bg-orange-tint p-3">
                <h3 className="font-bold">表現チェック</h3>
                <ul className="list-disc pl-5">{plan.checks.expression.map((e, j) => <li key={j}>「{e.text}」{e.law ? `（${e.law}）` : ""}{e.alternative ? ` → ${e.alternative}` : ""}</li>)}</ul>
              </div>
            ) : null}
          </section>
        ) : null,
      )}
      <p className="text-xs text-ink-4 mt-8">※ 表現チェックは補助です。広告表現の最終判断は担当者が行ってください。</p>
    </div>
  );
}
