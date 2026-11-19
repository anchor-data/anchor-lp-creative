import Link from "next/link";
import { requireUser } from "@/server/auth";

const LINKS = [
  { href: "/admin/categories", label: "業種カテゴリと当たり基準" },
  { href: "/admin/tags", label: "タグ" },
  { href: "/admin/users", label: "ユーザーと権限" },
  { href: "/admin/integrations", label: "連携とジョブ" },
  { href: "/admin/weights", label: "推薦の重み" },
  { href: "/admin/audit", label: "監査ログ" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireUser("admin");
  return (
    <div className="flex gap-8 px-4 lg:px-8 pt-7 pb-12">
      <nav className="hidden lg:flex flex-col w-56 shrink-0 gap-1 text-sm" aria-label="管理メニュー">
        <p className="text-[13px] font-bold text-ink-3 mb-2">管理画面</p>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="px-3 py-2.5 hover:bg-white">{l.label}</Link>
        ))}
      </nav>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
