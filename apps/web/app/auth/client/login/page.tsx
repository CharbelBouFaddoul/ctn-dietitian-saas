"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { resolveSessionHome } from "../../../../lib/session-home";
import { SignInForm } from "../../sign-in-form";

export default function ClientLoginPage() {
  const router = useRouter();

  useEffect(() => {
    void resolveSessionHome("client").then((home) => {
      if (home.kind !== "unauthenticated") {
        router.replace(home.path);
      }
    });
  }, [router]);

  return (
    <SignInForm
      audience="client"
      title="Sign in as Patient"
      description="Sign in with the email you registered. If you are not connected yet, you’ll enter your dietitian’s join code next."
    />
  );
}
