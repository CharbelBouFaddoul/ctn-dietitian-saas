"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
} from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import {
  CATEGORY_LABELS,
  type CalendarView,
  addDays,
  combineLocalDateTime,
  formatHourLabel,
  isSameDay,
  rangeForView,
  shiftAnchor,
  startOfDay,
  startOfWeek,
  toDateInputValue,
  toTimeInputValue,
} from "../../../../lib/calendar-range";
import { clientDisplayName, clientIdentityLine } from "../../../../lib/client-identity";
import { errorMessage } from "../../../../lib/humanize-error";
import { formatMessageTime } from "../../../../lib/chat-format";
import { statusLabel } from "../../../../lib/practice-labels";

interface ClientOption {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  email?: string | null;
}

interface AppointmentRow {
  id: string;
  clientId: string;
  title: string;
  category: string;
  startAt: string;
  endAt: string;
  status: string;
  notes: string | null;
  proposedStartAt: string | null;
  proposedEndAt: string | null;
  proposedByUserId: string | null;
  client?: ClientOption;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  clientName: string | null;
  clientId: string | null;
}

/** Unified calendar item for rendering appointments and due tasks. */
interface CalendarItem {
  id: string;
  kind: "appointment" | "task";
  title: string;
  startAt: string;
  endAt: string;
  status: string;
  category: string;
  clientId?: string | null;
  clientName?: string | null;
  client?: ClientOption;
  appointment?: AppointmentRow;
  task?: TaskRow;
}

type FormMode = "create" | "edit" | null;

/** Full day: midnight → 11 PM (24 hour rows). */
const DAY_START_HOUR = 0;
const DAY_HOURS = Array.from({ length: 24 }, (_, i) => DAY_START_HOUR + i);
const HOUR_ROW_REM = 3.75;
const CATEGORIES = Object.keys(CATEGORY_LABELS);

function clientLabel(c?: ClientOption | null, fallbackId?: string): string {
  if (!c) return fallbackId ? "Client" : "—";
  return clientDisplayName(c);
}

function eventLayout(startAt: string, endAt: string): { top: number; height: number; visible: boolean; startMin: number; endMin: number } {
  const start = new Date(startAt);
  const end = new Date(endAt);
  let startMin = (start.getHours() - DAY_START_HOUR) * 60 + start.getMinutes();
  let endMin = (end.getHours() - DAY_START_HOUR) * 60 + end.getMinutes();
  if (endMin <= startMin) {
    endMin = Math.min(24 * 60, startMin + Math.max(30, (end.getTime() - start.getTime()) / 60000));
  }
  const gridStart = 0;
  const gridEnd = 24 * 60;
  const clippedStart = Math.max(gridStart, Math.min(gridEnd, startMin));
  const clippedEnd = Math.max(gridStart, Math.min(gridEnd, Math.max(endMin, startMin + 30)));
  if (clippedEnd <= gridStart || clippedStart >= gridEnd) {
    return { top: 0, height: 0, visible: false, startMin: clippedStart, endMin: clippedEnd };
  }
  const top = (clippedStart / 60) * HOUR_ROW_REM;
  // Keep blocks tall enough for title + time so text does not crush together.
  const height = Math.max(2.85, ((clippedEnd - clippedStart) / 60) * HOUR_ROW_REM);
  return { top, height, visible: true, startMin: clippedStart, endMin: clippedEnd };
}

type PositionedItem = CalendarItem & {
  top: number;
  height: number;
  col: number;
  colCount: number;
};

/** Place overlapping events side-by-side instead of stacking on top of each other. */
function positionDayItems(items: CalendarItem[]): PositionedItem[] {
  const prepared = items
    .map((item) => {
      const layout = eventLayout(item.startAt, item.endAt);
      if (!layout.visible) return null;
      // Pack by on-screen height so min-height blocks do not paint over each other.
      const visualEndMin = layout.startMin + (layout.height / HOUR_ROW_REM) * 60;
      return { item, ...layout, packEnd: visualEndMin };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => a.startMin - b.startMin || b.packEnd - a.packEnd);

  const colEnds: number[] = [];
  const placed: Array<(typeof prepared)[number] & { col: number }> = [];
  for (const row of prepared) {
    let col = colEnds.findIndex((end) => end <= row.startMin);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(row.packEnd);
    } else {
      colEnds[col] = row.packEnd;
    }
    placed.push({ ...row, col });
  }

  // Cluster-wide column count so siblings share the same width.
  const clusterId = new Array(placed.length).fill(-1);
  let nextCluster = 0;
  for (let i = 0; i < placed.length; i++) {
    if (clusterId[i] !== -1) continue;
    const queue = [i];
    clusterId[i] = nextCluster;
    for (let q = 0; q < queue.length; q++) {
      const cur = queue[q]!;
      const a = placed[cur]!;
      for (let j = 0; j < placed.length; j++) {
        if (clusterId[j] !== -1) continue;
        const b = placed[j]!;
        if (a.startMin < b.packEnd && a.packEnd > b.startMin) {
          clusterId[j] = nextCluster;
          queue.push(j);
        }
      }
    }
    nextCluster += 1;
  }

  const clusterCols = new Array(nextCluster).fill(1);
  for (let i = 0; i < placed.length; i++) {
    const c = clusterId[i]!;
    clusterCols[c] = Math.max(clusterCols[c]!, placed[i]!.col + 1);
  }

  return placed.map((row, i) => ({
    ...row.item,
    top: row.top,
    height: row.height,
    col: row.col,
    colCount: clusterCols[clusterId[i]!] ?? 1,
  }));
}

function roundToHour(d: Date): Date {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  if (d.getMinutes() >= 30) x.setHours(x.getHours() + 1);
  return x;
}

function appointmentStatusLabel(status: string): string {
  if (status === "REQUESTED") return "Visit requested";
  if (status === "RESCHEDULE_PENDING") return "Reschedule pending";
  if (status === "CANCELLATION_PENDING") return "Cancellation pending";
  if (status === "NO_SHOW") return "No-show";
  return statusLabel(status);
}

export default function CalendarPage() {
  const params = useParams<{ dietitianAccountId: string }>();
  const searchParams = useSearchParams();
  const dietitianAccountId = params.dietitianAccountId;
  const deepLinkId = searchParams.get("appointmentId");

  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [rows, setRows] = useState<AppointmentRow[] | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [mode, setMode] = useState<FormMode>(null);
  const [selected, setSelected] = useState<AppointmentRow | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
  const [confirmDeleteTask, setConfirmDeleteTask] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    clientId: "",
    title: "Consultation",
    category: "CONSULTATION",
    date: toDateInputValue(new Date()),
    startTime: "09:00",
    endTime: "10:00",
    notes: "",
  });

  const range = useMemo(() => rangeForView(anchor, view), [anchor, view]);

  const load = useCallback(async () => {
    const from = range.from.toISOString();
    const to = range.to.toISOString();
    const [appointments, taskList] = await Promise.all([
      api<AppointmentRow[]>(
        `/api/v1/dietitian/${dietitianAccountId}/appointments?from=${from}&to=${to}`,
      ),
      api<{ items: TaskRow[] }>(
        `/api/v1/dietitian/${dietitianAccountId}/tasks?dueFrom=${from}&dueTo=${to}&limit=100`,
      ),
    ]);
    setRows(appointments);
    setTasks(
      (taskList.items ?? []).filter(
        (task) =>
          Boolean(task.dueAt) &&
          task.status !== "CANCELLED",
      ),
    );
  }, [dietitianAccountId, range.from, range.to]);

  const calendarItems = useMemo<CalendarItem[]>(() => {
    const appointmentItems: CalendarItem[] = (rows ?? []).map((row) => ({
      id: `appt-${row.id}`,
      kind: "appointment",
      title: row.title,
      startAt: row.startAt,
      endAt: row.endAt,
      status: row.status,
      category: row.category || "CONSULTATION",
      clientId: row.clientId,
      client: row.client,
      appointment: row,
    }));
    const taskItems: CalendarItem[] = tasks
      .filter((task) => task.dueAt)
      .map((task) => {
        const start = new Date(task.dueAt!);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        return {
          id: `task-${task.id}`,
          kind: "task" as const,
          title: task.title,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          status: task.status,
          category: "TASK",
          clientId: task.clientId,
          clientName: task.clientName,
          task,
        };
      });
    return [...appointmentItems, ...taskItems];
  }, [rows, tasks]);

  useEffect(() => {
    void api<{ user: { id: string } }>("/api/v1/auth/me")
      .then((me) => setMeId(me.user.id))
      .catch(() => setMeId(null));
    void api<{ items: ClientOption[] }>(`/api/v1/dietitian/${dietitianAccountId}/clients?pageSize=50`)
      .then((res) => setClients(res.items ?? []))
      .catch(() => setClients([]));
  }, [dietitianAccountId]);

  useEffect(() => {
    if (mode !== "create" || form.clientId || clients.length === 0) return;
    setForm((f) => ({ ...f, clientId: clients[0]!.id }));
  }, [clients, mode, form.clientId]);

  useEffect(() => {
    setError(null);
    void load().catch((err) => setError(errorMessage(err, "Unable to load calendar")));
  }, [load]);

  useEffect(() => {
    if (!deepLinkId || !rows) return;
    const hit = rows.find((r) => r.id === deepLinkId);
    if (hit) {
      setSelected(hit);
      setMode("edit");
      populateForm(hit);
    } else {
      void api<AppointmentRow>(`/api/v1/dietitian/${dietitianAccountId}/appointments/${deepLinkId}`)
        .then((row) => {
          setSelected(row);
          setMode("edit");
          populateForm(row);
        })
        .catch(() => undefined);
    }
  }, [deepLinkId, rows, dietitianAccountId]);

  function populateForm(row: AppointmentRow) {
    const start = new Date(row.startAt);
    let end = new Date(row.endAt);
    if (!(start.getTime() < end.getTime())) {
      end = new Date(start.getTime() + 60 * 60 * 1000);
    }
    setForm({
      clientId: row.clientId,
      title: row.title,
      category: row.category || "CONSULTATION",
      date: toDateInputValue(start),
      startTime: toTimeInputValue(start),
      endTime: toTimeInputValue(end),
      notes: row.notes ?? "",
    });
  }

  function openCreate(at: Date) {
    const start = roundToHour(at);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    setSelected(null);
    setMode("create");
    setFormError(null);
    setForm({
      clientId: clients[0]?.id ?? "",
      title: "Consultation",
      category: "CONSULTATION",
      date: toDateInputValue(start),
      startTime: toTimeInputValue(start),
      endTime: toTimeInputValue(end),
      notes: "",
    });
  }

  function openEdit(row: AppointmentRow) {
    setSelected(row);
    setMode("edit");
    setFormError(null);
    populateForm(row);
  }

  function closeDialog() {
    setMode(null);
    setSelected(null);
    setFormError(null);
  }

  function closeTaskDialog() {
    setSelectedTask(null);
    setConfirmDeleteTask(false);
    setFormError(null);
  }

  async function deleteSelectedTask() {
    if (!selectedTask) return;
    setSaving(true);
    setFormError(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/tasks/${selectedTask.id}`, {
        method: "DELETE",
      });
      closeTaskDialog();
      await load();
    } catch (err) {
      setConfirmDeleteTask(false);
      setFormError(errorMessage(err, "Unable to delete task"));
    } finally {
      setSaving(false);
    }
  }

  async function completeSelectedTask() {
    if (!selectedTask) return;
    setSaving(true);
    setFormError(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/tasks/${selectedTask.id}/complete`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      closeTaskDialog();
      await load();
    } catch (err) {
      setFormError(errorMessage(err, "Unable to complete task"));
    } finally {
      setSaving(false);
    }
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!form.clientId || !form.title.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const startAt = combineLocalDateTime(form.date, form.startTime);
      let endAt = combineLocalDateTime(form.date, form.endTime);
      const startMs = new Date(startAt).getTime();
      const endMs = new Date(endAt).getTime();
      if (!(startMs < endMs)) {
        // Recover zero-length / inverted times from earlier saves.
        const fixedEnd = new Date(startMs + 60 * 60 * 1000);
        endAt = fixedEnd.toISOString();
        setForm((f) => ({ ...f, endTime: toTimeInputValue(fixedEnd) }));
      }
      if (mode === "create") {
        await api(`/api/v1/dietitian/${dietitianAccountId}/clients/${form.clientId}/appointments`, {
          method: "POST",
          body: JSON.stringify({
            title: form.title,
            category: form.category,
            startAt,
            endAt,
            notes: form.notes || undefined,
          }),
        });
      } else if (selected) {
        await api(`/api/v1/dietitian/${dietitianAccountId}/appointments/${selected.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: form.title,
            category: form.category,
            startAt,
            endAt,
            clientId: form.clientId,
            notes: form.notes,
          }),
        });
      }
      closeDialog();
      await load();
    } catch (err) {
      setFormError(errorMessage(err, "Unable to save appointment"));
    } finally {
      setSaving(false);
    }
  }

  async function onCancelAppointment() {
    if (!selected) return;
    setSaving(true);
    setFormError(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/appointments/${selected.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      closeDialog();
      await load();
    } catch (err) {
      setFormError(errorMessage(err, "Unable to cancel"));
    } finally {
      setSaving(false);
    }
  }

  async function onAcceptCancellation() {
    if (!selected) return;
    setSaving(true);
    setFormError(null);
    try {
      await api(
        `/api/v1/dietitian/${dietitianAccountId}/appointments/${selected.id}/accept-cancellation`,
        { method: "POST", body: JSON.stringify({}) },
      );
      closeDialog();
      await load();
    } catch (err) {
      setFormError(errorMessage(err, "Unable to approve cancellation"));
    } finally {
      setSaving(false);
    }
  }

  async function onRejectCancellation() {
    if (!selected) return;
    setSaving(true);
    setFormError(null);
    try {
      await api(
        `/api/v1/dietitian/${dietitianAccountId}/appointments/${selected.id}/reject-cancellation`,
        { method: "POST", body: JSON.stringify({}) },
      );
      closeDialog();
      await load();
    } catch (err) {
      setFormError(errorMessage(err, "Unable to decline cancellation"));
    } finally {
      setSaving(false);
    }
  }

  async function onPropose() {
    if (!selected) return;
    setSaving(true);
    setFormError(null);
    try {
      const startAt = combineLocalDateTime(form.date, form.startTime);
      const endAt = combineLocalDateTime(form.date, form.endTime);
      await api(
        `/api/v1/dietitian/${dietitianAccountId}/appointments/${selected.id}/propose-reschedule`,
        { method: "POST", body: JSON.stringify({ startAt, endAt }) },
      );
      closeDialog();
      await load();
    } catch (err) {
      setFormError(errorMessage(err, "Unable to propose reschedule"));
    } finally {
      setSaving(false);
    }
  }

  async function onAccept() {
    if (!selected) return;
    setSaving(true);
    try {
      await api(
        `/api/v1/dietitian/${dietitianAccountId}/appointments/${selected.id}/accept-reschedule`,
        { method: "POST", body: JSON.stringify({}) },
      );
      closeDialog();
      await load();
    } catch (err) {
      setFormError(errorMessage(err, "Unable to accept"));
    } finally {
      setSaving(false);
    }
  }

  async function onReject() {
    if (!selected) return;
    setSaving(true);
    try {
      await api(
        `/api/v1/dietitian/${dietitianAccountId}/appointments/${selected.id}/reject-reschedule`,
        { method: "POST", body: JSON.stringify({}) },
      );
      closeDialog();
      await load();
    } catch (err) {
      setFormError(errorMessage(err, "Unable to reject"));
    } finally {
      setSaving(false);
    }
  }

  async function onAcceptRequest() {
    if (!selected) return;
    setSaving(true);
    setFormError(null);
    try {
      await api(
        `/api/v1/dietitian/${dietitianAccountId}/appointments/${selected.id}/accept-request`,
        { method: "POST", body: JSON.stringify({}) },
      );
      closeDialog();
      await load();
    } catch (err) {
      setFormError(errorMessage(err, "Unable to accept visit request"));
    } finally {
      setSaving(false);
    }
  }

  async function onDeclineRequest() {
    if (!selected) return;
    setSaving(true);
    setFormError(null);
    try {
      await api(
        `/api/v1/dietitian/${dietitianAccountId}/appointments/${selected.id}/decline-request`,
        { method: "POST", body: JSON.stringify({}) },
      );
      closeDialog();
      await load();
    } catch (err) {
      setFormError(errorMessage(err, "Unable to decline visit request"));
    } finally {
      setSaving(false);
    }
  }

  const titleLabel = useMemo(() => {
    if (view === "day") {
      return anchor.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
    if (view === "week") {
      const from = startOfWeek(anchor);
      const to = addDays(from, 6);
      return `${from.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${to.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [anchor, view]);

  const today = startOfDay(new Date());
  const patientProposed =
    selected?.status === "RESCHEDULE_PENDING" &&
    selected.proposedByUserId &&
    meId &&
    selected.proposedByUserId !== meId;

  return (
    <section className="ui-cal-page">
      <PageHeader
        title="Calendar"
        description="Appointments and due tasks by day, week, or month."
        actions={
          <Button type="button" onClick={() => openCreate(new Date())}>
            New appointment
          </Button>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="ui-cal-toolbar">
        <div className="ui-cal-toolbar__nav">
          <Button type="button" variant="secondary" onClick={() => setAnchor(today)}>
            Today
          </Button>
          <Button type="button" variant="secondary" onClick={() => setAnchor(shiftAnchor(anchor, view, -1))}>
            ‹
          </Button>
          <Button type="button" variant="secondary" onClick={() => setAnchor(shiftAnchor(anchor, view, 1))}>
            ›
          </Button>
          <strong className="ui-cal-toolbar__title">{titleLabel}</strong>
        </div>
        <div className="ui-cal-toolbar__views" role="group" aria-label="Calendar view">
          {(["month", "week", "day"] as CalendarView[]).map((v) => (
            <button
              key={v}
              type="button"
              className={`ui-cal-view-btn${view === v ? " is-active" : ""}`}
              onClick={() => setView(v)}
            >
              {v[0]!.toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {rows === null && !error ? (
        <LoadingState>Loading calendar…</LoadingState>
      ) : view === "month" ? (
        <MonthGrid
          anchor={anchor}
          today={today}
          items={calendarItems}
          onDayClick={(d) => openCreate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9))}
          onSelectAppointment={openEdit}
          onSelectTask={setSelectedTask}
        />
      ) : (
        <TimeGrid
          view={view}
          anchor={anchor}
          today={today}
          items={calendarItems}
          onSlotClick={openCreate}
          onSelectAppointment={openEdit}
          onSelectTask={setSelectedTask}
        />
      )}

      <Dialog
        open={selectedTask !== null && !confirmDeleteTask}
        title="Task"
        onClose={closeTaskDialog}
        className="ui-cal-dialog"
      >
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        {selectedTask ? (
          <div className="ui-stack" style={{ gap: 14 }}>
            <div>
              <strong style={{ fontSize: "1.05rem" }}>{selectedTask.title}</strong>
              <p className="ui-muted" style={{ margin: "6px 0 0" }}>
                {selectedTask.clientName ?? "Clinic task"}
                {selectedTask.dueAt ? ` · ${new Date(selectedTask.dueAt).toLocaleString()}` : ""}
              </p>
              <p style={{ margin: "8px 0 0" }}>
                <StatusBadge status={selectedTask.status} label={statusLabel(selectedTask.status)} />
              </p>
            </div>
            <div className="ui-cal-dialog__footer">
              <div className="ui-cal-dialog__footer-secondary">
                <Button
                  type="button"
                  variant="danger"
                  disabled={saving}
                  onClick={() => setConfirmDeleteTask(true)}
                >
                  Delete task
                </Button>
              </div>
              <div className="ui-cal-dialog__footer-primary">
                <Button type="button" variant="secondary" onClick={closeTaskDialog}>
                  Close
                </Button>
                {selectedTask.status !== "COMPLETED" && selectedTask.status !== "CANCELLED" ? (
                  <Button type="button" disabled={saving} onClick={() => void completeSelectedTask()}>
                    Mark done
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteTask && selectedTask !== null}
        title="Delete this task?"
        description={
          selectedTask
            ? `“${selectedTask.title}” will be removed from your task list and calendar. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete task"
        danger
        pending={saving}
        onConfirm={() => void deleteSelectedTask()}
        onCancel={() => setConfirmDeleteTask(false)}
      />

      <Dialog
        open={mode !== null}
        title={mode === "create" ? "New appointment" : "Appointment details"}
        onClose={closeDialog}
        className="ui-cal-dialog"
      >
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        {selected?.status === "RESCHEDULE_PENDING" && selected.proposedStartAt && selected.proposedEndAt ? (
          <div className="ui-cal-proposal">
            <strong>Pending reschedule</strong>
            <p>
              Proposed: {new Date(selected.proposedStartAt).toLocaleString()} –{" "}
              {formatMessageTime(selected.proposedEndAt)}
            </p>
            {patientProposed ? (
              <div className="ui-cal-dialog__actions">
                <Button type="button" disabled={saving} onClick={() => void onAccept()}>
                  Accept
                </Button>
                <Button type="button" variant="secondary" disabled={saving} onClick={() => void onReject()}>
                  Reject
                </Button>
              </div>
            ) : (
              <p className="ui-muted">Waiting for the client to respond.</p>
            )}
          </div>
        ) : null}
        {selected?.status === "CANCELLATION_PENDING" ? (
          <div className="ui-cal-proposal">
            <strong>Cancellation requested</strong>
            <p className="ui-muted">The patient asked to cancel this appointment.</p>
            <div className="ui-cal-dialog__actions">
              <Button type="button" variant="danger" disabled={saving} onClick={() => void onAcceptCancellation()}>
                Approve cancel
              </Button>
              <Button type="button" variant="secondary" disabled={saving} onClick={() => void onRejectCancellation()}>
                Keep appointment
              </Button>
            </div>
          </div>
        ) : null}
        {selected?.status === "REQUESTED" ? (
          <div className="ui-cal-proposal">
            <strong>Visit requested</strong>
            <p className="ui-muted">The patient asked to book this time. Confirm or decline.</p>
            <div className="ui-cal-dialog__actions">
              <Button type="button" disabled={saving} onClick={() => void onAcceptRequest()}>
                Accept
              </Button>
              <Button type="button" variant="secondary" disabled={saving} onClick={() => void onDeclineRequest()}>
                Decline
              </Button>
            </div>
          </div>
        ) : null}
        <form className="ui-cal-form" onSubmit={(e) => void onSave(e)}>
          {selected ? (
            <div className="ui-cal-form__meta">
              <StatusBadge status={selected.status} label={appointmentStatusLabel(selected.status)} />
              <span className="ui-cal-form__meta-sep">·</span>
              <span>{CATEGORY_LABELS[selected.category] ?? selected.category}</span>
              <span className="ui-cal-form__meta-sep">·</span>
              <Link
                href={`/practice/${dietitianAccountId}/clients/${selected.clientId}`}
                className="ui-cal-form__link"
              >
                Open client profile
              </Link>
            </div>
          ) : null}

          <div className="ui-cal-form__grid">
            <Field label="Client">
              <Select
                value={form.clientId}
                onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                required
                disabled={
                  clients.length === 0 ||
                  (mode === "edit" &&
                    (selected?.status === "RESCHEDULE_PENDING" ||
                      selected?.status === "CANCELLATION_PENDING" ||
                      selected?.status === "REQUESTED"))
                }
              >
                <option value="" disabled>
                  {clients.length === 0 ? "No clients found" : "Select client"}
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {clientIdentityLine(c)}
                  </option>
                ))}
              </Select>
            </Field>
            {mode === "create" && clients.length === 0 ? (
              <p className="ui-muted" style={{ margin: 0 }}>
                Add a client first, then schedule from the calendar.
              </p>
            ) : null}

            <div className="ui-cal-form__pair">
              <Field label="Title">
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                  minLength={2}
                />
              </Field>
              <Field label="Category">
                <Select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="ui-cal-form__when">
              <Field label="Date">
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  required
                />
              </Field>
              <Field label="Start">
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                  required
                />
              </Field>
              <Field label="End">
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                  required
                />
              </Field>
            </div>

            <Field label="Notes">
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="Optional notes for this visit"
              />
            </Field>
          </div>

          <div className="ui-cal-dialog__footer">
            <div className="ui-cal-dialog__footer-secondary">
              {mode === "edit" && selected?.status === "SCHEDULED" ? (
                <>
                  <Button type="button" variant="secondary" disabled={saving} onClick={() => void onPropose()}>
                    Propose new time
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={saving}
                    onClick={() => void onCancelAppointment()}
                  >
                    Cancel appointment
                  </Button>
                </>
              ) : null}
              {mode === "edit" && selected?.status === "RESCHEDULE_PENDING" ? (
                <Button
                  type="button"
                  variant="danger"
                  disabled={saving}
                  onClick={() => void onCancelAppointment()}
                >
                  Cancel appointment
                </Button>
              ) : null}
            </div>
            <div className="ui-cal-dialog__footer-primary">
              <Button type="button" variant="secondary" onClick={closeDialog}>
                Close
              </Button>
              {selected?.status !== "RESCHEDULE_PENDING" &&
              selected?.status !== "CANCELLATION_PENDING" &&
              selected?.status !== "REQUESTED" ? (
                <Button type="submit" disabled={saving || !form.clientId}>
                  {saving ? "Saving…" : mode === "create" ? "Create appointment" : "Save changes"}
                </Button>
              ) : null}
            </div>
          </div>
        </form>
      </Dialog>
    </section>
  );
}

function MonthGrid({
  anchor,
  today,
  items,
  onDayClick,
  onSelectAppointment,
  onSelectTask,
}: {
  anchor: Date;
  today: Date;
  items: CalendarItem[];
  onDayClick: (d: Date) => void;
  onSelectAppointment: (row: AppointmentRow) => void;
  onSelectTask: (task: TaskRow) => void;
}) {
  const start = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div className="ui-cal-month">
      <div className="ui-cal-month__head">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="ui-cal-month__grid">
        {cells.map((day) => {
          const inMonth = day.getMonth() === anchor.getMonth();
          const dayItems = items.filter((r) => isSameDay(new Date(r.startAt), day));
          return (
            <button
              key={day.toISOString()}
              type="button"
              className={`ui-cal-month__cell${isSameDay(day, today) ? " is-today" : ""}${inMonth ? "" : " is-muted"}`}
              onClick={() => onDayClick(day)}
            >
              <span className="ui-cal-month__date">{day.getDate()}</span>
              <span className="ui-cal-month__events">
                {dayItems.slice(0, 3).map((item) =>
                  item.kind === "appointment" && item.appointment ? (
                    <span
                      key={item.id}
                      className={`ui-cal-chip cat-${item.category}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectAppointment(item.appointment!);
                      }}
                      role="link"
                    >
                      {formatMessageTime(item.startAt)} {item.title}
                    </span>
                  ) : item.task ? (
                    <span
                      key={item.id}
                      className={`ui-cal-chip cat-TASK${item.status === "COMPLETED" ? " is-done" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTask(item.task!);
                      }}
                      role="link"
                    >
                      {item.title}
                    </span>
                  ) : null,
                )}
                {dayItems.length > 3 ? (
                  <span className="ui-muted">+{dayItems.length - 3} more</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimeGrid({
  view,
  anchor,
  today,
  items,
  onSlotClick,
  onSelectAppointment,
  onSelectTask,
}: {
  view: "week" | "day";
  anchor: Date;
  today: Date;
  items: CalendarItem[];
  onSlotClick: (d: Date) => void;
  onSelectAppointment: (row: AppointmentRow) => void;
  onSelectTask: (task: TaskRow) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const days =
    view === "day"
      ? [startOfDay(anchor)]
      : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const frame = window.requestAnimationFrame(() => {
      const hourPx =
        root.querySelector<HTMLElement>(".ui-cal-time__hourlabel")?.getBoundingClientRect().height ??
        HOUR_ROW_REM * 16;
      root.scrollTop = 8 * hourPx;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view, anchor]);

  return (
    <div className={`ui-cal-time${view === "day" ? " is-day" : ""}`}>
      <div className="ui-cal-time__scroll" ref={scrollRef}>
        <div className="ui-cal-time__grid">
          <div className="ui-cal-time__corner" aria-hidden="true" />
          {days.map((day) => (
            <div
              key={`head-${day.toISOString()}`}
              className={`ui-cal-time__dayhead${isSameDay(day, today) ? " is-today" : ""}`}
            >
              <strong>{day.toLocaleDateString(undefined, { weekday: "short" })}</strong>
              <span>{day.getDate()}</span>
            </div>
          ))}
          <div className="ui-cal-time__hours">
            {DAY_HOURS.map((h) => (
              <div key={h} className="ui-cal-time__hourlabel" data-hour={h}>
                {formatHourLabel(h)}
              </div>
            ))}
          </div>
          {days.map((day) => {
            const dayItems = positionDayItems(items.filter((r) => isSameDay(new Date(r.startAt), day)));
            return (
              <div key={day.toISOString()} className="ui-cal-time__col">
                {DAY_HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    className="ui-cal-time__slot"
                    aria-label={`Create at ${formatHourLabel(h)}`}
                    onClick={() => {
                      const at = new Date(day);
                      at.setHours(h, 0, 0, 0);
                      onSlotClick(at);
                    }}
                  />
                ))}
                {dayItems.map((item) => {
                  const width = `calc((100% - 0.4rem) / ${item.colCount})`;
                  const left = `calc(0.2rem + ${item.col} * ((100% - 0.4rem) / ${item.colCount}))`;
                  const compact = item.height < 3.4;
                  if (item.kind === "task" && item.task) {
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`ui-cal-block cat-TASK${item.status === "COMPLETED" ? " is-done" : ""}${compact ? " is-compact" : ""}`}
                        style={{ top: `${item.top}rem`, height: `${item.height}rem`, left, width }}
                        onClick={() => onSelectTask(item.task!)}
                        title={`${item.title}${item.clientName ? ` · ${item.clientName}` : ""} · ${formatMessageTime(item.startAt)}`}
                      >
                        <strong>{item.title}</strong>
                        {!compact ? <span>{item.clientName ?? "Clinic task"}</span> : null}
                        <span>{formatMessageTime(item.startAt)}</span>
                      </button>
                    );
                  }
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`ui-cal-block cat-${item.category}${item.status === "RESCHEDULE_PENDING" || item.status === "REQUESTED" ? " is-pending" : ""}${compact ? " is-compact" : ""}`}
                      style={{ top: `${item.top}rem`, height: `${item.height}rem`, left, width }}
                      onClick={() => item.appointment && onSelectAppointment(item.appointment)}
                      title={`${item.title} · ${clientLabel(item.client, item.clientId ?? undefined)} · ${formatMessageTime(item.startAt)}–${formatMessageTime(item.endAt)}`}
                    >
                      <strong>{item.title}</strong>
                      {!compact ? <span>{clientLabel(item.client, item.clientId ?? undefined)}</span> : null}
                      <span>
                        {formatMessageTime(item.startAt)}–{formatMessageTime(item.endAt)}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {items.length === 0 ? (
        <div className="ui-cal-time__empty">
          <EmptyState title="No appointments or tasks in this range">
            Click an empty slot to schedule, or add a task with a due date.
          </EmptyState>
        </div>
      ) : null}
    </div>
  );
}
