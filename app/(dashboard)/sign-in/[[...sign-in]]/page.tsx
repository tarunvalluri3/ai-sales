import { SignIn } from "@clerk/nextjs";
import { clerkDarkAppearance } from "@/lib/clerk-appearance";

import { redirectSignedInFromAuthPage } from "@/lib/auth-page-redirect";

export default async function SignInPage() {
  await redirectSignedInFromAuthPage();
  return (
    <div className="flex flex-1 items-center justify-center bg-ds-bg p-6">
      <SignIn appearance={clerkDarkAppearance} />
    </div>
  );
}
