"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, Badge, EmptyState, PageHeader, Table, Td, humanizeLabel } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { clientIdentityLine } from "../../../../lib/client-identity";
import { formatDate, statusTone } from "../../../../lib/format";
import { errorMessage } from "../../../../lib/humanize-error";

interface AppointmentRow {
  id: string;
  title: string;
  startAt: string;
  status: string;
  client: {
    id: string;
    displayName: string | null;
    firstName: string;
    lastName: string;
    email?: string | null;
  };
}

interface TaskRow {
  id: string;
  title: string;
  dueAt: string | null;
  status: string;
  clientId: string | null;
  clientName: string | null;
}

interface CalendarItem {
  id: string;
  kind: "appointment" | "task";
  at: string;
  title: string;
  status: string;
  clientId: string | null;
  clientLabel: string;
  href: string;
}

export default function CalendarPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      api<AppointmentRow[]>(`/api/v1/organizations/${organizationId}/appointments`),
      api<{ items: TaskRow[] }>(`/api/v1/organizations/${organizationId}/tasks?limit=100`),
    ])
      .then(([appointments, tasks]) => {
        const appointmentItems: CalendarItem[] = appointments.map((row) => ({
          id: `appointment-${row.id}`,
          kind: "appointment",
          at: row.startAt,
          title: row.title,
          status: row.status,
          clientId: row.client.id,
          clientLabel: clientIdentityLine({
            id: row.client.id,
            displayName: row.client.displayName,
            firstName: row.client.firstName,
            lastName: row.client.lastName,
            email: row.client.email,
          }),
          href: `/orgs/${organizationId}/clients/${row.client.id}`,
        }));
        const taskItems: CalendarItem[] = tasks.items
          .filter((row) => row.dueAt)
          .map((row) => ({
            id: `task-${row.id}`,
            kind: "task",
            at: row.dueAt as string,
            title: row.title,
            status: row.status,
            clientId: row.clientId,
            clientLabel: row.clientName ?? "Practice",
            href: row.clientId
              ? `/orgs/${organizationId}/clients/${row.clientId}`
              : `/orgs/${organizationId}/tasks`,
          }));
        setItems(
          [...appointmentItems, ...taskItems].sort(
            (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
          ),
        );
      })
      .catch((err) => setError(errorMessage(err, "Unable to load calendar")));
  }, [organizationId]);

  const now = Date.now();
  const upcoming = items.filter((row) => new Date(row.at).getTime() >= now);
  const past = items.filter((row) => new Date(row.at).getTime() < now);
  const rows = upcoming.length > 0 ? upcoming : items;

  return (
    <section>
      <PageHeader
        title="Calendar"
        description="Appointments and dated tasks for this practice. Tasks without a due date stay on the Tasks page."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {rows.length === 0 ? (
        <EmptyState title="Nothing on the calendar">
          Schedule an appointment from a client workspace, or add a due date when you create a task.
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Title</th>
              <th>Client</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <Td label="When">{formatDate(row.at)}</Td>
                <Td label="Type">{row.kind === "appointment" ? "Appointment" : "Task"}</Td>
                <Td label="Title">{row.title}</Td>
                <Td label="Client">
                  {row.clientId ? (
                    <Link href={row.href} className="ui-link">
                      {row.clientLabel}
                    </Link>
                  ) : (
                    row.clientLabel
                  )}
                </Td>
                <Td label="Status">
                  <Badge tone={statusTone(row.status)}>{humanizeLabel(row.status)}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {upcoming.length === 0 && past.length > 0 ? (
        <p className="ui-muted" style={{ marginTop: 12 }}>
          Showing recent items — nothing is scheduled after now.
        </p>
      ) : null}
    </section>
  );
}
