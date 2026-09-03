"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@nutrition-saas/ui";

export default function AdminProvisionDietitianRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/dietitians/new");
  }, [router]);
  return <LoadingState>Opening add clinic…</LoadingState>;
}
