"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ListQuery, CategoryNode } from "@/server/services/combination-list";
import { JUDGE_LABEL, MEDIA, SORTS } from "@/lib/domain/constants";
import { Button, Checkbox, Input, Pill, Select } from "@/components/ui";

interface Option {
  id: string;
  name: string;
}

function Popover({ label, active, children }: { label: string; active?: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <Pill active={active} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {label} ▾
      </Pill>
      {open ? <div className="absolute left-0 top-11 z-30 bg-white border border-line-2 p-4 min-w-64">{children(() => setOpen(false))}</div> : null}
    </div>
  );
}

const ORIGIN_LABEL = { all: "すべて", own: "自社実績", market: "市場事例" } as const;

export function GalleryFilters({ query, axisTags, hookTags, categories }: { query: ListQuery; axisTags: Option[]; hookTags: Option[]; categories: CategoryNode[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const update = (mut: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(search.toString());
    mut(p);
    p.delete("cursor");
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  };
  const setList = (key: string, values: readonly string[]) =>
    update((p) => {
      p.delete(key);
      values.forEach((v) => p.append(key, v));
    });
  const toggle = (list: readonly string[], v: string): string[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const judgeSummary = query.judge.length === 0 || query.judge.length === 4 ? "すべて" : query.judge.length === 1 && query.judge[0] === "hit" ? "当たりのみ" : query.judge.map((j) => JUDGE_LABEL[j]).join("・");
  const kindSummary = query.kind.length === 1 ? (query.kind[0] === "video" ? "動画" : "バナー") : "動画・バナー";
  const selectedTags = [...axisTags, ...hookTags].filter((t) => query.tag.includes(t.id));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="lg:hidden">
          <Select aria-label="業種カテゴリ" value={query.category ?? ""} onChange={(e) => update((p) => (e.target.value ? p.set("category", e.target.value) : p.delete("category")))} className="h-10">
            <option value="">すべてのカテゴリ</option>
            {categories.map((c) => (
              <optgroup key={c.id} label={c.name}>
                {c.children.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name}（{ch.count}）
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>

        <Popover label={`取得元：${ORIGIN_LABEL[query.origin]}`} active={query.origin !== "all"}>
          {(close) => (
            <div className="flex flex-col gap-2">
              {(["all", "own", "market"] as const).map((o) => (
                <button key={o} type="button" className={`text-left text-sm px-2 py-1.5 ${query.origin === o ? "bg-orange-tint" : "hover:bg-canvas"}`} onClick={() => { update((p) => (o === "all" ? p.delete("origin") : p.set("origin", o))); close(); }}>
                  {ORIGIN_LABEL[o]}
                </button>
              ))}
            </div>
          )}
        </Popover>

        <Popover label={`判定：${judgeSummary}`}>
          {() => (
            <div className="flex flex-col gap-2.5">
              {(["hit", "fair", "miss", "pending"] as const).map((j) => (
                <Checkbox key={j} checked={query.judge.includes(j)} label={JUDGE_LABEL[j]} onChange={() => setList("judge", toggle(query.judge, j))} />
              ))}
              <p className="text-xs text-ink-4">市場事例は「当たり推定」として当たりに含まれます</p>
            </div>
          )}
        </Popover>

        <Popover label={`種別：${kindSummary}`}>
          {() => (
            <div className="flex flex-col gap-2.5">
              {(["video", "banner"] as const).map((k) => (
                <Checkbox key={k} checked={query.kind.length === 0 || query.kind.includes(k)} label={k === "video" ? "動画" : "バナー"} onChange={() => {
                  const current = query.kind.length === 0 ? ["video", "banner"] : query.kind;
                  const next = toggle(current, k);
                  setList("kind", next.length === 2 || next.length === 0 ? [] : next);
                }} />
              ))}
            </div>
          )}
        </Popover>

        <Popover label="訴求軸" active={axisTags.some((t) => query.tag.includes(t.id))}>
          {() => (
            <div className="flex flex-col gap-2.5 max-h-72 overflow-auto">
              {axisTags.map((t) => (
                <Checkbox key={t.id} checked={query.tag.includes(t.id)} label={t.name} onChange={() => setList("tag", toggle(query.tag, t.id))} />
              ))}
            </div>
          )}
        </Popover>

        <Popover label="フック種別" active={hookTags.some((t) => query.tag.includes(t.id))}>
          {() => (
            <div className="flex flex-col gap-2.5 max-h-72 overflow-auto">
              {hookTags.map((t) => (
                <Checkbox key={t.id} checked={query.tag.includes(t.id)} label={t.name} onChange={() => setList("tag", toggle(query.tag, t.id))} />
              ))}
            </div>
          )}
        </Popover>

        <Popover label="媒体" active={query.media.length > 0}>
          {() => (
            <div className="grid grid-cols-2 gap-2.5">
              {MEDIA.map((m) => (
                <Checkbox key={m.code} checked={query.media.includes(m.code)} label={m.label} onChange={() => setList("media", toggle(query.media, m.code))} />
              ))}
            </div>
          )}
        </Popover>

        <PeriodFilter query={query} onApply={(from, to) => update((p) => { from ? p.set("from", from) : p.delete("from"); to ? p.set("to", to) : p.delete("to"); })} />
        <RangeFilter query={query} onApply={(values) => update((p) => { for (const [k, v] of Object.entries(values)) (v === "" ? p.delete(k) : p.set(k, v)); })} />

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-ink-3">並び順</span>
          <Select aria-label="並び順" value={query.sort} onChange={(e) => update((p) => p.set("sort", e.target.value))} className="h-10 w-44">
            {SORTS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {query.q || selectedTags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {query.q ? (
            <button type="button" className="bg-white border border-line-2 px-3 h-8" onClick={() => update((p) => p.delete("q"))}>
              キーワード：{query.q} ×
            </button>
          ) : null}
          {selectedTags.map((t) => (
            <button key={t.id} type="button" className="bg-white border border-line-2 px-3 h-8" onClick={() => setList("tag", query.tag.filter((x) => x !== t.id))}>
              #{t.name} ×
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PeriodFilter({ query, onApply }: { query: ListQuery; onApply: (from: string, to: string) => void }) {
  const [from, setFrom] = useState(query.from ?? "");
  const [to, setTo] = useState(query.to ?? "");
  const invalid = from && to && from > to;
  return (
    <Popover label="配信期間" active={Boolean(query.from || query.to)}>
      {(close) => (
        <div className="flex flex-col gap-3 w-72">
          <div className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="開始日" invalid={Boolean(invalid)} />
            <span>〜</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="終了日" />
          </div>
          {invalid ? <p className="text-xs text-red">開始日は終了日以前にしてください</p> : null}
          <div className="flex justify-end gap-2">
            <Button size="xs" onClick={() => { setFrom(""); setTo(""); onApply("", ""); close(); }}>クリア</Button>
            <Button size="xs" variant="dark" disabled={Boolean(invalid)} onClick={() => { onApply(from, to); close(); }}>適用</Button>
          </div>
        </div>
      )}
    </Popover>
  );
}

const RANGES = [
  { key: "spend", label: "配信金額（円）" },
  { key: "cpa", label: "CPA（円）" },
  { key: "mcvr", label: "MCVR（%）" },
  { key: "cv", label: "CV数" },
] as const;

function RangeFilter({ query, onApply }: { query: ListQuery; onApply: (v: Record<string, string>) => void }) {
  const initial = Object.fromEntries(RANGES.flatMap((r) => [[`${r.key}Min`, query[`${r.key}Min`]?.toString() ?? ""], [`${r.key}Max`, query[`${r.key}Max`]?.toString() ?? ""]]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const errors = RANGES.filter((r) => values[`${r.key}Min`] !== "" && values[`${r.key}Max`] !== "" && Number(values[`${r.key}Min`]) > Number(values[`${r.key}Max`])).map((r) => r.key);
  const active = Object.values(initial).some((v) => v !== "");
  return (
    <Popover label="指標の範囲" active={active}>
      {(close) => (
        <div className="flex flex-col gap-3 w-80">
          {RANGES.map((r) => (
            <div key={r.key}>
              <p className="text-xs text-ink-3 mb-1">{r.label}</p>
              <div className="flex items-center gap-2">
                <Input inputMode="decimal" placeholder="下限" value={values[`${r.key}Min`]} invalid={errors.includes(r.key)} onChange={(e) => setValues({ ...values, [`${r.key}Min`]: e.target.value })} className="h-9" />
                <span>〜</span>
                <Input inputMode="decimal" placeholder="上限" value={values[`${r.key}Max`]} onChange={(e) => setValues({ ...values, [`${r.key}Max`]: e.target.value })} className="h-9" />
              </div>
              {errors.includes(r.key) ? <p className="text-xs text-red mt-1">下限は上限以下にしてください</p> : null}
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button size="xs" onClick={() => { const empty = Object.fromEntries(Object.keys(values).map((k) => [k, ""])); setValues(empty); onApply(empty); close(); }}>クリア</Button>
            <Button size="xs" variant="dark" disabled={errors.length > 0} onClick={() => { onApply(values); close(); }}>適用</Button>
          </div>
        </div>
      )}
    </Popover>
  );
}
