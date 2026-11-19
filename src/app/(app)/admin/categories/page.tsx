import { listCategoriesAdmin, listUsers } from "@/server/services/admin";
import { PageTitle } from "@/components/ui";
import { CategoriesAdmin } from "./categories-admin";

export default async function CategoriesPage() {
  const [cats, users] = await Promise.all([listCategoriesAdmin(), listUsers()]);
  return (
    <>
      <PageTitle eyebrow="A-01">業種カテゴリと当たり基準</PageTitle>
      <CategoriesAdmin categories={cats} owners={users.filter((u) => u.isActive && u.role !== "viewer").map((u) => ({ id: u.id, name: u.name }))} />
    </>
  );
}
