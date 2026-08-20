"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
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
            className="ui-tab"
            data-active={view === item}
            onClick={() => setView(item)}
          >
            {item.replaceAll("_", " ")}
          </button>
        ))}
      </div>

      <form onSubmit={(event) => void create(event).catch((err) => setError(String(err)))} style={{ display: "grid", gap: 12, maxWidth: 640 }}>
        <label className="ui-field">
          Title
          <input className="ui-input" value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label className="ui-field">
          Client (optional)
          <select className="ui-input" value={clientId} onChange={(event) => setClientId(event.target.value)}>
            <option value="">None</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.firstName} {client.lastName}
              </option>
            ))}
          </select>
        </label>
        <label className="ui-field">
          Assignee
          <select className="ui-input" value={assignedMemberId} onChange={(event) => setAssignedMemberId(event.target.value)}>
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.email}
              </option>
            ))}
          </select>
        </label>
        <label className="ui-field">
          Due
          <input className="ui-input" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
        </label>
        <button type="submit" className="ui-btn ui-btn--primary" style={{width: 160}}>
          Create task
        </button>
      </form>

      <table className="ui-table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Client</th>
            <th>Assignee</th>
            <th>Due</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((row) => (
            <tr key={row.id}>
              <td>{row.title}</td>
              <td>{row.clientName ?? "—"}</td>
              <td>{row.assigneeEmail ?? "—"}</td>
              <td>{row.dueAt ? new Date(row.dueAt).toLocaleString() : "—"}</td>
              <td>{row.status}</td>
              <td>
                {row.status !== "COMPLETED" && row.status !== "CANCELLED" ? (
                  <button type="button" className="ui-btn ui-btn--primary" onClick={() => void complete(row.id)}>
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
