"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Breadcrumbs, LoadingState } from "@nutrition-saas/ui";
import { ClientMealPlanWorkspace } from "../../../../../components/client-meal-plan-workspace";

export default function MealPlanEditorRoute() {
  return (
    <Suspense fallback={<LoadingState>Loading plan…</LoadingState>}>
      <MealPlanEditorPage />
    </Suspense>
  );
}

function MealPlanEditorPage() {
  const params = useParams<{ dietitianAccountId: string; planId: string }>();
  const search = useSearchParams();
  const { dietitianAccountId, planId } = params;
  const versionId = search.get("versionId");
  const view = search.get("view") === "analysis" ? "analysis" : "plan";

  return (
    <section>
      <Breadcrumbs
        items={[
          { href: `/practice/${dietitianAccountId}/meal-plans`, label: "Meal plans" },
          { label: "Plan" },
        ]}
      />
      <ClientMealPlanWorkspace
        dietitianAccountId={dietitianAccountId}
        planId={planId}
        versionId={versionId}
        initialView={view}
      />
    </section>
  );
}
