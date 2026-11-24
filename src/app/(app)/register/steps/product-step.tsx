"use client";
// STEP1 商材 (Figma 5-1)
import { useEffect, useState } from "react";
import { Field, Input } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import type { ExistingProductInfo, FormState } from "../form-state";
import { CategorySelect, Note, ReadonlyValue, Toggle, ToggleGroup, type CategoryOption, type StepProps } from "./shared";

interface ProductHit {
  id: string;
  name: string;
  clientName: string;
  categoryId: string;
  categoryName: string;
  target: string;
  priceRange: string | null;
  offer: string | null;
  usp: string | null;
}

function infoOf(h: ProductHit): ExistingProductInfo {
  return { clientName: h.clientName, categoryName: h.categoryName, target: h.target, priceRange: h.priceRange ?? "", offer: h.offer ?? "", usp: h.usp ?? "" };
}

export function ProductStep({ state, update, errors, categories }: StepProps & { categories: CategoryOption[] }) {
  const p = state.product;
  const set = (patch: Partial<FormState["product"]>) => update((s) => ({ ...s, product: { ...s.product, ...patch } }));

  return (
    <div className="flex flex-col gap-5">
      <ToggleGroup>
        <Toggle active={p.mode === "existing"} onClick={() => set({ mode: "existing" })}>登録済みの商材から選ぶ</Toggle>
        <Toggle active={p.mode === "new"} onClick={() => set({ mode: "new" })}>新しい商材を登録する</Toggle>
      </ToggleGroup>
      {p.mode === "existing" ? <ExistingProduct state={state} set={set} error={errors.id} /> : <NewProduct state={state} set={set} errors={errors} categories={categories} />}
      <Note>新しい商材を登録する場合、同じクライアントに同名の商材があると「既存の商材を使いますか？」と確認します。</Note>
    </div>
  );
}

interface PartProps {
  state: FormState;
  set: (patch: Partial<FormState["product"]>) => void;
}

function ExistingProduct({ state, set, error }: PartProps & { error?: string }) {
  const p = state.product;
  const toast = useToast();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<ProductHit[] | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      try {
        const res = await api<{ items: ProductHit[] }>(`/api/products?q=${encodeURIComponent(q)}`);
        setHits(res.items);
      } catch (err) {
        toast.error(errorMessage(err));
        setHits([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, open, toast]);

  const choose = (h: ProductHit) => {
    set({ id: h.id, label: `${h.name}（${h.categoryName}）`, categoryIdOfExisting: h.categoryId, existingInfo: infoOf(h) });
    setOpen(false);
    setQ("");
  };
  const info = p.existingInfo;

  return (
    <>
      <Field label="商材（クライアント名・商材名で検索）" required error={error}>
        <div className="relative">
          <Input
            value={open ? q : p.label}
            placeholder="商材名・クライアント名を入力"
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => setQ(e.target.value)}
            invalid={Boolean(error)}
            role="combobox"
            aria-expanded={open}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px]" aria-hidden>▾</span>
          {open ? (
            <ul className="absolute z-20 left-0 right-0 top-12 bg-white border border-line-2 divide-y divide-line-3 max-h-72 overflow-auto" role="listbox">
              {(hits ?? []).map((h) => (
                <li key={h.id}>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(h)} className={`w-full text-left px-3 py-2.5 text-sm ${p.id === h.id ? "bg-orange-tint" : "hover:bg-canvas"}`}>
                    <span className="font-bold">{h.name}</span>
                    <span className="text-ink-3 ml-2">（クライアント：{h.clientName}）・{h.categoryName}</span>
                  </button>
                </li>
              ))}
              {hits === null ? <li className="px-3 py-2.5 text-sm text-ink-3">検索しています…</li> : null}
              {hits?.length === 0 ? <li className="px-3 py-2.5 text-sm text-ink-3">該当する商材がありません。「新しい商材を登録する」から登録してください。</li> : null}
            </ul>
          ) : null}
        </div>
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="業種カテゴリ（自動）"><ReadonlyValue>{info?.categoryName}</ReadonlyValue></Field>
        <Field label="クライアント名（自動）"><ReadonlyValue>{info?.clientName}</ReadonlyValue></Field>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="ターゲット"><ReadonlyValue>{info?.target}</ReadonlyValue></Field>
        <Field label="価格帯"><ReadonlyValue>{info?.priceRange}</ReadonlyValue></Field>
        <Field label="オファー"><ReadonlyValue>{info?.offer}</ReadonlyValue></Field>
      </div>
      <Field label="強み（USP）"><ReadonlyValue>{info?.usp}</ReadonlyValue></Field>
    </>
  );
}

function NewProduct({ state, set, errors, categories }: PartProps & { errors: Record<string, string>; categories: CategoryOption[] }) {
  const confirm = useConfirm();
  const p = state.product;
  // "同じクライアントで同名の商材があれば確認"
  const checkSame = async () => {
    if (!p.name.trim() || !p.clientName.trim()) return;
    const res = await api<{ existingId: string | null }>(`/api/products?name=${encodeURIComponent(p.name.trim())}&clientName=${encodeURIComponent(p.clientName.trim())}`);
    if (res.existingId && await confirm({ title: "既存の商材を使いますか？", message: "同じクライアントで同名の商材が登録されています。", confirmLabel: "既存の商材を使う", cancelLabel: "新しく登録する" })) {
      set({ mode: "existing", id: res.existingId, label: `${p.name}（${p.clientName}）`, categoryIdOfExisting: p.categoryId, existingInfo: null });
    }
  };

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="商材名" required error={errors.name}>
          <Input value={p.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} onBlur={checkSame} invalid={Boolean(errors.name)} />
        </Field>
        <Field label="クライアント名" required error={errors.clientName}>
          <Input value={p.clientName} onChange={(e) => set({ clientName: e.target.value })} onBlur={checkSame} invalid={Boolean(errors.clientName)} />
        </Field>
      </div>
      <Field label="業種カテゴリ（中分類）" required error={errors.categoryId}>
        <CategorySelect value={p.categoryId} onChange={(v) => set({ categoryId: v })} categories={categories} invalid={Boolean(errors.categoryId)} />
      </Field>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="ターゲット（性別）">
          <Input value={p.targetGender} onChange={(e) => set({ targetGender: e.target.value })} placeholder="女性" />
        </Field>
        <Field label="ターゲット（年代）">
          <Input value={p.targetAge} onChange={(e) => set({ targetAge: e.target.value })} placeholder="40代" />
        </Field>
        <Field label="ターゲットの悩み">
          <Input value={p.targetPain} onChange={(e) => set({ targetPain: e.target.value })} placeholder="乾燥の悩み" />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="価格帯">
          <Input value={p.priceRange} onChange={(e) => set({ priceRange: e.target.value })} placeholder="3,000〜5,000円" />
        </Field>
        <Field label="オファー">
          <Input value={p.offer} onChange={(e) => set({ offer: e.target.value })} placeholder="初回限定価格" />
        </Field>
      </div>
      <Field label="強み（USP）">
        <Input value={p.usp} onChange={(e) => set({ usp: e.target.value })} placeholder="セラミド3種配合で朝まで保湿が続く" />
      </Field>
    </>
  );
}
