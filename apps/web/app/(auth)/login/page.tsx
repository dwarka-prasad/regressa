import { ssoEnabled } from "@/lib/oidc";
import { LoginForm } from "./LoginForm";

export default function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  return <LoginForm next={searchParams.next ?? "/overview"} sso={ssoEnabled()} error={searchParams.error} />;
}
