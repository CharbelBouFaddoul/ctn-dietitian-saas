"use client";

import { adminPath } from "../../../../../lib/admin-path";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@nutrition-saas/ui";

export default function AdminProvisionDietitianRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(adminPath("/dietitians/new"));
  }, [router]);
  return <LoadingState>Opening add clinic…</LoadingState>;
}
