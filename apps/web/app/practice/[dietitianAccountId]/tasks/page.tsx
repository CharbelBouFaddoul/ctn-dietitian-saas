"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Alert,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  Tabs,
  Textarea,
} from "@nutrition-saas/ui";
import { ListFilters, ListPager, LIST_SEARCH_DEBOUNCE_MS } from "../../../../components/list-filters";
import { api } from "../../../../lib/api";
import { clientDisplayName } from "../../../../lib/client-identity";
import { statusLabel } from "../../../../lib/practice-labels";
import { errorMessage } from "../../../../lib/humanize-error";
import { formatDate } from "../../../../lib/format";

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  clientId: string | null;
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
  displayName?: string | null;
}

const PAGE_SIZE = 20;
const TITLE_MAX = 200;
const VIEWS = ["all", "due_today", "upcoming", "overdue", "completed"] as const;
type ViewKey = (typeof VIEWS)[number];
type Editor = { mode: "create" } | { mode: "edit"; task: TaskRow };

const VIEW_LABELS: Record<ViewKey, string> = {
  all: "All",
  due_today: "Due today",
  upcoming: "Upcoming",
  overdue: "Overdue",
  completed: "Completed",
};

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function previewTitle(title: string, max = 72): string {
  const compact = title.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

function isLockedStatus(status: string): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

export default function TasksPage() {
  const params = useParams<{ dietitianAccountId: string }>();
  const dietitianAccountId = params.dietitianAccountId;
  const [data, setData] = useState<ListResponse | null>(null);
  const [view, setView] = useState<ViewKey>("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
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
    const next = searchDraft.trim();
    if (next === search) return;
    const timer = window.setTimeout(() => {
      setSearch(next);
      setPage(1);
    }, LIST_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search, searchDraft]);

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load tasks")));
  }, [dietitianAccountId, view, page, search]);

  function openCreate() {
    setTitle("");
    setClientId("");
    setDueAt("");
    setFormError(null);
    setError(null);
    setEditor({ mode: "create" });
  }

  function openEdit(task: TaskRow) {
    setTitle(task.title);
    setClientId(task.clientId ?? "");
    setDueAt(toDatetimeLocal(task.dueAt));
    setFormError(null);
    setError(null);
    setEditor({ mode: "edit", task });
  }

  function closeEditor() {
    if (formBusy) return;
    setEditor(null);
    setFormError(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor || readOnly) return;
    const nextTitle = title.trim();
    if (!nextTitle) {
      setFormError("Enter a task title.");
      return;
    }
    setFormBusy(true);
    setFormError(null);
    try {
      if (editor.mode === "create") {
        await api(`/api/v1/dietitian/${dietitianAccountId}/tasks`, {
          method: "POST",
          body: JSON.stringify({
            title: nextTitle,
            clientId: clientId || undefined,
            dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          }),
        });
        setEditor(null);
        setView("all");
        setPage(1);
        setSearchDraft("");
        setSearch("");
        await load({ view: "all", page: 1, search: "" });
      } else {
        await api(`/api/v1/dietitian/${dietitianAccountId}/tasks/${editor.task.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: nextTitle,
            clientId: clientId || null,
            dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          }),
        });
        setEditor(null);
        await load();
      }
    } catch (err) {
      setFormError(
        errorMessage(err, editor.mode === "create" ? "Could not create task" : "Could not update task"),
      );
    } finally {
      setFormBusy(false);
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
  const hasSearch = Boolean(search.trim());
  const readOnly = editor?.mode === "edit" && isLockedStatus(editor.task.status);
  const dialogTitle =
    editor?.mode === "create" ? "New task" : readOnly ? "Task" : "Edit task";

  function clearSearch() {
    setSearchDraft("");
    setSearch("");
    setPage(1);
  }

  return (
    <section className="ui-list-page">
      <PageHeader
        title="Tasks"
        description="Internal clinic tasks — not visible to clients. Tasks with a due date also appear on the calendar."
        actions={<Button onClick={openCreate}>Add task</Button>}
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

      <ListFilters
        search={searchDraft}
        onSearchChange={setSearchDraft}
        searchPlaceholder="Search tasks"
        hasFilters={hasSearch}
        onClear={clearSearch}
        count={data?.total ?? 0}
        countNoun="task"
        loading={!data && !error}
      />

      <div className="ui-list-results">
        {items.length === 0 ? (
          <EmptyState
            title="No tasks in this view"
            action={
              view === "all" && !hasSearch ? (
                <Button onClick={openCreate}>Add task</Button>
              ) : hasSearch ? (
                <Button variant="secondary" onClick={clearSearch}>
                  Clear
                </Button>
              ) : undefined
            }
          >
            {hasSearch
              ? "Try a different search, or clear filters."
              : view === "all"
                ? "Create a task and optionally set a due date for the calendar."
                : "Try switching to a different view or create a new task."}
          </EmptyState>
        ) : (
          <ul className="ui-list-cards">
            {items.map((row) => {
              const due = row.dueAt ? `Due ${formatDate(row.dueAt)}` : "No due date";
              const locked = isLockedStatus(row.status);
              return (
                <li key={row.id}>
                  <article className="ui-list-cards__item">
                    <button
                      type="button"
                      className="ui-list-cards__main"
                      title={row.title}
                      aria-label={`${locked ? "View" : "Edit"} task: ${previewTitle(row.title)}`}
                      onClick={() => openEdit(row)}
                    >
                      <strong>{row.title}</strong>
                      <p>
                        {row.clientName ?? "No client"} · {due}
                      </p>
                    </button>
                    <div className="ui-list-cards__aside">
                      <StatusBadge status={row.status} label={statusLabel(row.status)} />
                      <div className="ui-list-cards__actions">
                        <button
                          type="button"
                          className="ui-list-cards__action"
                          onClick={() => openEdit(row)}
                        >
                          {locked ? "View" : "Edit"}
                        </button>
                        {!locked ? (
                          <button
                            type="button"
                            className="ui-list-cards__action"
                            onClick={() => void complete(row.id)}
                          >
                            Mark done
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="ui-list-cards__action is-danger"
                          onClick={() => setPendingDelete(row)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
        <ListPager
          page={page}
          pageCount={pageCount}
          onPrev={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => Math.min(pageCount, current + 1))}
        />
      </div>

      <Dialog open={editor !== null} title={dialogTitle} onClose={closeEditor}>
        <form className="ui-stack" style={{ gap: 14 }} onSubmit={(event) => void save(event)}>
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          {readOnly ? (
            <p className="ui-muted" style={{ margin: 0 }}>
              Completed and cancelled tasks can’t be edited. You can still read the full title here.
            </p>
          ) : (
            <p className="ui-muted" style={{ margin: 0 }}>
              Set a due date to show this task on the clinic calendar.
            </p>
          )}
          <Field label="Title">
            <Textarea
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              placeholder="Describe the task…"
              rows={3}
              maxLength={TITLE_MAX}
              autoFocus={!readOnly}
              readOnly={readOnly}
              style={{ overflowWrap: "anywhere" }}
            />
          </Field>
          <Field label="Client" hint="Optional">
            <Select
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              disabled={readOnly}
            >
              <option value="">None</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {clientDisplayName(client)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date & time" hint="Shown on the calendar for that day.">
            <Input
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              disabled={readOnly}
            />
          </Field>
          <div className="ui-row" style={{ gap: 10, justifyContent: "flex-end" }}>
            <Button type="button" variant="secondary" disabled={formBusy} onClick={closeEditor}>
              {readOnly ? "Close" : "Cancel"}
            </Button>
            {readOnly ? null : (
              <Button type="submit" disabled={formBusy || !title.trim()}>
                {formBusy
                  ? editor?.mode === "create"
                    ? "Creating…"
                    : "Saving…"
                  : editor?.mode === "create"
                    ? "Create task"
                    : "Save changes"}
              </Button>
            )}
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this task?"
        description={
          pendingDelete
            ? `“${previewTitle(pendingDelete.title)}” will be removed from your task list and calendar. This cannot be undone.`
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
