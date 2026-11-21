import { FlaskConical } from "lucide-react";
import { requireLiveBusinessContext } from "@/lib/business-context";
import { PageHeader } from "../_components/ui";
import { SandboxChatPanel } from "../_components/sandbox-chat/sandbox-chat-panel";

/**
 * "Test your agent" after publishing: the same sandbox chat the onboarding
 * review step uses (same server action, same private `dashboard_test`
 * conversations, nothing counted as a real lead), with a Draft / Live switch.
 * `requireLiveBusinessContext` means this page only renders for a published
 * business, so the Live option is always available here.
 */
export default async function TestAgentPage() {
  await requireLiveBusinessContext();

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader
        icon={FlaskConical}
        title="Test your agent"
        description="Chat with your agent as a prospect would. Test messages are private: nothing is saved as a lead or appointment and no one is notified."
      />
      <div className="max-w-3xl">
        <SandboxChatPanel liveAvailable />
      </div>
    </div>
  );
}
