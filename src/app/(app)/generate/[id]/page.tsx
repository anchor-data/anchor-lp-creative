import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { ApiError } from "@/server/http";
import { getGeneration, type GenerationView } from "@/server/services/generation";
import { can } from "@/lib/domain/permissions";
import { GenerateWorkspace } from "../workspace";
import { categoryOptions } from "../categories";

export default async function GenerationPage({ params }: PageProps<"/generate/[id]">) {
  const user = await requireUser("generate");
  let g: GenerationView;
  try {
    g = await getGeneration(user, (await params).id);
  } catch (err) {
    if (err instanceof ApiError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }
  return (
    <div className="px-4 lg:px-8 pt-7 pb-12">
      <GenerateWorkspace categories={await categoryOptions()} refId={null} initial={g} canLink={can(user.role, "register")} />
    </div>
  );
}
