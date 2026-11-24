"use client";
// Searchable beyond page picker (3,000+ pages). Accepts a pasted console URL, which also picks the Version.
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";

interface SbPageHit {
  id: string;
  name: string;
  folder: string | null;
  status: string | null;
}

interface SbPagePickerProps {
  pageId: string;
  pageName: string;
  invalid?: boolean;
  onPick: (page: { id: string; name: string }, versionId: string | null) => void;
}

const SB_URL = /squadbeyond\.com\/ab_tests\/([^/?#\s]+)/i;

/** Page id and Version from a pasted console URL (mirrors parseSbUrl on the server). */
function fromUrl(text: string): { pageId: string; versionId: string | null } | null {
  const m = SB_URL.exec(text);
  if (!m) return null;
  const version = /[?&]version=([^&#\s]+)/.exec(text)?.[1] ?? null;
  return { pageId: decodeURIComponent(m[1]), versionId: version ? decodeURIComponent(version) : null };
}

export function SbPagePicker({ pageId, pageName, invalid, onPick }: SbPagePickerProps) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<SbPageHit[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const pasted = fromUrl(query);
    const q = pasted ? pasted.pageId : query;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api<{ items: SbPageHit[] }>(`/api/sb/pages?q=${encodeURIComponent(q)}`);
        if (pasted) {
          const exact = res.items.find((p) => p.id === pasted.pageId);
          if (exact) {
            onPick({ id: exact.id, name: exact.name }, pasted.versionId);
            setOpen(false);
            setQuery("");
            return;
          }
          toast.error("このURLのbeyondページが見つかりません。取り込み候補の「最新にする」かページ一覧の同期をしてください");
        }
        setHits(res.items);
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onPick identity changes every render
  }, [query, open, toast]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <Input
        role="combobox"
        aria-expanded={open}
        aria-label="beyondページを検索"
        value={open ? query : pageId ? `${pageName}（${pageId}）` : ""}
        placeholder="ページ名・ページID で検索、またはbeyondのURLを貼り付け"
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={(e) => setQuery(e.target.value)}
        invalid={invalid}
      />
      {open ? (
        <ul role="listbox" className="absolute z-20 left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-white border border-ink shadow-lg">
          {loading && hits.length === 0 ? <li className="px-3 py-2 text-sm text-ink-3">検索しています…</li> : null}
          {!loading && hits.length === 0 ? <li className="px-3 py-2 text-sm text-ink-3">見つかりません</li> : null}
          {hits.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={p.id === pageId}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-canvas ${p.id === pageId ? "font-bold" : ""}`}
                onClick={() => { onPick({ id: p.id, name: p.name }, null); setOpen(false); setQuery(""); }}
              >
                <span className="block truncate">{p.name}</span>
                <span className="block text-[11px] text-ink-4 truncate">{p.id}{p.folder ? `・${p.folder}` : ""}{p.status === "active" ? "・配信中" : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
