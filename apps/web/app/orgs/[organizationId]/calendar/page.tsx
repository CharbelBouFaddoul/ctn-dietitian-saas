"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, EmptyState, PageHeader, Table, Td } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { clientIdentityLine } from "../../../../lib/client-identity";
import { formatDate } from "../../../../lib/format";
import { errorMessage } from "../../../../lib/humanize-error";

interface Dashboard {
  upcomingAppointments: Array<{
    id: string;
    title: string;
    startAt: string;
    clientId: string;
    clientName: string;
    clientEmail?: string | null;
  }>;
}

export default function CalendarPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const [rows, setRows] = useState<Dashboard["upcomingAppointments"]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Dashboard>(`/api/v1/organizations/${organizationId}/practice/dashboard`)
      .then((data) => setRows(data.upcomingAppointments))
      .catch((err) => setError(errorMessage(err, "Unable to load calendar")));
  }, [organizationId]);

  return (
    <section>
      <PageHeader
        title="Calendar"
        description="Upcoming appointments from your practice dashboard. A full calendar needs a practice-wide appointments list."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {rows.length === 0 ? (
        <EmptyState title="No upcoming appointments">Schedule from a client workspace.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>When</th>
              <th>Client</th>
              <th>Title</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <Td label="When">{formatDate(row.startAt)}</Td>
                <Td label="Client">
                  <Link href={`/orgs/${organizationId}/clients/${row.clientId}`} className="ui-link">
                    {clientIdentityLine({ id: row.clientId, displayName: row.clientName, email: row.clientEmail })}
                  </Link>
                </Td>
                <Td label="Title">{row.title}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}
