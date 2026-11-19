"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Role } from "@/lib/domain/constants";

interface NavItem {
  href: string;
  label: string;
  badge?: number;
  editorOnly?: boolean;
  match: (path: string) => boolean;
}

export interface AppHeaderProps {
  user: { name: string; email: string; role: Role };
  pending: { sb: number; dpro: number };
}

const ROLE_LABEL: Record<Role, string> = { viewer: "閲覧者", editor: "登録者", admin: "管理者" };

export function AppHeader({ user, pending }: AppHeaderProps) {
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const isEditor = user.role !== "viewer";

  const nav: NavItem[] = [
    { href: "/", label: "ギャラリー", match: (p) => p === "/" || p.startsWith("/combinations") },
    { href: "/generate", label: "生成", match: (p) => p.startsWith("/generate") },
    { href: "/candidates", label: "登録候補", badge: pending.sb, editorOnly: true, match: (p) => p.startsWith("/candidates") },
    { href: "/imports", label: "取り込み候補", badge: pending.dpro, editorOnly: true, match: (p) => p.startsWith("/imports") },
    { href: "/playbooks", label: "勝ちパターン集", match: (p) => p.startsWith("/playbooks") },
    { href: "/trends", label: "傾向分析", match: (p) => p.startsWith("/trends") },
  ];

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(window.location.pathname === "/" ? window.location.search : "");
    if (q.trim()) params.set("q", q.trim());
    else params.delete("q");
    params.delete("cursor");
    router.push(`/?${params.toString()}`);
  };

  return (
    <header className="bg-header border-b-4 border-red sticky top-0 z-40 print:hidden">
      <div className="flex items-center gap-4 lg:gap-6 h-16 px-4 lg:px-8">
        <Link href="/" className="text-white font-bold text-lg whitespace-nowrap">
          勝ちパターンDB
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto min-w-0" aria-label="メインメニュー">
          {nav
            .filter((n) => !n.editorOnly || isEditor)
            .map((n) => {
              const active = n.match(path);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`flex items-center gap-1.5 px-[14px] py-2.5 text-sm whitespace-nowrap ${active ? "bg-red text-white font-medium" : "text-header-muted hover:text-white"} ${n.href === "/" || n.href === "/playbooks" ? "" : "hidden md:flex"}`}
                  aria-current={active ? "page" : undefined}
                >
                  {n.label}
                  {n.badge ? <span className="bg-white text-ink text-xs px-2 py-px">{n.badge}</span> : null}
                </Link>
              );
            })}
        </nav>
        <div className="flex-1" />
        <form onSubmit={onSearch} className="hidden xl:block" role="search">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="コピー・台本・記事本文を検索"
            aria-label="キーワード検索"
            className="bg-header-field border border-header-line h-10 px-[14px] w-[300px] text-sm text-white placeholder:text-header-muted outline-none focus:border-header-muted"
          />
        </form>
        {isEditor ? (
          <Link href="/register" className="hidden md:inline-flex items-center bg-red text-white font-bold text-sm h-11 px-[18px] whitespace-nowrap hover:bg-red-dark">
            ＋ 事例を登録
          </Link>
        ) : null}
        <div className="relative">
          <button type="button" onClick={() => setMenu((m) => !m)} className="text-header-muted hover:text-white text-sm whitespace-nowrap" aria-expanded={menu}>
            {user.name} ▾
          </button>
          {menu ? (
            <div className="absolute right-0 top-9 bg-white border border-line w-56 py-2 text-sm z-50" onMouseLeave={() => setMenu(false)}>
              <div className="px-4 py-2 border-b border-line-3">
                <p className="font-bold truncate">{user.name}</p>
                <p className="text-xs text-ink-3 truncate">{user.email}</p>
                <p className="text-xs text-ink-3 mt-1">{ROLE_LABEL[user.role]}</p>
              </div>
              <Link href="/generate/history" className="block px-4 py-2 hover:bg-canvas" onClick={() => setMenu(false)}>
                自分の生成案
              </Link>
              {isEditor ? (
                <Link href="/register/drafts" className="block px-4 py-2 hover:bg-canvas" onClick={() => setMenu(false)}>
                  登録の下書き
                </Link>
              ) : null}
              {user.role === "admin" ? (
                <Link href="/admin" className="block px-4 py-2 hover:bg-canvas" onClick={() => setMenu(false)}>
                  管理画面
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
