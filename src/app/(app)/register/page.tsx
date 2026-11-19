import Link from "next/link";
import { requireUser } from "@/server/auth";
import { listCategoriesAdmin, listTags } from "@/server/services/admin";
import { RegisterWizard } from "./wizard";

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  await requireUser("register");
  const sp = await searchParams;
  const [cats, tagData] = await Promise.all([listCategoriesAdmin(), listTags()]);
  const parents = cats.filter((c) => !c.parentId && c.isActive);
  const categoryOptions = parents.map((p) => ({ id: p.id, name: p.name, children: cats.filter((c) => c.parentId === p.id && c.isActive).map((c) => ({ id: c.id, name: c.name })) }));
  return (
    <div className="px-4 lg:px-8 pt-7 pb-12">
      <Link href="/" className="text-sm underline underline-offset-2">
        ← ギャラリーに戻る
      </Link>
      <h1 className="text-[28px] font-bold mt-1.5 mb-6">事例を登録</h1>
      <RegisterWizard
        categories={categoryOptions}
        tagTypes={tagData.types}
        tags={tagData.tags.filter((t) => t.isActive).map((t) => ({ id: t.id, typeId: t.typeId, name: t.name }))}
        candidateId={typeof sp.candidate === "string" ? sp.candidate : null}
        draftId={typeof sp.draft === "string" ? sp.draft : null}
      />
    </div>
  );
}
