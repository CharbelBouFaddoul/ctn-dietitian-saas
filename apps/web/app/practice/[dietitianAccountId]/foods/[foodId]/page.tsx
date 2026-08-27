"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { LoadingState } from "@nutrition-saas/ui";

/** Old food detail URLs now open the list popup. */
export default function FoodDetailRedirectPage() {
  const params = useParams<{ dietitianAccountId: string; foodId: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/practice/${params.dietitianAccountId}/foods?food=${params.foodId}`);
  }, [params.dietitianAccountId, params.foodId, router]);

  return <LoadingState>Opening food…</LoadingState>;
}
