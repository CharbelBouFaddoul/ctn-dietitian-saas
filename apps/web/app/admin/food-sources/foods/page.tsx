"use client";

import { adminPath } from "../../../../lib/admin-path";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@nutrition-saas/ui";

export default function AdminCatalogFoodsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(adminPath("/food-sources?tab=browse"));
  }, [router]);
  return <LoadingState>Opening food catalog…</LoadingState>;
}
