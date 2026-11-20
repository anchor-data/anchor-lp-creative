"use client";
// STEP5 タグと勝因メモ (Figma 5-5). AI proposes tags when the step opens; the tags feed 傾向分析 (訴求軸・フック種別).
import { useEffect, useRef, useState } from "react";
import { Field, Textarea } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";
import type { FormState } from "../form-state";
import { Note, SectionLabel, type StepProps, type TagOption, type TagTypeOption } from "./shared";

const AI_MIN_CONFIDENCE = 0.4;

export function TagsStep({ state, update, errors, tagTypes, tags, isMiss, attempted }: StepProps & { tagTypes: TagTypeOption[]; tags: TagOption[]; isMiss: boolean; attempted: boolean }) {
  const t = state.tags;
  const toast = useToast();
  const [suggesting, setSuggesting] = useState(false);
  const [picker, setPicker] = useState(false);
  const autoRan = useRef(false);
  const set = (patch: Partial<FormState["tags"]>) => update((s) => ({ ...s, tags: { ...s.tags, ...patch } }));
  const chosenIds = [...new Set([...t.aiTagIds, ...t.tagIds])];
  const chosen = new Set(chosenIds);
  const typeName = (typeId: string) => tagTypes.find((tt) => tt.id === typeId)?.name ?? "";
  const axisType = tagTypes.find((tt) => tt.required);
  const axisMissing = axisType ? !tags.some((tg) => tg.typeId === axisType.id && chosen.has(tg.id)) : false;

  const remove = (id: string) => set({ tagIds: t.tagIds.filter((x) => x !== id), aiTagIds: t.aiTagIds.filter((x) => x !== id) });
  const toggle = (id: string) => (chosen.has(id) ? remove(id) : set({ tagIds: [...t.tagIds, id] }));

  const suggest = async () => {
    setSuggesting(true);
    try {
      const res = await api<{ items: { id: string; confidence: number }[] }>("/api/ai/tags", {
        method: "POST",
        json: { copy: state.creative.mainCopy, script: state.creative.script.map((r) => r.narration).join("\n"), body: state.article.bodyText.slice(0, 20000) },
      });
      set({ aiTagIds: res.items.filter((i) => i.confidence >= AI_MIN_CONFIDENCE && !t.tagIds.includes(i.id)).map((i) => i.id) });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSuggesting(false);
    }
  };

  // Propose tags on first visit when nothing is chosen yet and there is material to read.
  const hasMaterial = Boolean(state.creative.mainCopy.trim() || state.creative.script.length || state.article.bodyText.trim());
  useEffect(() => {
    if (autoRan.current || chosenIds.length > 0 || !hasMaterial) return;
    autoRan.current = true;
    const timer = setTimeout(() => void suggest(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when the step opens
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <SectionLabel>{suggesting ? "AIがタグを提案しています…" : "AIの提案タグ（外したいものはクリック）"}</SectionLabel>
          <button type="button" className="text-xs underline disabled:text-ink-4" onClick={() => void suggest()} disabled={suggesting || !hasMaterial}>AIで提案し直す</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {chosenIds.map((id) => {
            const tag = tags.find((tg) => tg.id === id);
            if (!tag) return null;
            return (
              <button key={id} type="button" onClick={() => remove(id)} className="h-8 px-3 text-sm bg-orange-tint border border-orange hover:bg-white" title="クリックで外す">
                ✓ {typeName(tag.typeId)}：{tag.name}
              </button>
            );
          })}
          <button type="button" onClick={() => setPicker((v) => !v)} className="h-8 px-3 text-sm bg-white border border-line-2 hover:border-ink" aria-expanded={picker}>
            {picker ? "− 閉じる" : "＋ タグを追加"}
          </button>
        </div>
        <p className={`text-xs ${attempted && axisMissing ? "text-red" : "text-ink-4"}`}>{errors["tags.tagIds"] ?? `${axisType?.name ?? "訴求軸"}のタグは1つ以上必須です`}</p>
      </div>

      {picker ? (
        <div className="border border-line bg-canvas p-4 flex flex-col gap-3">
          {tagTypes.map((tt) => (
            <div key={tt.id}>
              <p className="text-xs text-ink-3 mb-1.5">{tt.name}{tt.required ? "（1つ以上必須）" : ""}</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.filter((tg) => tg.typeId === tt.id).map((tg) => (
                  <button key={tg.id} type="button" onClick={() => toggle(tg.id)} className={`text-xs px-2.5 py-1 border ${chosen.has(tg.id) ? "bg-ink text-white border-ink" : "bg-white border-line-2 hover:border-ink"}`}>
                    {tg.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <Field label={isMiss ? "外れた理由メモ（何が効かなかったと思うか）" : "勝因メモ（何が効いたと思うか）"} error={errors.winMemo} hint="2,000文字以内">
        <Textarea value={t.winMemo} maxLength={2000} onChange={(e) => set({ winMemo: e.target.value })} rows={4} />
      </Field>
      <Field label="次に試したいこと">
        <Textarea value={t.nextMemo} maxLength={2000} onChange={(e) => set({ nextMemo: e.target.value })} rows={3} />
      </Field>
      <Note>登録すると詳細画面に移ります。続けて「同じ商材の外れた組み合わせ」も登録すると、何が効いたかを比べられます。</Note>
    </div>
  );
}
