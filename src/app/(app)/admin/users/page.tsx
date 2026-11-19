import { listUsers } from "@/server/services/admin";
import { PageTitle } from "@/components/ui";
import { UsersAdmin } from "./users-admin";

export default async function UsersPage() {
  return (
    <>
      <PageTitle eyebrow="A-05">ユーザーと権限</PageTitle>
      <UsersAdmin users={await listUsers()} />
    </>
  );
}
