import { listTags } from "@/server/services/admin";
import { PageTitle } from "@/components/ui";
import { TagsAdmin } from "./tags-admin";

export default async function TagsPage() {
  return (
    <>
      <PageTitle eyebrow="A-02">タグ</PageTitle>
      <TagsAdmin data={await listTags()} />
    </>
  );
}
