"use client";

import { AdminPage } from "../_components/admin-page";
import { SiteSettingsAdminsTab } from "../site-settings/admins-tab";

export default function AdminAdminsPage() {
  return (
    <AdminPage
      eyebrow="People"
      title="Admins"
      description="People with access to this platform console. Grant access from an existing account."
    >
      <SiteSettingsAdminsTab />
    </AdminPage>
  );
}
