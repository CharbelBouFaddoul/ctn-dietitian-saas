"use client";

import Link from "next/link";
import { AdminPage } from "../_components/admin-page";
import { SiteSettingsAdminsTab } from "../site-settings/admins-tab";
import { adminPath } from "../../../lib/admin-path";

export default function AdminAdminsPage() {
  return (
    <AdminPage
      eyebrow="People"
      title="Admins"
      description="Create platform console users, or grant access to an existing account."
      actions={
        <Link href={adminPath("/admins/new")} className="ui-btn ui-btn--primary ui-btn--sm">
          Add admin
        </Link>
      }
    >
      <SiteSettingsAdminsTab />
    </AdminPage>
  );
}
