import { redirectSignedInFromAuthPage } from "@/lib/auth-page-redirect";
import { WaveAuthFrame } from "../../_components/wave-auth-frame";

export default async function SignUpPage() {
  await redirectSignedInFromAuthPage();
  return <WaveAuthFrame screen="sign-up" />;
}
