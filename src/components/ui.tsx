// Anchor design-system primitives. Square corners, no shadows; red = primary,
// white/black border = secondary, orange = selected.
import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { JUDGE_LABEL, mediaLabel } from "@/lib/domain/constants";
import type { JudgeResult } from "@/lib/domain/judge";

type Variant = "primary" | "secondary" | "dark" | "ghost";
const VARIANT: Record<Variant, string> = {
  primary: "bg-red text-white font-bold hover:bg-red-dark disabled:bg-line-2",
  secondary: "bg-white text-ink border border-ink hover:bg-canvas disabled:text-ink-4 disabled:border-line-2",
  dark: "bg-ink text-white font-bold hover:bg-ink-2 disabled:bg-line-2",
  ghost: "text-ink underline underline-offset-2 hover:text-ink-3",
};
const SIZE = { md: "h-11 px-[18px] text-sm", sm: "h-10 px-[14px] text-sm", xs: "h-8 px-3 text-xs" } as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: keyof typeof SIZE;
}

export function Button({ variant = "secondary", size = "md", className = "", ...rest }: ButtonProps) {
  return <button type="button" className={`inline-flex items-center justify-center whitespace-nowrap disabled:cursor-not-allowed ${variant === "ghost" ? "" : SIZE[size]} ${VARIANT[variant]} ${className}`} {...rest} />;
}

export function LinkButton({ href, variant = "secondary", size = "md", className = "", children }: { href: string; variant?: Variant; size?: keyof typeof SIZE; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={`inline-flex items-center justify-center whitespace-nowrap ${variant === "ghost" ? "" : SIZE[size]} ${VARIANT[variant]} ${className}`}>
      {children}
    </Link>
  );
}

/** Filter pill: black when active (Figma "取得元：すべて"). */
export function Pill({ active, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={`h-10 px-[14px] text-sm whitespace-nowrap border ${active ? "bg-ink text-white border-ink" : "bg-white text-ink border-line-2 hover:border-ink"} ${className}`}
      {...rest}
    />
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`bg-white border border-line ${className}`}>{children}</section>;
}

export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-base font-bold">{children}</h2>
      {aside}
    </div>
  );
}

const BADGE = "inline-flex items-center px-[10px] py-[3px] text-xs whitespace-nowrap";

/** 判定バッジ (spec ch.4): 当たり=赤地白, まずまず=オレンジ地黒, 外れ=白地グレー枠黒, 保留=白地グレー文字 */
export function JudgeBadge({ judge, manual, detail }: { judge: JudgeResult | null; manual?: boolean; detail?: string }) {
  if (!judge) return null;
  const cls: Record<JudgeResult, string> = {
    hit: "bg-red text-white font-bold",
    fair: "bg-orange text-ink font-bold",
    miss: "bg-white text-ink border border-line-2",
    pending: "bg-white text-ink-4 border border-line",
  };
  return (
    <span className={`${BADGE} ${cls[judge]}`}>
      {JUDGE_LABEL[judge]}
      {detail ? `（${detail}）` : ""}
      {manual ? "・手動" : ""}
    </span>
  );
}

/** 取得元バッジ: 自社実績=黒地白「実績」, 市場事例=白地黒枠「市場」 */
export function SourceBadge({ origin, long }: { origin: "own" | "market"; long?: boolean }) {
  return origin === "own" ? (
    <span className={`${BADGE} bg-ink text-white font-bold`}>{long ? "自社実績" : "実績"}</span>
  ) : (
    <span className={`${BADGE} bg-white text-ink border border-ink font-bold`}>{long ? "市場事例" : "市場"}</span>
  );
}

export function MarketJudgeBadge() {
  return <span className={`${BADGE} bg-white text-red border border-red font-bold`}>当たり推定</span>;
}

export function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`${BADGE} bg-chip text-ink-2 ${className}`}>{children}</span>;
}

export function MediaBadge({ media }: { media: string }) {
  return <Chip>{mediaLabel(media)}</Chip>;
}

export function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-white border border-line px-4 py-3 min-w-0">
      <p className="text-xs text-ink-3 truncate">
        {label}
        {note ? <span className="ml-1">（{note}）</span> : null}
      </p>
      <p className="text-2xl font-bold mt-1 truncate">{value}</p>
    </div>
  );
}

export function Field({ label, required, error, hint, children, className = "" }: { label: string; required?: boolean; error?: string | null; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs text-ink-3 mb-1.5">
        {label}
        {required ? <span className="text-red ml-0.5">*</span> : null}
      </span>
      {children}
      {hint && !error ? <span className="block text-xs text-ink-4 mt-1">{hint}</span> : null}
      {error ? <span className="block text-xs text-red mt-1">{error}</span> : null}
    </label>
  );
}

const CONTROL = "w-full bg-white border border-line-2 px-3 text-sm text-ink placeholder:text-ink-4 focus:border-ink outline-none disabled:bg-canvas";

export function Input({ className = "", invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={`${CONTROL} h-11 ${invalid ? "border-red" : ""} ${className}`} {...rest} />;
}

export function Textarea({ className = "", invalid, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea className={`${CONTROL} py-2.5 min-h-20 ${invalid ? "border-red" : ""} ${className}`} {...rest} />;
}

export function Select({ className = "", invalid, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select className={`${CONTROL} h-11 ${invalid ? "border-red" : ""} ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={`inline-flex items-center gap-2 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <span className={`inline-flex size-[18px] shrink-0 items-center justify-center border ${checked ? "bg-red border-red text-white" : "bg-white border-line-2"}`} aria-hidden>
        {checked ? <span className="text-xs leading-none">✓</span> : null}
      </span>
      <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label ? <span className="text-sm">{label}</span> : null}
    </label>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="bg-white border border-line px-6 py-12 text-center">
      <p className="font-bold">{title}</p>
      {children ? <div className="text-sm text-ink-3 mt-2">{children}</div> : null}
    </div>
  );
}

export function PageTitle({ eyebrow, children, aside }: { eyebrow?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
      <div className="min-w-0">
        {eyebrow ? <div className="text-[13px] text-ink-3 mb-1">{eyebrow}</div> : null}
        <h1 className="text-[28px] font-bold leading-tight">{children}</h1>
      </div>
      {aside ? <div className="flex flex-wrap gap-2.5">{aside}</div> : null}
    </div>
  );
}

/** Legal-check disclaimer required on generation and detail screens (spec ch.11). */
export function LegalNote() {
  return <p className="text-xs text-ink-4">※ 表現チェックは補助です。広告表現の最終判断は担当者が行ってください。</p>;
}
