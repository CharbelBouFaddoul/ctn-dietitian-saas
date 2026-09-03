"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingState } from "@nutrition-saas/ui";

function CheckoutRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plan = (searchParams.get("plan") || "").trim();

  useEffect(() => {
    const href = plan ? `/contact?plan=${encodeURIComponent(plan)}` : "/contact";
    router.replace(href);
  }, [plan, router]);

  return <LoadingState>Taking you to checkout…</LoadingState>;
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<LoadingState>Loading…</LoadingState>}>
      <CheckoutRedirect />
    </Suspense>
  );
}
