"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, Badge, EmptyState, PageHeader, StatusBadge } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { clientIdentityLine } from "../../../../lib/client-identity";
import { statusLabel } from "../../../../lib/practice-labels";
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

function dayLabel(at: string): string {
  const date = new Date(at);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function timeOnly(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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
          href: `/practice/${organizationId}/clients/${row.client.id}`,
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
              ? `/practice/${organizationId}/clients/${row.clientId}`
              : `/practice/${organizationId}/tasks`,
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

  // Group consecutive items by calendar day
  const dayGroups: Array<{ key: string; label: string; items: CalendarItem[] }> = [];
  for (const item of rows) {
    const key = new Date(item.at).toDateString();
    const last = dayGroups[dayGroups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      dayGroups.push({ key, label: dayLabel(item.at), items: [item] });
    }
  }

  return (
    <section>
      <PageHeader
        title="Calendar"
        description="Appointments and dated tasks, sorted chronologically. Tasks without a due date stay on the Tasks page."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {rows.length === 0 ? (
        <EmptyState title="Nothing on the calendar">
          Schedule an appointment from a client workspace, or add a due date when creating a task.
        </EmptyState>
      ) : (
        <div style={{ display: "grid", gap: 28 }}>
          {dayGroups.map((group) => (
            <div key={group.key}>
              <p
                className="ui-eyebrow"
                style={{
                  marginBottom: 10,
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                {group.label}
              </p>
              <div style={{ display: "grid", gap: 6 }}>
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "4.5rem 1fr auto",
                      gap: 16,
                      alignItems: "center",
                      padding: "10px 14px",
                      background: "var(--color-surface)",
                      borderRadius: 8,
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    <span
                      className="ui-muted"
                      style={{ fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }}
                    >
                      {timeOnly(item.at)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <Badge tone={item.kind === "appointment" ? "accent" : "neutral"}>
                          {item.kind === "appointment" ? "Appointment" : "Task"}
                        </Badge>
                        <span style={{ fontWeight: 500 }}>{item.title}</span>
                      </div>
                      <div className="ui-muted" style={{ fontSize: "0.8125rem", marginTop: 2 }}>
                        {item.clientId ? (
                          <Link href={item.href} className="ui-link">
                            {item.clientLabel}
                          </Link>
                        ) : (
                          item.clientLabel
                        )}
                      </div>
                    </div>
                    <StatusBadge status={item.status} label={statusLabel(item.status)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {upcoming.length === 0 && past.length > 0 ? (
        <p className="ui-muted" style={{ marginTop: 16, fontSize: "0.875rem" }}>
          Showing recent items — nothing is scheduled from now on.
        </p>
      ) : null}
    </section>
  );
}
