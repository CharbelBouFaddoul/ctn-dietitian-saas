"use client";

import Link from "next/link";
import { Section } from "@nutrition-saas/ui";
import { AdminPage } from "../../_components/admin-page";
import { ProvisionClinicForm } from "../../_components/provision-clinic-form";

export default function AdminNewClinicPage() {
  return (
    <AdminPage
      eyebrow="People"
      title="Add clinic"
      description="Creates the practice and an owner login. The owner receives an activation email."
      crumbs={[
        { href: "/admin/dietitians", label: "Clinics" },
        { label: "Add clinic" },
      ]}
      actions={
        <Link href="/admin/dietitians" className="ui-btn ui-btn--secondary ui-btn--sm">
          Back to clinics
        </Link>
      }
    >
      <Section title="Clinic and owner">
        <ProvisionClinicForm />
      </Section>
    </AdminPage>
  );
}
