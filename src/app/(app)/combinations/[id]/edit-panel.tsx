"use client";
// S-03 「編集」: edits a registered combination in place (replaces the old 「判定を手動で変える」).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MEDIA } from "@/lib/domain/constants";
import { combinationEditSchema, type CombinationEdit, type EditJudge } from "@/lib/domain/combination-edit";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";
import { CategorySelect, type CategoryOption } from "../../register/steps/shared";

export interface EditInitial {
  updatedAt: string;
  productName: string;
  categoryId: string;
  articleTitle: string;
  media: string;
  startDate: string;
  endDate: string | null;
  targetCpa: number | null;
  judge: EditJudge;
  judgeReason: string;
}

export interface EditPanelProps {
  id: string;
  initial: EditInitial;
  categories: CategoryOption[];
  /** Metrics come from Squad beyond / DPro by media, so media stays fixed. */
  mediaLocked: boolean;
  /** Market cases have no own judgment. */
  market: boolean;
  onClose: () => void;
}

interface FormValues {
  productName: string;
  categoryId: string;
  articleTitle: string;
  media: string;
  startDate: string;
  endDate: string;
  targetCpa: string;
  judge: EditJudge;
  judgeReason: string;
}

function toForm(i: EditInitial): FormValues {
  return { ...i, endDate: i.endDate ?? "", targetCpa: i.targetCpa === null ? "" : String(i.targetCpa) };
}

function toInput(v: FormValues, updatedAt: string): unknown {
  const cpa = v.targetCpa.replaceAll(",", "").trim();
  return { ...v, updatedAt, endDate: v.endDate || null, targetCpa: cpa === "" ? null : Number(cpa) };
}

export function EditPanel({ id, initial, categories, mediaLocked, market, onClose }: EditPanelProps) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState<FormValues>(() => toForm(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<FormValues>) => setV((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    const parsed = combinationEditSchema.safeParse(toInput(v, initial.updatedAt));
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "form"), i.message])));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await api(`/api/combinations/${id}`, { method: "PATCH", json: parsed.data satisfies CombinationEdit });
      toast.info("保存しました");
      onClose();
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white border border-line-2 p-4 w-full md:w-[560px] flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="商材名" required error={errors.productName} hint="同じ商材の他の事例にも反映されます">
          <Input value={v.productName} onChange={(e) => set({ productName: e.target.value })} invalid={Boolean(errors.productName)} />
        </Field>
        <Field label="業種カテゴリ" required error={errors.categoryId} hint="変えると同じ商材の事例の自動判定を計算し直します">
          <CategorySelect value={v.categoryId} onChange={(categoryId) => set({ categoryId })} categories={categories} invalid={Boolean(errors.categoryId)} />
        </Field>
      </div>
      <Field label="記事タイトル" error={errors.articleTitle}>
        <Input value={v.articleTitle} onChange={(e) => set({ articleTitle: e.target.value })} invalid={Boolean(errors.articleTitle)} />
      </Field>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="媒体" required error={errors.media} hint={mediaLocked ? "連携データの事例は変えられません" : undefined}>
          <Select value={v.media} onChange={(e) => set({ media: e.target.value })} disabled={mediaLocked}>
            {MEDIA.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
          </Select>
        </Field>
        <Field label="配信開始日" required error={errors.startDate}>
          <Input type="date" value={v.startDate} onChange={(e) => set({ startDate: e.target.value })} invalid={Boolean(errors.startDate)} />
        </Field>
        <Field label="配信終了日" error={errors.endDate} hint="配信中なら空欄">
          <Input type="date" value={v.endDate} onChange={(e) => set({ endDate: e.target.value })} invalid={Boolean(errors.endDate)} />
        </Field>
      </div>
      {market ? null : (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="目標CPA（円）" error={errors.targetCpa}>
            <Input inputMode="numeric" value={v.targetCpa} onChange={(e) => set({ targetCpa: e.target.value })} invalid={Boolean(errors.targetCpa)} />
          </Field>
          <Field label="判定" error={errors.judge}>
            <Select value={v.judge} onChange={(e) => set({ judge: e.target.value as EditJudge })}>
              <option value="auto">自動判定に任せる</option>
              <option value="hit">当たり（手動）</option>
              <option value="fair">まずまず（手動）</option>
              <option value="miss">外れ（手動）</option>
            </Select>
          </Field>
        </div>
      )}
      {!market && v.judge !== "auto" ? (
        <Field label="手動判定の理由（任意）" hint="500文字以内。例：CPA目標内・消化額基準クリア" error={errors.judgeReason}>
          <Textarea value={v.judgeReason} onChange={(e) => set({ judgeReason: e.target.value })} />
        </Field>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onClose} disabled={busy}>やめる</Button>
        <Button size="sm" variant="primary" onClick={() => void save()} disabled={busy} aria-busy={busy}>保存</Button>
      </div>
    </div>
  );
}
