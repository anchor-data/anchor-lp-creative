"use client";
// Shared pieces for the registration wizard steps (Figma 5-1〜5-5).
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Select } from "@/components/ui";
import { api } from "@/components/client";
import type { FormState } from "../form-state";

export interface CategoryOption {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}
export interface TagTypeOption {
  id: string;
  code: string;
  name: string;
  required: boolean;
}
export interface TagOption {
  id: string;
  typeId: string;
  name: string;
}
export interface StepProps {
  state: FormState;
  update: (fn: (s: FormState) => FormState) => void;
  errors: Record<string, string>;
}
export interface SbOption {
  id: string;
  name: string;
}

/** Figma segmented choice: black when selected, white with a black border otherwise. */
export function Toggle({ active, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`h-9 px-4 text-sm whitespace-nowrap border border-ink disabled:cursor-not-allowed disabled:border-line-2 disabled:text-ink-4 ${active ? "bg-ink text-white font-bold" : "bg-white text-ink hover:bg-canvas"} ${className}`}
      {...rest}
    />
  );
}

export function ToggleGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

/** Grey helper box (Figma "新しい商材を登録する場合…"). */
export function Note({ children }: { children: ReactNode }) {
  return <p className="bg-canvas px-4 py-3 text-[13px] text-ink-2">{children}</p>;
}

/** Read-only "（自動）" value box. */
export function ReadonlyValue({ children }: { children: ReactNode }) {
  return <div className="h-11 px-3 flex items-center bg-canvas border border-line text-sm text-ink-3 truncate">{children || "—"}</div>;
}

export function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-sm font-bold ${className}`}>{children}</p>;
}

export function CategorySelect({ value, onChange, categories, invalid }: { value: string; onChange: (v: string) => void; categories: CategoryOption[]; invalid?: boolean }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} invalid={invalid}>
      <option value="">選んでください</option>
      {categories.map((c) => (
        <optgroup key={c.id} label={c.name}>
          {c.children.map((ch) => (
            <option key={ch.id} value={ch.id}>
              {c.name} ＞ {ch.name}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

export interface UploadResult {
  key: string;
  sha256: string;
  duplicateCreativeId: string | null;
}

export async function upload(purpose: "video" | "banner" | "screenshot", file: File | Blob, name = "file"): Promise<UploadResult> {
  const fd = new FormData();
  fd.set("purpose", purpose);
  fd.set("file", file instanceof File ? file : new File([file], name));
  return api("/api/uploads", { method: "POST", body: fd });
}

export const toNumber = (v: string): number | null => (v.trim() === "" ? null : Number(v.replaceAll(",", "")));
