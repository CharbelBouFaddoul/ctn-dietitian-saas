"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingState, Section } from "@nutrition-saas/ui";
import Link from "next/link";
import { AdminPage } from "../../_components/admin-page";
import { ProvisionPatientForm } from "../../_components/provision-patient-form";

function AddUserBody() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("type") === "dietitian") {
      router.replace("/admin/dietitians/new");
    }
  }, [router, searchParams]);

  if (searchParams.get("type") === "dietitian") {
    return <LoadingState>Opening add clinic…</LoadingState>;
  }

  return (
    <AdminPage
      eyebrow="People"
      title="Add patient"
      description="Create a patient chart under an existing clinic."
      crumbs={[
        { href: "/admin/users", label: "Accounts" },
        { label: "Add patient" },
      ]}
      actions={
        <Link href="/admin/users" className="ui-btn ui-btn--secondary ui-btn--sm">
          Back to accounts
        </Link>
      }
    >
      <Section title="Patient chart">
        <ProvisionPatientForm />
      </Section>
    </AdminPage>
  );
}

export default function AdminAddUserPage() {
  return (
    <Suspense fallback={<LoadingState>Loading…</LoadingState>}>
      <AddUserBody />
    </Suspense>
  );
}
