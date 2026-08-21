"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  EmptyState,
  LoadingState,
  PageHeader,
  Section,
  StatusBadge,
  Table,
  Td,
} from "@nutrition-saas/ui";
import { statusLabel } from "../../../lib/admin-labels";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";

interface SubscriptionRow {
  id: string;
  status: string;
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
    <section>
      <PageHeader
        eyebrow="Commerce"
        title="Subscriptions"
        description="One subscription per clinic. Payment UI is out of scope for V1."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Section title="All subscriptions">
        {rows === null ? <LoadingState>Loading subscriptions…</LoadingState> : null}
        {rows && rows.length === 0 ? (
          <EmptyState title="No subscriptions yet">Subscriptions appear when practices are assigned a plan.</EmptyState>
        ) : null}
        {rows && rows.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <th>Clinic</th>
                <th>Plan</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td label="Clinic">
                    <Link href={`/admin/dietitians/${row.dietitianAccount.id}`} className="ui-link">
                      {row.dietitianAccount.name}
                    </Link>
                  </Td>
                  <Td label="Plan">{row.plan.name}</Td>
                  <Td label="Status">
                    <StatusBadge status={row.status} label={statusLabel(row.status)} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Section>
    </section>
  );
}
