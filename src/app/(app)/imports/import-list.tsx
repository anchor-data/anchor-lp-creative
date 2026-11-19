"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DproCandidate } from "@/server/services/candidates";
import { mediaLabel } from "@/lib/domain/constants";
import { yenCompact } from "@/lib/format";
import { Button, Checkbox, Select } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";

const LP_LABEL = { article: "記事LP", product: "商品LP直行？", unknown: "判定不能" } as const;

export function ImportList({ items, categories }: { items: DproCandidate[]; categories: { id: string; label: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set(items.filter((i) => i.lpType === "article" && i.categoryId).map((i) => i.id)));
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast.info(done);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const approve = (ids: string[]) => run(() => api("/api/dpro/candidates/approve", { method: "POST", json: { ids } }), `${ids.length}件を市場事例として承認しました`);

  return (
    <>
      <div className="flex justify-end -mt-14 mb-2">
        <Button variant="dark" disabled={busy || selected.size === 0} onClick={() => approve([...selected])}>
          選んだものを一括承認（{selected.size}）
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        {items.map((c) => (
          <div key={c.id} className="bg-white border border-line p-4 flex flex-col lg:flex-row gap-4 lg:items-center">
            <Checkbox checked={selected.has(c.id)} onChange={(v) => setSelected((s) => { const n = new Set(s); if (v) n.add(c.id); else n.delete(c.id); return n; })} />
            <div className="flex gap-1.5 shrink-0">
              <div className="w-[52px] h-[90px] bg-ink-3 flex items-end justify-center text-[10px] text-white pb-1">動画</div>
              <div className="w-[52px] h-[90px] bg-thumb-2 border border-dashed border-line-2 flex items-end justify-center text-[10px] text-ink-3 pb-1">記事LP</div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold">{c.productName ?? "（商材名なし）"} × {c.lpType === "product" ? "商品LP" : `記事「${(c.adText ?? "").replace(/（.*）$/, "").slice(0, 30)}」`}</p>
              <p className="text-xs text-ink-3 mt-1">
                広告主：{c.advertiser ?? "—"}　｜　{mediaLabel(c.media ?? "other")}{c.durationSec ? `・動画${Math.round(c.durationSec)}秒` : ""}
              </p>
              <p className="text-xs text-ink-3 mt-1">AIが付けたタグ：{c.tags.map((t) => `#${t}`).join(" ") || "—"}</p>
              <div className="mt-2 max-w-sm">
                <Select
                  aria-label="業種カテゴリ"
                  value={c.categoryId ?? ""}
                  onChange={(e) => run(() => api(`/api/dpro/candidates/${c.id}`, { method: "PATCH", json: { categoryId: e.target.value || null } }), "業種カテゴリを変更しました")}
                  className={`h-9 text-xs ${c.categoryId ? "" : "border-red"}`}
                >
                  <option value="">業種カテゴリ未割り当て（承認できません）</option>
                  {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
                </Select>
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-x-8 text-sm shrink-0">
              <div><dt className="text-xs text-ink-3">推定消化額</dt><dd className="font-bold">{yenCompact(c.estSpend)}</dd></div>
              <div><dt className="text-xs text-ink-3">配信日数</dt><dd className="font-bold">{c.deliveryDays ?? "—"}日</dd></div>
              <div><dt className="text-xs text-ink-3">記事LP判定</dt><dd className={`font-bold ${c.lpType === "product" ? "text-red" : ""}`}>{c.lpType ? LP_LABEL[c.lpType] : "—"}</dd></div>
            </dl>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="dark" disabled={busy || !c.categoryId} onClick={() => approve([c.id])}>承認</Button>
              <Button size="sm" disabled={busy} onClick={() => { const reason = window.prompt("却下の理由（任意）") ?? undefined; run(() => api(`/api/dpro/candidates/${c.id}/reject`, { method: "POST", json: { reason } }), "却下しました"); }}>却下</Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
