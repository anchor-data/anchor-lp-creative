// Display formatting rules from spec ch.4 「共通仕様」. All dates shown in JST.

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** ¥1,200,000. null -> "—" */
export function yen(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

/** Compact yen for cards: ¥1.2M / ¥860K / ¥3,200 */
export function yenCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `¥${compactNumber(value)}`;
}

export function compactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${trimZero((value / 1_000_000).toFixed(1))}M`;
  if (abs >= 100_000) return `${Math.round(value / 1000)}K`;
  return Math.round(value).toLocaleString("ja-JP");
}

function trimZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/** Rates are stored as "% numbers" (1.4 = 1.4%). 1 decimal place; null -> "—" */
export function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

/** numerator / denominator as %, "—" when the denominator is 0 */
export function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return (numerator / denominator) * 100;
}

export function int(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("ja-JP");
}

function toJst(iso: string): Date {
  return new Date(new Date(iso).getTime() + JST_OFFSET_MS);
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** "YYYY-MM-DD" or ISO -> 2026/11/13 */
export function date(value: string | null | undefined): string {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replaceAll("-", "/");
  const d = toJst(value);
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
}

/** ISO (UTC) -> 2026/11/13 06:32 (JST) */
export function dateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = toJst(value);
  return `${date(value)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Today's date in JST as YYYY-MM-DD */
export function jstToday(now: Date = new Date()): string {
  return toJst(now.toISOString()).toISOString().slice(0, 10);
}

export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive day count between two YYYY-MM-DD dates */
export function daysBetween(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}
