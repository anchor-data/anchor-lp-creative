"use client";
import { useState } from "react";
import type { RecWeights } from "@/lib/domain/recommend";
import { Button, Card, Field, Input } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";

const LABELS: Record<keyof RecWeights, string> = { sim: "類似度", judge: "当たりの度合い", recency: "新しさ", origin: "取得元", cat: "カテゴリの近さ" };

export function WeightsAdmin({ initial }: { initial: RecWeights }) {
  const toast = useToast();
  const [w, setW] = useState<RecWeights>(initial);
  return (
    <Card className="p-6 max-w-xl">
      <p className="text-sm text-ink-3 mb-4">点数 = 類似度×w + 当たりの度合い×w + 新しさ×w + 取得元×w + カテゴリの近さ×w + 推薦の補正</p>
      <div className="grid grid-cols-2 gap-3">
        {(Object.keys(LABELS) as (keyof RecWeights)[]).map((k) => (
          <Field key={k} label={LABELS[k]}><Input value={w[k]} inputMode="decimal" onChange={(e) => setW({ ...w, [k]: Number(e.target.value) || 0 })} /></Field>
        ))}
      </div>
      <div className="flex justify-end mt-5">
        <Button variant="primary" onClick={async () => { try { await api("/api/admin/settings/rec-weights", { method: "PUT", json: w }); toast.info("保存しました"); } catch (err) { toast.error(errorMessage(err)); } }}>保存</Button>
      </div>
    </Card>
  );
}
