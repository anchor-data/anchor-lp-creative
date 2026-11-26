"use client";
// 取り込み候補 › Squad beyond: finds a beyond page outside the top-spend refresh (name, folder name,
// URL or UID, looked up in Squad beyond) and imports its last 30 days as candidates.
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Input, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";

interface SbSearchHit {
  id: string;
  name: string;
  folder: string | null;
  status: string | null;
  imported: boolean;
  candidates: number;
}

function candidatesHref(pageId: string): string {
  return `/imports?${new URLSearchParams({ tab: "sb", page: pageId }).toString()}`;
}

export function SbSearch() {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<SbSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setSearching(true);
    try {
      const r = await api<{ items: SbSearchHit[] }>(`/api/sb/pages/search?q=${encodeURIComponent(q.trim())}`);
      setItems(r.items);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSearching(false);
    }
  };

  const importPage = async (hit: SbSearchHit) => {
    setImporting(hit.id);
    try {
      const r = await api<{ candidates: number }>(`/api/sb/pages/${encodeURIComponent(hit.id)}/import`, { method: "POST", json: {} });
      setItems((prev) => prev?.map((x) => (x.id === hit.id ? { ...x, imported: true, candidates: r.candidates } : x)) ?? null);
      if (r.candidates > 0) {
        toast.info(`「${hit.name}」から候補を${r.candidates}件取り込みました`);
        router.push(candidatesHref(hit.id));
      } else {
        toast.info(`「${hit.name}」の直近30日に候補になる配信はありませんでした`);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setImporting(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={(e) => void search(e)} className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="beyondページ名・フォルダ名・URL・UIDで検索" aria-label="Squad beyondのページを検索" className="!h-10 w-full sm:w-[420px]" />
        <Button type="submit" size="sm" disabled={searching || q.trim().length < 2} aria-busy={searching} className="gap-2">
          {searching ? <Spinner /> : null}
          {searching ? "検索中…" : "Squad beyondで検索"}
        </Button>
        {items ? <Button type="button" size="sm" variant="ghost" onClick={() => setItems(null)}>閉じる</Button> : null}
      </form>
      {searching && items === null ? <p className="text-xs text-ink-3">初回はSquad beyondのページ一覧を読み込むため、少し時間がかかります。</p> : null}
      {items ? (
        items.length === 0 ? (
          <p className="text-sm text-ink-3">見つかりませんでした。ページ名の一部・フォルダ名・配信URLでもお試しください。</p>
        ) : (
          <ul className="border border-line bg-white divide-y divide-line">
            {items.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-bold">{h.name}</span>
                  <span className="text-ink-3">{h.folder ? `　${h.folder}` : ""}{h.status === "active" ? "　配信中" : "　停止中"}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {h.candidates > 0 ? <a href={candidatesHref(h.id)} className="text-xs underline">候補{h.candidates}件を見る</a> : null}
                  <Button size="xs" variant={h.imported ? "ghost" : "dark"} disabled={importing !== null} aria-busy={importing === h.id} onClick={() => void importPage(h)} className="gap-1.5">
                    {importing === h.id ? <Spinner /> : null}
                    {h.imported ? "取り込み直す" : "取り込む"}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
