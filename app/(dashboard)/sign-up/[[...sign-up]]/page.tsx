import { SignUp } from "@clerk/nextjs";
import { clerkDarkAppearance } from "@/lib/clerk-appearance";

export default function SignUpPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-ds-bg p-6">
      <SignUp appearance={clerkDarkAppearance} />
    </div>
  );
}
