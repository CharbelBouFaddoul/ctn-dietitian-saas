"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
import { buttonStyle, cellStyle, fieldStyle, inputStyle, tableStyle } from "../practice-shell";

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  clientName: string | null;
  assigneeEmail: string | null;
}

interface ListResponse {
  items: TaskRow[];
  total: number;
}

interface ClientRow {
  id: string;
  firstName: string;
  lastName: string;
}

interface MemberRow {
  id: string;
  email: string;
}

const VIEWS = ["all", "mine", "due_today", "upcoming", "overdue", "completed"] as const;

export default function TasksPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const [data, setData] = useState<ListResponse | null>(null);
  const [view, setView] = useState<(typeof VIEWS)[number]>("all");
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [assignedMemberId, setAssignedMemberId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [tasks, clientList, memberList] = await Promise.all([
      api<ListResponse>(`/api/v1/organizations/${organizationId}/tasks?view=${view}`),
      api<{ items: ClientRow[] }>(`/api/v1/organizations/${organizationId}/clients?pageSize=100`),
      api<MemberRow[]>(`/api/v1/organizations/${organizationId}/members`),
    ]);
    setData(tasks);
    setClients(clientList.items);
    setMembers(memberList.filter((row) => row.email));
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Unable to load tasks"));
  }, [organizationId, view]);

  async function create(event: FormEvent) {
    event.preventDefault();
    await api(`/api/v1/organizations/${organizationId}/tasks`, {
      method: "POST",
      body: JSON.stringify({
        title,
        clientId: clientId || undefined,
        assignedMemberId: assignedMemberId || undefined,
        dueAt: dueAt || undefined,
      }),
    });
    setTitle("");
    await load();
  }

  async function complete(taskId: string) {
    await api(`/api/v1/organizations/${organizationId}/tasks/${taskId}/complete`, { method: "POST", body: JSON.stringify({}) });
    await load();
  }

  return (
    <section>
      <h1>Tasks</h1>
      <p style={{ color: "var(--color-muted)" }}>Internal practice tasks — not visible to clients.</p>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {VIEWS.map((item) => (
          <button
            key={item}
            type="button"
            style={{
              ...buttonStyle,
              background: view === item ? "var(--color-accent)" : "var(--color-surface)",
              color: view === item ? "#fff" : "inherit",
              border: "1px solid var(--color-border)",
            }}
            onClick={() => setView(item)}
          >
            {item.replace("_", " ")}
          </button>
        ))}
      </div>

      <form onSubmit={(event) => void create(event).catch((err) => setError(String(err)))} style={{ display: "grid", gap: 12, maxWidth: 640 }}>
        <label style={fieldStyle}>
          Title
          <input style={inputStyle} value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label style={fieldStyle}>
          Client (optional)
          <select style={inputStyle} value={clientId} onChange={(event) => setClientId(event.target.value)}>
            <option value="">None</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.firstName} {client.lastName}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          Assignee
          <select style={inputStyle} value={assignedMemberId} onChange={(event) => setAssignedMemberId(event.target.value)}>
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.email}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          Due
          <input style={inputStyle} type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
        </label>
        <button type="submit" style={{ ...buttonStyle, width: 160 }}>
          Create task
        </button>
      </form>

      <table style={{ ...tableStyle, marginTop: 20 }}>
        <thead>
          <tr>
            <th style={cellStyle}>Task</th>
            <th style={cellStyle}>Client</th>
            <th style={cellStyle}>Assignee</th>
            <th style={cellStyle}>Due</th>
            <th style={cellStyle}>Status</th>
            <th style={cellStyle}></th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((row) => (
            <tr key={row.id}>
              <td style={cellStyle}>{row.title}</td>
              <td style={cellStyle}>{row.clientName ?? "—"}</td>
              <td style={cellStyle}>{row.assigneeEmail ?? "—"}</td>
              <td style={cellStyle}>{row.dueAt ? new Date(row.dueAt).toLocaleString() : "—"}</td>
              <td style={cellStyle}>{row.status}</td>
              <td style={cellStyle}>
                {row.status !== "COMPLETED" && row.status !== "CANCELLED" ? (
                  <button type="button" style={buttonStyle} onClick={() => void complete(row.id)}>
                    Complete
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
