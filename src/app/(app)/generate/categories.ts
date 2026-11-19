import "server-only";
import { listCategoriesAdmin } from "@/server/services/admin";

export interface CategoryOption {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

export async function categoryOptions(): Promise<CategoryOption[]> {
  const cats = await listCategoriesAdmin();
  return cats
    .filter((c) => !c.parentId && c.isActive)
    .map((p) => ({ id: p.id, name: p.name, children: cats.filter((c) => c.parentId === p.id && c.isActive).map((c) => ({ id: c.id, name: c.name })) }));
}
