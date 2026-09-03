"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState, LoadingState, Section, StatusBadge, Table, Td } from "@nutrition-saas/ui";
import { AdminPage } from "../_components/admin-page";
import { scopedStatusLabel } from "../../../lib/admin-labels";
import { api } from "../../../lib/api";
import { formatDate } from "../../../lib/format";
import { errorMessage } from "../../../lib/humanize-error";

interface SubscriptionRow {
  id: string;
  status: string;
  currentPeriodEnd: string | null;
  dietitianAccount: { id: string; name: string };
  plan: { name: string; slug: string };
}

export default function AdminSubscriptionsPage() {
  const [rows, setRows] = useState<SubscriptionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<SubscriptionRow[]>("/api/v1/admin/subscriptions")
      .then(setRows)
      .catch((err) => setError(errorMessage(err, "Unable to load subscriptions")));
  }, []);

  return (
    <AdminPage
      eyebrow="Product"
      title="Subscriptions"
      description="Roster of clinic subscriptions. Open a clinic to assign, renew, or change access."
      error={error}
    >
      <Section title="All subscriptions">
        {rows === null ? <LoadingState>Loading subscriptions…</LoadingState> : null}
        {rows && rows.length === 0 ? (
          <EmptyState title="No subscriptions yet">Subscriptions appear when a clinic is assigned a plan.</EmptyState>
        ) : null}
        {rows && rows.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <th>Clinic</th>
                <th>Plan</th>
                <th>Period end</th>
                <th>Subscription</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td label="Clinic">
                    <Link href={`/admin/dietitians/${row.dietitianAccount.id}?tab=subscription`} className="ui-link">
                      {row.dietitianAccount.name}
                    </Link>
                  </Td>
                  <Td label="Plan">{row.plan.name}</Td>
                  <Td label="Period end">{row.currentPeriodEnd ? formatDate(row.currentPeriodEnd) : "Open-ended"}</Td>
                  <Td label="Subscription">
                    <StatusBadge status={row.status} label={scopedStatusLabel("subscription", row.status)} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Section>
    </AdminPage>
  );
}
