// Squad beyond の「クリエイティブ（広告パラメータ）」キー。
// '*' はそのVersionの全パラメータ合計（migrations/0005 の sb_metrics_keyed が日別合計行を返す）。

export const SB_ALL_CREATIVES = "*";

export const SB_ALL_CREATIVES_LABEL = "すべてのパラメータ（Version合計）";

export function isAllCreatives(id: string | null | undefined): boolean {
  return id === SB_ALL_CREATIVES;
}

/** Display name for a creative key; `count` is the number of parameters behind a Version total. */
export function sbCreativeLabel(id: string | null | undefined, name: string | null | undefined, count?: number | null): string {
  if (isAllCreatives(id)) return count ? `すべてのパラメータ（${count}件の合計）` : SB_ALL_CREATIVES_LABEL;
  return name ?? id ?? "—";
}
