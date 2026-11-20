import { redirect } from "next/navigation";

/** 傾向分析 is shown on each combination's detail page (S-02), not as its own screen. */
export default function TrendsPage(): never {
  redirect("/");
}
