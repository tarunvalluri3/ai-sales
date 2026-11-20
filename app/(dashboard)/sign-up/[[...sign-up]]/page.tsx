import { SignUp } from "@clerk/nextjs";
import { clerkDarkAppearance } from "@/lib/clerk-appearance";

import { redirectSignedInFromAuthPage } from "@/lib/auth-page-redirect";

export default async function SignUpPage() {
  await redirectSignedInFromAuthPage();
  return (
    <div className="flex flex-1 items-center justify-center bg-ds-bg p-6">
      <SignUp appearance={clerkDarkAppearance} />
    </div>
  );
}
