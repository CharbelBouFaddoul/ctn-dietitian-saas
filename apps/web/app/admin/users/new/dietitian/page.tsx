"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@nutrition-saas/ui";

export default function AdminProvisionDietitianRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/users/new?type=dietitian");
  }, [router]);
  return <LoadingState>Opening add user…</LoadingState>;
}
