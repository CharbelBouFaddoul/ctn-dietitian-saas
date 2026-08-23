"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  FilterBar,
  Input,
  PageHeader,
  SearchInput,
  Section,
  Select,
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
}

interface ListResponse {
  items: TaskRow[];
  total: number;
  page: number;
  limit: number;
}

interface ClientRow {
  id: string;
  firstName: string;
  lastName: string;
}

const PAGE_SIZE = 20;
const VIEWS = ["all", "due_today", "upcoming", "overdue", "completed"] as const;
type ViewKey = (typeof VIEWS)[number];

const VIEW_LABELS: Record<ViewKey, string> = {
  all: "All",
  due_today: "Due today",
  upcoming: "Upcoming",
  overdue: "Overdue",
  completed: "Completed",
};

export default function TasksPage() {
  const params = useParams<{ dietitianAccountId: string }>();
  const dietitianAccountId = params.dietitianAccountId;
  const [data, setData] = useState<ListResponse | null>(null);
  const [view, setView] = useState<ViewKey>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TaskRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function load(opts?: { view?: ViewKey; page?: number; search?: string }) {
    const nextView = opts?.view ?? view;
    const nextPage = opts?.page ?? page;
    const nextSearch = opts?.search ?? search;
    const qs = new URLSearchParams();
    qs.set("view", nextView);
    qs.set("page", String(nextPage));
    qs.set("limit", String(PAGE_SIZE));
    if (nextSearch.trim()) qs.set("search", nextSearch.trim());
    const [tasks, clientList] = await Promise.all([
      api<ListResponse>(`/api/v1/dietitian/${dietitianAccountId}/tasks?${qs.toString()}`),
      api<{ items: ClientRow[] }>(`/api/v1/dietitian/${dietitianAccountId}/clients?pageSize=50`),
    ]);
    setData(tasks);
    setClients(clientList.items);
  }

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void load().catch((err) => setError(errorMessage(err, "Unable to load tasks")));
    }, search.trim() ? 250 : 0);
    return () => window.clearTimeout(handle);
  }, [dietitianAccountId, view, page, search]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setCreateBusy(true);
    setError(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title,
          clientId: clientId || undefined,
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        }),
      });
      setTitle("");
      setClientId("");
      setDueAt("");
      setShowCreate(false);
      setView("all");
      setPage(1);
      setSearch("");
      await load({ view: "all", page: 1, search: "" });
    } catch (err) {
      setError(errorMessage(err, "Could not create task"));
    } finally {
      setCreateBusy(false);
    }
  }

  async function complete(taskId: string) {
    setError(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/tasks/${taskId}/complete`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not complete task"));
    }
  }

  async function archive() {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    setError(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/tasks/${pendingDelete.id}/archive`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setPendingDelete(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not delete task"));
      setPendingDelete(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const items = data?.items ?? [];
  const listDescription = useMemo(() => {
    if (!data) return undefined;
    const base = `${data.total} task${data.total !== 1 ? "s" : ""}`;
    return search.trim() ? `${base} matching “${search.trim()}”` : base;
  }, [data, search]);

  return (
    <section className="ui-stack" style={{ gap: 24 }}>
      <PageHeader
        title="Tasks"
        description="Internal clinic tasks — not visible to clients. Tasks with a due date also appear on the calendar."
        actions={
          <Button
            onClick={() => {
              setShowCreate((open) => !open);
              setError(null);
            }}
          >
            {showCreate ? "Hide form" : "Add task"}
          </Button>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Tabs
        items={VIEWS.map((id) => ({ id, label: VIEW_LABELS[id] }))}
        value={view}
        onChange={(id) => {
          setView(id as ViewKey);
          setPage(1);
        }}
      />

      {showCreate ? (
        <Section title="New task" description="Set a due date to show this task on the clinic calendar.">
          <form onSubmit={(event) => void create(event)} className="ui-stack" style={{ gap: 14, maxWidth: 520 }}>
            <Field label="Title">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Describe the task…"
                autoFocus
              />
            </Field>
            <Field label="Client" hint="Optional">
              <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">None</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.firstName} {client.lastName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due date & time" hint="Shown on the calendar for that day.">
              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </Field>
            <div className="ui-row" style={{ gap: 10 }}>
              <Button type="submit" disabled={createBusy}>
                {createBusy ? "Creating…" : "Create task"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Section>
      ) : null}

      <Section title="Find tasks" description="Search by title or notes." tone="muted">
        <FilterBar>
          <div className="ui-filter-bar__field ui-filter-bar__field--grow">
            <p className="ui-filter-bar__label">Search</p>
            <SearchInput
              value={search}
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              placeholder="Search tasks…"
              aria-label="Search tasks"
            />
          </div>
              {search.trim() ? (
            <div className="ui-filter-bar__actions">
              <button
                type="button"
                className="ui-filter-bar__clear"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
              >
                Clear
              </button>
            </div>
          ) : null}
        </FilterBar>
      </Section>

      <Section title={VIEW_LABELS[view]} description={listDescription}>
        {items.length === 0 ? (
          <EmptyState
            title="No tasks in this view"
            action={
              view === "all" && !search.trim() ? (
                <Button onClick={() => setShowCreate(true)}>Add task</Button>
              ) : undefined
            }
          >
            {search.trim()
              ? "Try a different search, or clear filters."
              : view === "all"
                ? "Create a task and optionally set a due date for the calendar."
                : "Try switching to a different view or create a new task."}
          </EmptyState>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Client</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <Td label="Task">{row.title}</Td>
                    <Td label="Client">
                      <span className="ui-muted">{row.clientName ?? "—"}</span>
                    </Td>
                    <Td label="Due">
                      <span className="ui-muted">{formatDate(row.dueAt)}</span>
                    </Td>
                    <Td label="Status">
                      <StatusBadge status={row.status} label={statusLabel(row.status)} />
                    </Td>
                    <Td label="">
                      <div className="ui-row" style={{ gap: 8, justifyContent: "flex-end" }}>
                        {row.status !== "COMPLETED" && row.status !== "CANCELLED" ? (
                          <Button size="sm" variant="secondary" onClick={() => void complete(row.id)}>
                            Mark done
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setPendingDelete(row)}
                        >
                          Delete
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {data && data.total > data.limit ? (
              <div className="ui-row" style={{ gap: 12, marginTop: 16, alignItems: "center" }}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="ui-muted" style={{ fontSize: 13 }}>
                  Page {page} of {pageCount}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={page >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Section>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this task?"
        description={
          pendingDelete
            ? `“${pendingDelete.title}” will be removed from your task list and calendar. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete task"
        danger
        pending={deleteBusy}
        onConfirm={() => void archive()}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}
