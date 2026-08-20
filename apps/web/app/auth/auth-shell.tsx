import type { ReactNode } from "react";
import Link from "next/link";
import { AuthLayout } from "@nutrition-saas/ui";

export type AuthAudience = "chooser" | "admin" | "dietitian" | "client";

export function AuthShell({
  title,
  audience = "dietitian",
  description,
  children,
}: {
  title: string;
  audience?: AuthAudience;
  description?: string;
  children: ReactNode;
}) {
  return (
    <AuthLayout title={title} description={description} footer={<AuthFooter audience={audience} />}>
      {children}
    </AuthLayout>
  );
}

function AuthFooter({ audience }: { audience: AuthAudience }) {
  if (audience === "admin") {
    return (
      <p className="ui-muted" style={{ marginTop: 20, fontSize: 13 }}>
        <Link href="/auth/forgot-password" className="ui-link">
          Forgot password
        </Link>
      </p>
    );
  }

  if (audience === "client") {
    return (
      <p style={{ marginTop: 20, fontSize: 13 }}>
        <Link href="/auth/client/login" className="ui-link">
          Sign in
        </Link>
        {" · "}
        <Link href="/auth/client/register" className="ui-link">
          Register
        </Link>
        {" · "}
        <Link href="/auth/forgot-password" className="ui-link">
          Forgot password
        </Link>
        <span className="ui-muted" style={{ display: "block", marginTop: 8 }}>
          Register, then enter the join code from your dietitian.
        </span>
      </p>
    );
  }

  return (
    <p style={{ marginTop: 20, fontSize: 13 }}>
      <Link href="/auth/login" className="ui-link">
        Sign in
      </Link>
      {" · "}
      <Link href="/auth/register" className="ui-link">
        Create a practice account
      </Link>
      {" · "}
      <Link href="/auth/forgot-password" className="ui-link">
        Forgot password
      </Link>
    </p>
  );
}
