"use client";
// Detail page: run 動画解析 / LP分析 on an already-registered combination.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { VideoAnalysisView, VideoAnalyzer, type AnalyzedVideo } from "@/components/video-analysis/analyzer";
import type { VideoAnalysis } from "@/lib/domain/video-analysis";

export const REPLACE_SCRIPT = { title: "台本をAIの解析結果で置き換えますか？", message: "「置き換えない」を選ぶと、今の台本はそのまま残り、解析結果だけを保存します。", confirmLabel: "置き換える", cancelLabel: "置き換えない" };

interface CreativeAnalysisPanelProps {
  creativeId: string;
  r2Key: string | null;
  sourceUrl: string | null;
  mainCopy: string | null;
  productName: string;
  analysis: VideoAnalysis | null;
  hasScript: boolean;
  canEdit: boolean;
}

export function CreativeAnalysisPanel({ creativeId, r2Key, sourceUrl, mainCopy, productName, analysis, hasScript, canEdit }: CreativeAnalysisPanelProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const save = async ({ analysis: next, thumbnailKey, width, height }: AnalyzedVideo) => {
    const applyScript = next.scenes.length > 0 && (!hasScript || await confirm(REPLACE_SCRIPT));
    await api(`/api/creatives/${creativeId}/analysis`, {
      method: "PUT",
      json: { analysis: next, applyScript, thumbnailKey: thumbnailKey ?? undefined, width: width || undefined, height: height || undefined },
    });
    router.refresh();
  };
  return (
    <div className="flex flex-col gap-3">
      {analysis ? <VideoAnalysisView analysis={analysis} /> : <p className="text-sm text-ink-4">まだ解析していません</p>}
      {canEdit ? <VideoAnalyzer source={{ r2Key, url: r2Key ? null : sourceUrl }} mainCopy={mainCopy} productName={productName} hasResult={Boolean(analysis)} onAnalyzed={save} /> : null}
    </div>
  );
}

export function ArticleAnalyzeButton({ articleId, hasBlocks }: { articleId: string; hasBlocks: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const res = await api<{ blocks: unknown[] }>(`/api/articles/${articleId}/analyze`, { method: "POST" });
      toast.info(`記事LPを${res.blocks.length}個のブロックに分解しました`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="xs" variant={hasBlocks ? "secondary" : "primary"} onClick={run} disabled={busy}>
      {busy ? "AIが分析しています…" : hasBlocks ? "AIで分析し直す" : "AIで記事LPを分析"}
    </Button>
  );
}
