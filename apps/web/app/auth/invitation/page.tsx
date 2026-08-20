import Link from "next/link";
import { AuthShell } from "../auth-shell";

export default function InvitationPage() {
  return (
    <AuthShell
      title="Join with a code"
      audience="client"
      description="Create a client account, verify your email, and sign in. Then enter the join code your dietitian sends you."
    >
      <Link href="/auth/client/register" className="ui-btn ui-btn--primary ui-btn--block">
        Create a client account
      </Link>
      <p style={{ marginTop: 16 }}>
        Already registered?{" "}
        <Link href="/auth/client/login" className="ui-link">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
