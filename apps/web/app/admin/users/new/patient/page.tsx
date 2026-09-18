"use client";

import { adminPath } from "../../../../../lib/admin-path";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@nutrition-saas/ui";

export default function AdminProvisionPatientRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(adminPath("/users/new?type=patient"));
  }, [router]);
  return <LoadingState>Opening add user…</LoadingState>;
}
