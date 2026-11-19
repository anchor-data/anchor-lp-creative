"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";

type Data = { types: { id: string; code: string; name: string; required: boolean }[]; tags: { id: string; typeId: string; name: string; isActive: boolean; usage: number }[] };

export function TagsAdmin({ data }: { data: Data }) {
  const router = useRouter();
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {data.types.map((t) => {
        const tags = data.tags.filter((x) => x.typeId === t.id);
        return (
          <Card key={t.id} className="p-5">
            <h2 className="font-bold mb-3">{t.name}{t.required ? <span className="text-xs text-red ml-2">必須</span> : null}</h2>
            <ul className="flex flex-col divide-y divide-line-3 mb-3">
              {tags.map((tag) => (
                <li key={tag.id} className="flex items-center justify-between py-2 text-sm gap-2">
                  <span className={tag.isActive ? "" : "text-ink-4 line-through"}>{tag.name}<span className="text-xs text-ink-3 ml-2">{tag.usage}件</span></span>
                  <span className="flex gap-1.5">
                    <Button size="xs" onClick={() => { const name = window.prompt("新しい名称", tag.name); if (name) run(() => api(`/api/admin/tags/${tag.id}`, { method: "PATCH", json: { name } })); }}>名称変更</Button>
                    <Button size="xs" onClick={() => { const into = window.prompt(`統合先のタグ名（${tags.filter((x) => x.id !== tag.id).map((x) => x.name).join("・")}）`); const target = tags.find((x) => x.name === into); if (target && window.confirm(`「${tag.name}」を「${target.name}」に統合します。付いていた事例も移ります。`)) run(() => api(`/api/admin/tags/${tag.id}/merge`, { method: "POST", json: { intoId: target.id } })); }}>統合</Button>
                    <Button size="xs" onClick={() => run(() => api(`/api/admin/tags/${tag.id}`, { method: "PATCH", json: { isActive: !tag.isActive } }))}>{tag.isActive ? "無効化" : "有効化"}</Button>
                  </span>
                </li>
              ))}
              {tags.length === 0 ? <li className="py-2 text-sm text-ink-3">選択肢がありません</li> : null}
            </ul>
            <div className="flex gap-2">
              <Input value={drafts[t.id] ?? ""} onChange={(e) => setDrafts({ ...drafts, [t.id]: e.target.value })} placeholder="選択肢を追加" className="h-9" />
              <Button size="sm" variant="dark" disabled={!drafts[t.id]?.trim()} onClick={() => run(async () => { await api("/api/admin/tags", { method: "POST", json: { typeId: t.id, name: drafts[t.id] } }); setDrafts({ ...drafts, [t.id]: "" }); })}>追加</Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
