"use client";
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="h-10 px-4 bg-ink text-white text-sm font-bold">
      印刷 / PDFとして保存
    </button>
  );
}
