import { TaskChooseOrganization } from "@clerk/nextjs";

export default function ChooseOrganizationTaskPage() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <TaskChooseOrganization redirectUrlComplete="/dashboard" />
    </div>
  );
}
