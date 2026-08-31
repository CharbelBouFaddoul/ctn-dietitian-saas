"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingState } from "@nutrition-saas/ui";

function RedirectToDailyLog() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const date = searchParams.get("date");

  useEffect(() => {
    const next = new URLSearchParams();
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) next.set("date", date);
    next.set("add", "1");
    router.replace(`/client/tracking?${next.toString()}`);
  }, [date, router]);

  return <LoadingState>Opening daily log…</LoadingState>;
}

export default function ClientAddFoodPage() {
  return (
    <Suspense fallback={<LoadingState>Opening daily log…</LoadingState>}>
      <RedirectToDailyLog />
    </Suspense>
  );
}
