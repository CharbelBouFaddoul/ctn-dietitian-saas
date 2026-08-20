"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  PageHeader,
  StatusBadge,
  Table,
  Tabs,
  Td,
} from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { statusLabel } from "../../../../lib/practice-labels";
import { errorMessage } from "../../../../lib/humanize-error";
import { formatDate } from "../../../../lib/format";

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
type ViewKey = (typeof VIEWS)[number];

const VIEW_LABELS: Record<ViewKey, string> = {
  all: "All",
  mine: "Mine",
  due_today: "Due today",
  upcoming: "Upcoming",
  overdue: "Overdue",
  completed: "Completed",
};

export default function TasksPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const [data, setData] = useState<ListResponse | null>(null);
  const [view, setView] = useState<ViewKey>("all");
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [assignedMemberId, setAssignedMemberId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);

  async function load() {
    const [tasks, clientList, memberList] = await Promise.all([
      api<ListResponse>(`/api/v1/organizations/${organizationId}/tasks?view=${view}`),
      api<{ items: ClientRow[] }>(`/api/v1/organizations/${organizationId}/clients?pageSize=50`),
      api<MemberRow[]>(`/api/v1/organizations/${organizationId}/members`),
    ]);
    setData(tasks);
    setClients(clientList.items);
    setMembers(memberList.filter((row) => row.email));
  }

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load tasks")));
  }, [organizationId, view]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setCreateBusy(true);
    setError(null);
    try {
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
    } catch (err) {
      setError(errorMessage(err, "Could not create task"));
    } finally {
      setCreateBusy(false);
    }
  }

  async function complete(taskId: string) {
    setError(null);
    try {
      await api(`/api/v1/organizations/${organizationId}/tasks/${taskId}/complete`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not complete task"));
    }
  }

  return (
    <section>
      <PageHeader
        title="Tasks"
        description="Internal practice tasks — not visible to clients."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Tabs
        items={VIEWS.map((id) => ({ id, label: VIEW_LABELS[id] }))}
        value={view}
        onChange={(id) => setView(id as ViewKey)}
      />

      <div style={{ marginTop: 16 }}>
        <Card title="New task">
          <form
            onSubmit={(event) => void create(event)}
            style={{ display: "grid", gap: 12 }}
          >
            <label className="ui-field">
              Title
              <input
                className="ui-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Describe the task…"
              />
            </label>
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
            >
              <label className="ui-field">
                Client (optional)
                <select
                  className="ui-input"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
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
                <select
                  className="ui-input"
                  value={assignedMemberId}
                  onChange={(e) => setAssignedMemberId(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.email}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="ui-field">
              Due date &amp; time
              <input
                className="ui-input"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </label>
            <div>
              <Button type="submit" disabled={createBusy}>
                {createBusy ? "Creating…" : "Create task"}
              </Button>
            </div>
          </form>
        </Card>
      </div>

      {(data?.items ?? []).length === 0 ? (
        <EmptyState title="No tasks in this view">
          {view === "all"
            ? "Use the form above to create your first task."
            : "Try switching to a different view or create a new task above."}
        </EmptyState>
      ) : (
        <Table>
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
            {(data?.items ?? []).map((row) => (
              <tr key={row.id}>
                <Td label="Task">{row.title}</Td>
                <Td label="Client">
                  <span className="ui-muted">{row.clientName ?? "—"}</span>
                </Td>
                <Td label="Assignee">
                  <span className="ui-muted">{row.assigneeEmail ?? "—"}</span>
                </Td>
                <Td label="Due">
                  <span className="ui-muted">{formatDate(row.dueAt)}</span>
                </Td>
                <Td label="Status">
                  <StatusBadge status={row.status} label={statusLabel(row.status)} />
                </Td>
                <Td label="">
                  {row.status !== "COMPLETED" && row.status !== "CANCELLED" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void complete(row.id)}
                    >
                      Mark done
                    </Button>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}
