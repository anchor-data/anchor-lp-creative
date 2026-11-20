import { redirect } from "next/navigation";

/** 登録候補 now lives in 取り込み候補 › Squad beyond. Keeps old links and notifications working. */
export default async function CandidatesPage({ searchParams }: PageProps<"/candidates">) {
  const sp = await searchParams;
  const params = new URLSearchParams({ tab: "sb" });
  if (sp.tab === "dismissed") params.set("status", "dismissed");
  for (const key of ["media", "page", "includeMiss"] as const) {
    const v = sp[key];
    if (typeof v === "string" && v) params.set(key, v);
  }
  redirect(`/imports?${params.toString()}`);
}
