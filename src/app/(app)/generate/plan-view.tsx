"use client";
import { useState } from "react";
import type { Plan } from "@/lib/domain/plan";
import { blockLabel } from "@/lib/domain/constants";
import { Button, Input, Textarea } from "@/components/ui";

export interface RefTitle {
  id: string;
  title: string;
}

export type RegenTarget = { kind: "copy" } | { kind: "article-structure" } | { kind: "video-hook" } | { kind: "block"; index: number } | { kind: "whole" };

function Box({ title, tone, children }: { title: string; tone?: "warn" | "plain"; children: React.ReactNode }) {
  return (
    <div className={`px-4 py-3.5 ${tone === "warn" ? "bg-orange-tint border border-orange" : tone === "plain" ? "bg-white border border-line" : "bg-canvas"}`}>
      <p className="text-xs font-bold text-ink-3 mb-2">{title}</p>
      {children}
    </div>
  );
}

export function PlanView({ plan, refs, busy, onRegenerate, onSave }: { plan: Plan; refs: RefTitle[]; busy: boolean; onRegenerate: (t: RegenTarget) => void; onSave: (p: Plan) => void }) {
  const [editing, setEditing] = useState<Plan | null>(null);
  const p = editing ?? plan;
  const set = (patch: Partial<Plan>) => setEditing({ ...p, ...patch });
  const refTitle = (id: string) => refs.find((r) => r.id === id)?.title ?? "参照事例";

  return (
    <div className="flex flex-col gap-3.5">
      <p className="font-bold">訴求軸：{p.axis}</p>

      {p.banner ? (
        <Box title="バナー案（メインコピー）">
          {editing ? (
            <div className="flex flex-col gap-2">
              {p.banner.mainCopies.map((c, i) => (
                <Input key={i} value={c} className="h-9" onChange={(e) => set({ banner: { ...p.banner!, mainCopies: p.banner!.mainCopies.map((x, j) => (j === i ? e.target.value : x)) } })} />
              ))}
              <Input value={p.banner.subCopy} className="h-9" placeholder="サブコピー" onChange={(e) => set({ banner: { ...p.banner!, subCopy: e.target.value } })} />
            </div>
          ) : (
            <ul className="flex flex-col gap-2 text-[15px]">
              {p.banner.mainCopies.map((c, i) => <li key={i}>・{c}</li>)}
              {p.banner.subCopy ? <li className="text-sm text-ink-3">サブコピー：{p.banner.subCopy}</li> : null}
              {p.banner.composition ? <li className="text-sm text-ink-3">構図：{p.banner.composition}</li> : null}
            </ul>
          )}
        </Box>
      ) : null}

      {p.video ? (
        <Box title={`動画案（${p.video.durationSec}秒・台本）`}>
          {p.video.hooks.length > 0 ? <p className="text-sm mb-2">フック案：{p.video.hooks.join(" ／ ")}</p> : null}
          <ol className="flex flex-col gap-2">
            {p.video.scenes.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="w-[72px] shrink-0 text-ink-3">{s.from}〜{s.to}秒</span>
                {editing ? (
                  <Input value={s.narration} className="h-8" onChange={(e) => set({ video: { ...p.video!, scenes: p.video!.scenes.map((x, j) => (j === i ? { ...x, narration: e.target.value } : x)) } })} />
                ) : (
                  <span>{[s.narration, s.telop && `［テロップ］${s.telop}`, s.visual && `［映像］${s.visual}`].filter(Boolean).join(" ")}</span>
                )}
              </li>
            ))}
          </ol>
        </Box>
      ) : null}

      <Box title="記事LP案">
        {editing ? (
          <div className="flex flex-col gap-2">
            <Input value={p.article.title} className="h-9" onChange={(e) => set({ article: { ...p.article, title: e.target.value } })} />
            <Textarea value={p.article.firstView} rows={2} onChange={(e) => set({ article: { ...p.article, firstView: e.target.value } })} />
          </div>
        ) : (
          <>
            <p className="font-bold text-[15px]">タイトル：{p.article.title}</p>
            {p.article.firstView ? <p className="text-sm mt-1">ファーストビュー：{p.article.firstView}</p> : null}
            <p className="text-sm mt-2">構成：{p.article.blocks.map((b) => blockLabel(b.type)).join(" → ")}</p>
          </>
        )}
        <details className="mt-2">
          <summary className="text-xs text-ink-3 cursor-pointer">各ブロックの本文を見る</summary>
          <ol className="flex flex-col gap-3 mt-2">
            {p.article.blocks.map((b, i) => (
              <li key={i} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">{i + 1}. {blockLabel(b.type)}：{b.heading}</span>
                  {!editing ? <Button size="xs" disabled={busy} onClick={() => onRegenerate({ kind: "block", index: i })}>このブロックだけ作り直す</Button> : null}
                </div>
                {editing ? (
                  <Textarea value={b.body} rows={3} onChange={(e) => set({ article: { ...p.article, blocks: p.article.blocks.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) } })} />
                ) : (
                  <p className="whitespace-pre-wrap text-ink-2 mt-1">{b.body}</p>
                )}
              </li>
            ))}
          </ol>
          {p.article.cta ? <p className="text-sm mt-2">CTA：{p.article.cta}</p> : null}
        </details>
      </Box>

      <Box title="参考にしたもの" tone="plain">
        <ul className="text-sm flex flex-col gap-1">
          {p.rationale.inherited.map((inh, i) => (
            <li key={i}>
              <a href={`/combinations/${inh.combinationId}`} target="_blank" rel="noreferrer" className="underline">{refTitle(inh.combinationId)}</a>（{inh.element}）
            </li>
          ))}
          {p.rationale.playbookItemsUsed.map((item, i) => <li key={`pb${i}`}>勝ちパターン集「{item}」</li>)}
          {p.rationale.aim ? <li className="text-ink-3">狙い：{p.rationale.aim}</li> : null}
        </ul>
      </Box>

      {p.checks.expression.length > 0 || p.checks.similarity.length > 0 ? (
        <Box title={`表現チェック：要確認 ${p.checks.expression.length + p.checks.similarity.length}件`} tone="warn">
          <ul className="text-sm flex flex-col gap-1.5">
            {p.checks.expression.map((e, i) => (
              <li key={i}>「{e.text}」は{e.law ? `${e.law}上、` : ""}{e.severity === "ng" ? "使用できない表現" : "注意が必要な表現"}の可能性があります。{e.alternative ? `言い換え案：「${e.alternative}」` : ""}</li>
            ))}
            {p.checks.similarity.map((s, i) => (
              <li key={`s${i}`}>「{s.text}」は参照事例（{refTitle(s.combinationId)}）の表現に近いです（類似度 {s.score.toFixed(2)}）</li>
            ))}
          </ul>
        </Box>
      ) : (
        <Box title="表現チェック" tone="plain"><p className="text-sm text-ink-3">NG表現辞書に当たる表現はありません</p></Box>
      )}

      <div className="flex flex-wrap gap-2.5 pt-4">
        {editing ? (
          <>
            <Button variant="dark" disabled={busy} onClick={() => { onSave(editing); setEditing(null); }}>保存（版を増やす）</Button>
            <Button onClick={() => setEditing(null)}>編集をやめる</Button>
          </>
        ) : (
          <>
            {p.banner || p.video ? <Button disabled={busy} onClick={() => onRegenerate({ kind: "copy" })}>コピーだけ作り直す</Button> : null}
            <Button disabled={busy} onClick={() => onRegenerate({ kind: "article-structure" })}>記事の構成だけ作り直す</Button>
            <Button disabled={busy} onClick={() => setEditing(plan)}>手で編集</Button>
          </>
        )}
      </div>
    </div>
  );
}
