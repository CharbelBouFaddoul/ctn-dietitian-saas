"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { resolveSessionHome } from "../../../../lib/session-home";
import { SignInForm } from "../../sign-in-form";

export default function DietitianLoginPage() {
  const router = useRouter();

  useEffect(() => {
    void resolveSessionHome("dietitian").then((home) => {
      if (home.kind !== "unauthenticated") {
        router.replace(home.path);
      }
    });
  }, [router]);

  return (
    <SignInForm
      audience="dietitian"
      title="Sign in as Dietitian"
      description="Access your nutrition practice workspace — clients, meal plans, tracking, messaging, and more."
    />
  );
}
