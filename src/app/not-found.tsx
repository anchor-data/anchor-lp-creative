import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <div className="bg-white border border-line p-8 max-w-md text-center">
        <p className="font-bold text-lg">ページが見つかりません</p>
        <p className="text-sm text-ink-3 mt-2">削除されたか、URLが正しくない可能性があります。</p>
        <Link href="/" className="inline-block mt-4 underline">ギャラリーに戻る</Link>
      </div>
    </main>
  );
}
