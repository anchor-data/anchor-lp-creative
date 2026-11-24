"use client";
// STEP3「URLを入力」: links the article to its beyond page / Version so 手入力 registrations can still
// pull Squad beyond figures. URL matches (preview / delivery / console URLs) link automatically; title
// or product-name matches are offered as candidates.
import { useState } from "react";
import { Button, Select } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";
import type { FormState } from "../form-state";

export interface SbMatch {
  pageId: string;
  pageName: string;
  versionId: string | null;
  versionName: string | null;
  matchedBy: "url" | "name";
}
export interface SbResolveResult {
  match: SbMatch | null;
  candidates: SbMatch[];
}
interface VersionOption {
  id: string;
  name: string;
}

type ArticlePatch = Partial<FormState["article"]>;

export const SB_UNLINK: ArticlePatch = { sbPageId: "", sbPageName: "", sbVersionId: "", sbVersionName: "" };

export function linkPatch(m: SbMatch): ArticlePatch {
  return { sbPageId: m.pageId, sbPageName: m.pageName, sbVersionId: m.versionId ?? "", sbVersionName: m.versionName ?? "" };
}

export async function resolveSb(url: string, title: string, productName: string): Promise<SbResolveResult> {
  return api<SbResolveResult>("/api/sb/resolve", { method: "POST", json: { url, title, productName } });
}

interface SbLinkPanelProps {
  article: FormState["article"];
  candidates: SbMatch[];
  resolving: boolean;
  set: (patch: ArticlePatch) => void;
}

export function SbLinkPanel({ article: a, candidates, resolving, set }: SbLinkPanelProps) {
  const toast = useToast();
  const [versions, setVersions] = useState<VersionOption[] | null>(null);
  const [loading, setLoading] = useState(false);

  const loadVersions = async () => {
    setLoading(true);
    try {
      const r = await api<{ items: VersionOption[] }>(`/api/sb/pages/${encodeURIComponent(a.sbPageId)}/versions`);
      setVersions(r.items);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (resolving) return <p className="text-xs text-ink-3">Squad beyondの記事と照合しています…</p>;

  if (a.sbPageId) {
    return (
      <div className="border border-ink bg-canvas px-4 py-3 text-sm flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            <span className="font-bold">Squad beyondと紐づけ済み：</span>
            {a.sbPageName}
            {a.sbVersionId ? ` ／ Version「${a.sbVersionName}」` : "（Version未選択）"}
          </span>
          <Button size="xs" onClick={() => { setVersions(null); set(SB_UNLINK); }}>紐づけを外す</Button>
        </div>
        {!a.sbVersionId ? (
          versions ? (
            <Select value="" onChange={(e) => { const v = versions.find((x) => x.id === e.target.value); if (v) set({ sbVersionId: v.id, sbVersionName: v.name }); }} className="!h-9 max-w-md">
              <option value="">Versionを選んでください</option>
              {versions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          ) : (
            <Button size="xs" className="w-fit" onClick={() => void loadVersions()} disabled={loading}>{loading ? "読み込んでいます…" : "Versionを選ぶ"}</Button>
          )
        ) : null}
        <p className="text-xs text-ink-3">STEP4の手入力でも、このVersionの実績をSquad beyondから入れられます。</p>
      </div>
    );
  }

  if (candidates.length === 0) return null;
  return (
    <div className="border border-dashed border-line-2 px-4 py-3 text-sm flex flex-col gap-2">
      <p className="font-bold">Squad beyondの候補（記事タイトル・商材名が近いもの）</p>
      <ul className="flex flex-col gap-1.5">
        {candidates.map((m) => (
          <li key={`${m.pageId}|${m.versionId ?? ""}`} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 truncate">{m.pageName}{m.versionName ? ` ／ ${m.versionName}` : ""}</span>
            <Button size="xs" onClick={() => set(linkPatch(m))}>これと紐づける</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
