"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { resolveSessionHome } from "../../../lib/session-home";
import { SignInForm } from "../sign-in-form";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    void resolveSessionHome().then((home) => {
      if (home.kind !== "unauthenticated") {
        router.replace(home.path);
      }
    });
  }, [router]);

  return (
    <SignInForm
      audience="dietitian"
      title="Sign in"
      description="Use the email and password for your Nutrition account."
    />
  );
}
