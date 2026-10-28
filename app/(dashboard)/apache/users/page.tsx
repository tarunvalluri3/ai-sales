import { requirePlatformAdmin } from "@/lib/platform-admin";
import { listUsersAcrossTenants } from "@/lib/admin-users";
import { AdminPageHeader } from "../_components/page-header";
import { UserList } from "./user-list";

export default async function ApacheUsersPage() {
  const { admin } = await requirePlatformAdmin("viewer");
  const users = await listUsersAcrossTenants();

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <AdminPageHeader
        title="Users"
        description={`${users.length} membership${users.length === 1 ? "" : "s"} across every tenant (capped at the most recent 100 tenants -- STATE.md).`}
      />
      <UserList users={users} adminRole={admin.role} />
    </div>
  );
}
