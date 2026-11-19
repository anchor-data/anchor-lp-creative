import { requireUser } from "@/server/auth";
import { can } from "@/lib/domain/permissions";
import { GenerateWorkspace } from "./workspace";
import { categoryOptions } from "./categories";

export default async function GeneratePage({ searchParams }: PageProps<"/generate">) {
  const user = await requireUser("generate");
  const sp = await searchParams;
  return (
    <div className="px-4 lg:px-8 pt-7 pb-12">
      <GenerateWorkspace categories={await categoryOptions()} refId={typeof sp.ref === "string" ? sp.ref : null} initial={null} canLink={can(user.role, "register")} />
    </div>
  );
}
