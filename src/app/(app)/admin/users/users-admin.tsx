"use client";
import { useRouter } from "next/navigation";
import { dateTime } from "@/lib/format";
import { Button, Card, Select } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";

export function UsersAdmin({ users }: { users: { id: string; email: string; name: string; role: string; isActive: boolean; lastSeenAt: string | null }[] }) {
  const router = useRouter();
  const toast = useToast();
  const patch = async (id: string, body: Record<string, unknown>) => {
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", json: body });
      toast.info("更新しました");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-ink-3 border-b border-line"><th className="text-left font-normal px-4 py-2.5">氏名</th><th className="text-left font-normal">メール</th><th className="text-left font-normal">ロール</th><th className="text-left font-normal">最終利用日</th><th className="text-left font-normal">有効</th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={`border-b border-line-3 ${u.isActive ? "" : "text-ink-4"}`}>
              <td className="px-4 py-2.5">{u.name}</td>
              <td>{u.email}</td>
              <td>
                <Select value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })} className="h-8 w-28 text-xs">
                  <option value="viewer">閲覧者</option><option value="editor">登録者</option><option value="admin">管理者</option>
                </Select>
              </td>
              <td>{dateTime(u.lastSeenAt)}</td>
              <td><Button size="xs" onClick={() => patch(u.id, { isActive: !u.isActive })}>{u.isActive ? "無効化" : "有効化"}</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-ink-3 px-4 py-3">初回ログイン時に「閲覧者」として自動で追加されます。管理者が0人になる変更はできません。</p>
    </Card>
  );
}
