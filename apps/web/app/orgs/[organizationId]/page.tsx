"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../lib/api";
import { buttonStyle, cellStyle, fieldStyle, inputStyle, tableStyle } from "./practice-shell";

interface Dashboard {
  clientCount: number;
  activeClients: number;
  newClientsThisMonth: number;
  inactiveClients: number;
  tasksDueToday: number;
  tasksOverdue: number;
  myTasks: number;
  myOverdueTasks: number;
  outstandingInvoices: number;
  overdueInvoices: number;
  paidThisMonth: number;
  invoicedThisMonth: number;
  needsAttention: Array<{ clientId: string; clientName: string; reasons: string[] }>;
  recentlyActive: Array<{ clientId: string; clientName: string; lastActivityAt: string }>;
  noRecentActivity: Array<{ clientId: string; clientName: string; reason: string }>;
  upcomingAppointments: Array<{
    id: string;
    title: string;
    startAt: string;
    clientId: string;
    clientName: string;
  }>;
  recentActivity: Array<{
    id: string;
    type: string;
    occurredAt: string;
    clientId: string;
    clientName: string;
  }>;
}

export default function PracticeDashboardPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const [data, setData] = useState<Dashboard | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setData(await api<Dashboard>(`/api/v1/organizations/${organizationId}/practice/dashboard`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load dashboard");
    }
  }

  useEffect(() => {
    void load();
  }, [organizationId]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api(`/api/v1/organizations/${organizationId}/clients`, {
        method: "POST",
        body: JSON.stringify({ firstName, lastName }),
      });
      setFirstName("");
      setLastName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <section>
      <h1>Practice dashboard</h1>
      <p style={{ color: "var(--color-muted)" }}>
        Operational overview from clients, invoices, tasks, appointments, and timeline data.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        <Card label="Active clients" value={data?.activeClients} />
        <Card label="New this month" value={data?.newClientsThisMonth} />
        <Card label="Inactive" value={data?.inactiveClients} />
        <Card label="Outstanding invoices" value={data?.outstandingInvoices} />
        <Card label="Overdue invoices" value={data?.overdueInvoices} />
        <Card label="Invoiced this month" value={data?.invoicedThisMonth} money />
        <Card label="Paid this month" value={data?.paidThisMonth} money />
        <Card label="My tasks" value={data?.myTasks} />
        <Card label="My overdue tasks" value={data?.myOverdueTasks} />
      </div>

      <p>
        <Link href={`/orgs/${organizationId}/clients`} style={{ color: "var(--color-accent)" }}>
          Open client list
        </Link>
        {" · "}
        <Link href={`/orgs/${organizationId}/invoices`} style={{ color: "var(--color-accent)" }}>
          Invoices
        </Link>
        {" · "}
        <Link href={`/orgs/${organizationId}/tasks`} style={{ color: "var(--color-accent)" }}>
          Tasks
        </Link>
        {" · "}
        <Link href={`/orgs/${organizationId}/analytics`} style={{ color: "var(--color-accent)" }}>
          Analytics
        </Link>
      </p>

      <h2>Needs attention</h2>
      <ul>
        {(data?.needsAttention ?? []).map((row) => (
          <li key={row.clientId}>
            <Link href={`/orgs/${organizationId}/clients/${row.clientId}`} style={{ color: "var(--color-accent)" }}>
              {row.clientName}
            </Link>
            : {row.reasons.join(" · ")}
          </li>
        ))}
      </ul>
      {(data?.needsAttention ?? []).length === 0 ? <p>No clients flagged.</p> : null}

      <h2>Quick client</h2>
      <form onSubmit={(event) => void onCreate(event)} style={{ maxWidth: 360 }}>
        <label style={fieldStyle}>
          First name
          <input style={inputStyle} value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
        </label>
        <label style={fieldStyle}>
          Last name
          <input style={inputStyle} value={lastName} onChange={(event) => setLastName(event.target.value)} required />
        </label>
        <button type="submit" style={buttonStyle}>
          Create client
        </button>
      </form>

      <h2>Upcoming appointments</h2>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={cellStyle}>When</th>
            <th style={cellStyle}>Client</th>
            <th style={cellStyle}>Title</th>
          </tr>
        </thead>
        <tbody>
          {(data?.upcomingAppointments ?? []).map((row) => (
            <tr key={row.id}>
              <td style={cellStyle}>{new Date(row.startAt).toLocaleString()}</td>
              <td style={cellStyle}>
                <Link href={`/orgs/${organizationId}/clients/${row.clientId}`} style={{ color: "var(--color-accent)" }}>
                  {row.clientName}
                </Link>
              </td>
              <td style={cellStyle}>{row.title}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(data?.upcomingAppointments ?? []).length === 0 ? <p>No upcoming appointments.</p> : null}

      <h2>Recent activity</h2>
      <ul>
        {(data?.recentActivity ?? []).map((row) => (
          <li key={row.id}>
            <Link href={`/orgs/${organizationId}/clients/${row.clientId}`} style={{ color: "var(--color-accent)" }}>
              {row.clientName}
            </Link>{" "}
            · {row.type} · {new Date(row.occurredAt).toLocaleString()}
          </li>
        ))}
      </ul>
      {(data?.recentActivity ?? []).length === 0 ? <p>No timeline activity yet.</p> : null}
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
    </section>
  );
}

function Card({ label, value, money }: { label: string; value?: number; money?: boolean }) {
  const display = value === undefined ? "—" : money ? value.toFixed(2) : String(value);
  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 12, background: "var(--color-surface)" }}>
      <div style={{ fontSize: 12, color: "var(--color-muted)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600 }}>{display}</div>
    </div>
  );
}
