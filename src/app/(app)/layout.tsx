import { AppHeader } from "@/components/app-header";
import { ToastProvider } from "@/components/toast";
import { getCurrentUser } from "@/server/auth";
import { countOpenCandidates } from "@/server/services/candidates";
import { ApiError } from "@/server/http";

// Every screen is per-user (Cloudflare Access) and must never be prerendered at build time.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "ログイン情報を確認できませんでした";
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="bg-white border border-line p-8 max-w-md text-center">
          <p className="font-bold text-lg">勝ちパターンDB</p>
          <p className="text-sm text-ink-3 mt-3">{message}</p>
        </div>
      </main>
    );
  }
  const pending = user.role === "viewer" ? { sb: 0, dpro: 0 } : await countOpenCandidates();
  return (
    <ToastProvider>
      <AppHeader user={user} pending={pending} />
      <main className="flex-1 w-full">{children}</main>
    </ToastProvider>
  );
}
