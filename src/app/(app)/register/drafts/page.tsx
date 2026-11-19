import Link from "next/link";
import { requireUser } from "@/server/auth";
import { listDrafts } from "@/server/services/registration";
import { dateTime } from "@/lib/format";
import { EmptyState, PageTitle } from "@/components/ui";

export default async function DraftsPage() {
  const user = await requireUser("register");
  const drafts = await listDrafts(user);
  return (
    <div className="px-4 lg:px-8 pt-7 pb-12">
      <PageTitle>登録の下書き</PageTitle>
      {drafts.length === 0 ? (
        <EmptyState title="下書きはありません">登録ウィザードの入力内容は自動で下書き保存されます。</EmptyState>
      ) : (
        <ul className="bg-white border border-line divide-y divide-line-3">
          {drafts.map((d) => (
            <li key={d.id}>
              <Link href={`/register?draft=${d.id}`} className="flex justify-between px-5 py-3 text-sm hover:bg-canvas">
                <span>{d.label}</span>
                <span className="text-ink-3">{dateTime(d.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
