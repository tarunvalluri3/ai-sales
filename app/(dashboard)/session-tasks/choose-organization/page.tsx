import { TaskChooseOrganization } from "@clerk/nextjs";
import { clerkDarkAppearance } from "@/lib/clerk-appearance";

export default function ChooseOrganizationTaskPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-ds-bg p-6">
      <TaskChooseOrganization redirectUrlComplete="/dashboard" appearance={clerkDarkAppearance} />
    </div>
  );
}
