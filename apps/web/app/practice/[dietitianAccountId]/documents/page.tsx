"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { LoadingState } from "@nutrition-saas/ui";

/** Documents live on each client chart; this route only redirects. */
export default function PracticeDocumentsPage() {
  const params = useParams<{ dietitianAccountId: string }>();
  const router = useRouter();
  const dietitianAccountId = params.dietitianAccountId;

  useEffect(() => {
    router.replace(`/practice/${dietitianAccountId}/clients`);
  }, [dietitianAccountId, router]);

  return <LoadingState>Opening clients…</LoadingState>;
}
