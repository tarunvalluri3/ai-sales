import { SignIn } from "@clerk/nextjs";
import { clerkDarkAppearance } from "@/lib/clerk-appearance";

export default function SignInPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-ds-bg p-6">
      <SignIn appearance={clerkDarkAppearance} />
    </div>
  );
}
