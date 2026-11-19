"use client";
import { useEffect, useRef, useState } from "react";
import type { CardRow, ListResult } from "@/server/services/combination-list";
import { GalleryCard, GalleryCardSkeleton } from "@/components/gallery-card";
import { EmptyState } from "@/components/ui";
import { api, errorMessage } from "@/components/client";

/** Loads the next 24 when the bottom comes into view (spec S-01 読み込み). */
export function GalleryGrid({ initial, params, judgeFilter }: { initial: ListResult; params: string; judgeFilter: string[] }) {
  const [items, setItems] = useState<CardRow[]>(initial.items);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor) return;
    const io = new IntersectionObserver(async (entries) => {
      if (!entries[0]?.isIntersecting || loading) return;
      setLoading(true);
      setError(null);
      try {
        const p = new URLSearchParams(params);
        p.set("cursor", cursor);
        const next = await api<ListResult>(`/api/combinations?${p.toString()}`);
        setItems((prev) => [...prev, ...next.items]);
        setCursor(next.nextCursor);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loading, params]);

  if (items.length === 0) {
    const onlyHit = judgeFilter.length === 1 && judgeFilter[0] === "hit";
    return (
      <EmptyState title={onlyHit ? "この条件に合う当たり事例はまだありません" : "この条件に合う事例はまだありません"}>
        {onlyHit ? "判定を「すべて」にすると、まずまず・外れの事例も表示されます。" : "絞り込み条件を減らすか、事例を登録してください。"}
      </EmptyState>
    );
  }

  return (
    <>
      <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
        {items.map((row) => (
          <GalleryCard key={row.id} row={row} />
        ))}
        {loading ? Array.from({ length: 3 }, (_, i) => <GalleryCardSkeleton key={`s${i}`} />) : null}
      </div>
      {error ? <p className="text-sm text-red">{error}</p> : null}
      <div ref={sentinel} className="h-1" />
      <p className="text-[13px] text-ink-3">※ 市場事例の数値は推定値です。指標での並べ替えでは市場事例を末尾に表示します。</p>
    </>
  );
}
