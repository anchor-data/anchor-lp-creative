"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AdminCategory } from "@/server/services/admin";
import type { CategoryCriteria } from "@/server/services/judging";
import { JUDGE_LABEL, METRIC_LABEL } from "@/lib/domain/constants";
import type { JudgeResult } from "@/lib/domain/judge";
import { Button, Card, Checkbox, Field, Input, Select } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";

export function CategoriesAdmin({ categories, owners }: { categories: AdminCategory[]; owners: { id: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(categories.find((c) => c.parentId)?.id ?? null);
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState<string>("");
  const parents = categories.filter((c) => !c.parentId);

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.info(msg);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="flex flex-col xl:flex-row gap-5 items-start">
      <Card className="p-4 w-full xl:w-80 shrink-0">
        {parents.map((p) => (
          <div key={p.id} className="mb-3">
            <div className="flex items-center justify-between">
              <span className={`text-sm font-bold ${p.isActive ? "" : "text-ink-4 line-through"}`}>{p.name}</span>
              <button type="button" className="text-xs underline" onClick={() => { const name = window.prompt("新しい名称", p.name); if (name) run(() => api(`/api/admin/categories/${p.id}`, { method: "PATCH", json: { name } }), "名称を変更しました"); }}>名称変更</button>
            </div>
            {categories.filter((c) => c.parentId === p.id).map((c) => (
              <button key={c.id} type="button" onClick={() => setSelected(c.id)} className={`w-full flex justify-between px-3 py-2 text-sm ${selected === c.id ? "bg-orange-tint" : "hover:bg-canvas"} ${c.isActive ? "" : "text-ink-4"}`}>
                <span>{c.name}{c.isActive ? "" : "（無効）"}</span>
                <span className="text-ink-3">{c.caseCount}</span>
              </button>
            ))}
          </div>
        ))}
        <div className="border-t border-line-3 pt-3 flex flex-col gap-2">
          <Select value={newParent} onChange={(e) => setNewParent(e.target.value)} className="h-9 text-xs">
            <option value="">大分類として追加</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.name} の中分類として追加</option>)}
          </Select>
          <div className="flex gap-2">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="カテゴリ名" className="h-9" />
            <Button size="sm" variant="dark" disabled={!newName.trim()} onClick={() => run(async () => { await api("/api/admin/categories", { method: "POST", json: { name: newName, parentId: newParent || null } }); setNewName(""); }, "追加しました")}>追加</Button>
          </div>
        </div>
      </Card>
      {selected ? <CriteriaEditor key={selected} category={categories.find((c) => c.id === selected)!} owners={owners} onChanged={() => router.refresh()} /> : null}
    </div>
  );
}

function CriteriaEditor({ category, owners, onChanged }: { category: AdminCategory; owners: { id: string; name: string }[]; onChanged: () => void }) {
  const toast = useToast();
  const [criteria, setCriteria] = useState<CategoryCriteria | null>(null);
  const [preview, setPreview] = useState<{ total: number; changes: Record<string, number> } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<CategoryCriteria>(`/api/admin/judge-rules/${category.id}`).then(setCriteria).catch((err) => toast.error(errorMessage(err)));
  }, [category.id, toast]);

  if (!criteria) return <div className="skeleton h-96 flex-1" />;
  const ORDER = ["spend", "cpa", "mcvr", "cv", "fsver", "oar"] as const;
  const rules = ORDER.map((m) => criteria.rules.find((r) => r.metric === m) ?? { metric: m, enabled: false, direction: m === "cpa" || m === "fsver" ? ("lte" as const) : ("gte" as const), hit: null, fair: null, early: null });
  const setRule = (m: string, patch: Partial<(typeof rules)[number]>) => { setPreview(null); setCriteria({ ...criteria, rules: rules.map((r) => (r.metric === m ? { ...r, ...patch } : r)) }); };
  const setSettings = (patch: Partial<CategoryCriteria["settings"]>) => { setPreview(null); setCriteria({ ...criteria, settings: { ...criteria.settings, ...patch } }); };
  const n = (v: string): number | null => (v.trim() === "" ? null : Number(v));
  const body = { rules, settings: criteria.settings };

  return (
    <Card className="p-6 flex-1 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-bold">{category.name}の当たり基準</h2>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-ink-3">カテゴリ担当</span>
          <Select value={category.ownerUserId ?? ""} className="h-9 w-48" onChange={async (e) => { try { await api(`/api/admin/categories/${category.id}`, { method: "PATCH", json: { ownerUserId: e.target.value || null } }); onChanged(); } catch (err) { toast.error(errorMessage(err)); } }}>
            <option value="">未設定（管理者が承認）</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
          <Button size="sm" onClick={async () => { try { await api(`/api/admin/categories/${category.id}`, { method: "PATCH", json: { isActive: !category.isActive } }); onChanged(); } catch (err) { toast.error(errorMessage(err)); } }}>{category.isActive ? "無効化" : "有効化"}</Button>
        </div>
      </div>
      <table className="w-full text-sm mb-5">
        <thead>
          <tr className="text-xs text-ink-3 border-b border-line-3">
            <th className="text-left font-normal py-2">指標</th><th className="text-left font-normal">使う</th><th className="text-left font-normal">良い向き</th>
            <th className="text-left font-normal">初期基準（〜{criteria.settings.earlyDays}日）</th><th className="text-left font-normal">当たり（目標）</th><th className="text-left font-normal">まずまず</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.metric} className="border-b border-line-3">
              <td className="py-2 font-medium">{METRIC_LABEL[r.metric]}</td>
              <td><Checkbox checked={r.enabled} onChange={(v) => setRule(r.metric, { enabled: v })} /></td>
              <td>
                <Select value={r.direction} onChange={(e) => setRule(r.metric, { direction: e.target.value as "gte" | "lte" })} className="h-8 w-28 text-xs">
                  <option value="gte">大きいほど良い</option><option value="lte">小さいほど良い</option>
                </Select>
              </td>
              {(["early", "hit", "fair"] as const).map((k) => (
                <td key={k} className="pr-2"><Input value={r[k] ?? ""} onChange={(e) => setRule(r.metric, { [k]: n(e.target.value) })} inputMode="decimal" className="h-8 w-28" placeholder="空欄＝使わない" /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5 mb-5">
        <Field label="判定期間">
          <Select value={criteria.settings.windowType} onChange={(e) => setSettings({ windowType: e.target.value as "cumulative" | "last_n_days" })} className="h-9"><option value="cumulative">配信開始からの累計</option><option value="last_n_days">直近N日</option></Select>
        </Field>
        <Field label="直近N日"><Input value={criteria.settings.windowDays ?? ""} disabled={criteria.settings.windowType !== "last_n_days"} onChange={(e) => setSettings({ windowDays: n(e.target.value) })} className="h-9" /></Field>
        <Field label="最低配信日数"><Input value={criteria.settings.minDays} onChange={(e) => setSettings({ minDays: Number(e.target.value) || 0 })} className="h-9" /></Field>
        <Field label="最低配信金額（円）"><Input value={criteria.settings.minSpend} onChange={(e) => setSettings({ minSpend: Number(e.target.value) || 0 })} className="h-9" /></Field>
        <Field label="初期期間（日）"><Input value={criteria.settings.earlyDays} onChange={(e) => setSettings({ earlyDays: Number(e.target.value) || 0 })} className="h-9" /></Field>
      </div>
      {preview ? (
        <div className="bg-orange-tint border border-orange px-4 py-3 text-sm mb-4">
          対象 {preview.total}件のうち、判定が変わるのは {Object.values(preview.changes).reduce((a, b) => a + b, 0)}件です。
          {Object.entries(preview.changes).map(([k, v]) => { const [a, b] = k.split("->") as [JudgeResult, JudgeResult]; return <span key={k} className="ml-2">{JUDGE_LABEL[a] ?? a}→{JUDGE_LABEL[b] ?? b}：{v}件</span>; })}
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button disabled={busy} onClick={async () => { setBusy(true); try { setPreview(await api(`/api/admin/judge-rules/${category.id}/preview`, { method: "POST", json: body })); } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); } }}>変わる件数を確認</Button>
        <Button variant="primary" disabled={busy || !preview} onClick={async () => { setBusy(true); try { const r = await api<{ total: number; changed: number }>(`/api/admin/judge-rules/${category.id}`, { method: "PUT", json: body }); toast.info(`保存しました。${r.total}件を再判定し、${r.changed}件の判定が変わりました`); setPreview(null); onChanged(); } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); } }}>保存して再判定</Button>
      </div>
    </Card>
  );
}
