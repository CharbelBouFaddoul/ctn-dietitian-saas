"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  ConfirmDialog,
  Dialog,
  Field,
  Input,
  LoadingState,
  Select,
  StatusBadge,
  Textarea,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { api } from "../lib/api";
import {
  CATEGORY_LABELS,
  addDays,
  combineLocalDateTime,
  isSameDay,
  startOfDay,
  startOfWeek,
  toDateInputValue,
  toTimeInputValue,
} from "../lib/calendar-range";
import { formatMessageTime } from "../lib/chat-format";
import { errorMessage } from "../lib/humanize-error";

interface AppointmentRow {
  id: string;
  clientId?: string;
  title: string;
  category?: string;
  startAt: string;
  endAt?: string;
  status: string;
  notes?: string | null;
  proposedStartAt?: string | null;
  proposedEndAt?: string | null;
}

interface TaskRow {
  id: string;
  clientId?: string | null;
  title: string;
  description?: string | null;
  dueAt: string | null;
  status: string;
  priority?: string;
  assigneeEmail?: string | null;
  completedAt?: string | null;
}

interface CalendarMark {
  id: string;
  sourceId: string;
  kind: "appointment" | "task";
  title: string;
  startAt: string;
  status: string;
}

type ApptMode = "create" | "edit" | null;
type TaskMode = "create" | "edit" | null;

const CATEGORIES = Object.keys(CATEGORY_LABELS);

function belongsToClient<T extends { clientId?: string | null }>(row: T, clientId: string) {
  return !row.clientId || row.clientId === clientId;
}

function appointmentLocked(status: string) {
  return status === "RESCHEDULE_PENDING" || status === "CANCELLATION_PENDING";
}

function taskClosed(status: string) {
  return status === "COMPLETED" || status === "CANCELLED";
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimeRange(startAt: string, endAt?: string) {
  const start = formatDateTime(startAt);
  if (!endAt) return start;
  return `${start} – ${formatMessageTime(endAt)}`;
}

function defaultTimes(day: Date, today: Date) {
  if (isSameDay(day, today)) {
    const now = new Date();
    const start = new Date(now);
    start.setMinutes(0, 0, 0);
    if (now.getMinutes() >= 30) start.setHours(start.getHours() + 1);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    return { startTime: toTimeInputValue(start), endTime: toTimeInputValue(end) };
  }
  return { startTime: "09:00", endTime: "10:00" };
}

export function ClientAppointmentsPanel({
  dietitianAccountId,
  clientId,
  base,
  onChanged,
}: {
  dietitianAccountId: string;
  clientId: string;
  base: string;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<AppointmentRow[] | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [apptMode, setApptMode] = useState<ApptMode>(null);
  const [selected, setSelected] = useState<AppointmentRow | null>(null);
  const [form, setForm] = useState({
    title: "Consultation",
    category: "CONSULTATION",
    date: toDateInputValue(new Date()),
    startTime: "09:00",
    endTime: "10:00",
    notes: "",
  });
  const [taskMode, setTaskMode] = useState<TaskMode>(null);
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
  const [taskForm, setTaskForm] = useState({
    title: "",
    date: toDateInputValue(new Date()),
    time: "09:00",
    description: "",
  });
  const [confirmDeleteTask, setConfirmDeleteTask] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [counterId, setCounterId] = useState<string | null>(null);
  const [counterDate, setCounterDate] = useState(toDateInputValue(new Date()));
  const [counterStart, setCounterStart] = useState("10:00");
  const [counterEnd, setCounterEnd] = useState("11:00");

  const today = startOfDay(new Date());
  const locked = selected ? appointmentLocked(selected.status) : false;

  async function load() {
    const [appointments, taskList] = await Promise.all([
      api<AppointmentRow[]>(`${base}/appointments`),
      api<TaskRow[]>(`/api/v1/dietitian/${dietitianAccountId}/clients/${clientId}/tasks`).catch(
        () => [] as TaskRow[],
      ),
    ]);
    setRows(appointments.filter((row) => belongsToClient(row, clientId)));
    setTasks(taskList.filter((task) => belongsToClient(task, clientId) && Boolean(task.dueAt)));
  }

  useEffect(() => {
    setRows(null);
    setTasks([]);
    setLocalError(null);
    closeAppt();
    closeTask();
    void load().catch((err) => {
      setLocalError(errorMessage(err, "Unable to load appointments"));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, clientId, dietitianAccountId]);

  const appointments = rows ?? [];

  const marks = useMemo<CalendarMark[]>(() => {
    const appointmentMarks = appointments.map((row) => ({
      id: `appt-${row.id}`,
      sourceId: row.id,
      kind: "appointment" as const,
      title: row.title,
      startAt: row.startAt,
      status: row.status,
    }));
    const taskMarks = tasks
      .filter((task) => task.dueAt)
      .map((task) => ({
        id: `task-${task.id}`,
        sourceId: task.id,
        kind: "task" as const,
        title: task.title,
        startAt: task.dueAt!,
        status: task.status,
      }));
    return [...appointmentMarks, ...taskMarks];
  }, [appointments, tasks]);

  const dayAppointments = useMemo(
    () =>
      appointments
        .filter((row) => isSameDay(new Date(row.startAt), selectedDay))
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    [appointments, selectedDay],
  );

  const dayTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.dueAt && isSameDay(new Date(task.dueAt), selectedDay))
        .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime()),
    [tasks, selectedDay],
  );

  const pending = useMemo(
    () =>
      appointments.filter(
        (row) => row.status === "RESCHEDULE_PENDING" || row.status === "CANCELLATION_PENDING",
      ),
    [appointments],
  );

  function selectDay(day: Date) {
    const next = startOfDay(day);
    setSelectedDay(next);
    if (next.getMonth() !== anchor.getMonth() || next.getFullYear() !== anchor.getFullYear()) {
      setAnchor(next);
    }
  }

  function closeAppt() {
    setApptMode(null);
    setSelected(null);
    setFormError(null);
  }

  function closeTask() {
    setTaskMode(null);
    setSelectedTask(null);
    setConfirmDeleteTask(false);
    setFormError(null);
  }

  function openCreate(day = selectedDay) {
    const next = startOfDay(day);
    const times = defaultTimes(next, today);
    closeTask();
    setSelected(null);
    setFormError(null);
    setForm({
      title: "Consultation",
      category: "CONSULTATION",
      date: toDateInputValue(next),
      startTime: times.startTime,
      endTime: times.endTime,
      notes: "",
    });
    setApptMode("create");
  }

  function openEdit(row: AppointmentRow) {
    closeTask();
    const start = new Date(row.startAt);
    let end = row.endAt ? new Date(row.endAt) : new Date(start.getTime() + 60 * 60 * 1000);
    if (!(start.getTime() < end.getTime())) {
      end = new Date(start.getTime() + 60 * 60 * 1000);
    }
    setSelected(row);
    setFormError(null);
    setForm({
      title: row.title,
      category: row.category || "CONSULTATION",
      date: toDateInputValue(start),
      startTime: toTimeInputValue(start),
      endTime: toTimeInputValue(end),
      notes: row.notes ?? "",
    });
    setApptMode("edit");
    selectDay(start);
  }

  function openCreateTask(day = selectedDay) {
    const next = startOfDay(day);
    const times = defaultTimes(next, today);
    closeAppt();
    setSelectedTask(null);
    setFormError(null);
    setTaskForm({
      title: "",
      date: toDateInputValue(next),
      time: times.startTime,
      description: "",
    });
    setTaskMode("create");
  }

  function openTask(task: TaskRow) {
    closeAppt();
    const due = task.dueAt ? new Date(task.dueAt) : selectedDay;
    setSelectedTask(task);
    setFormError(null);
    setTaskForm({
      title: task.title,
      date: toDateInputValue(due),
      time: toTimeInputValue(due),
      description: task.description ?? "",
    });
    setTaskMode("edit");
    selectDay(due);
  }

  async function refresh() {
    await load();
    onChanged?.();
  }

  async function onSaveAppointment(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const startAt = combineLocalDateTime(form.date, form.startTime);
      let endAt = combineLocalDateTime(form.date, form.endTime);
      if (!(new Date(startAt).getTime() < new Date(endAt).getTime())) {
        endAt = new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString();
      }
      if (apptMode === "create") {
        await api(`${base}/appointments`, {
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
            notes: form.notes,
          }),
        });
      }
      closeAppt();
      selectDay(new Date(`${form.date}T${form.startTime}:00`));
      await refresh();
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
      closeAppt();
      await refresh();
    } catch (err) {
      setFormError(errorMessage(err, "Unable to cancel appointment"));
    } finally {
      setSaving(false);
    }
  }

  async function onSaveTask(event: FormEvent) {
    event.preventDefault();
    if (!taskForm.title.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const dueAt = combineLocalDateTime(taskForm.date, taskForm.time);
      if (taskMode === "create") {
        await api(`/api/v1/dietitian/${dietitianAccountId}/tasks`, {
          method: "POST",
          body: JSON.stringify({
            title: taskForm.title,
            clientId,
            dueAt,
            description: taskForm.description || undefined,
          }),
        });
      } else if (selectedTask) {
        await api(`/api/v1/dietitian/${dietitianAccountId}/tasks/${selectedTask.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: taskForm.title,
            dueAt,
            description: taskForm.description || null,
          }),
        });
      }
      closeTask();
      selectDay(new Date(`${taskForm.date}T${taskForm.time}:00`));
      await refresh();
    } catch (err) {
      setFormError(errorMessage(err, "Unable to save task"));
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
      closeTask();
      await refresh();
    } catch (err) {
      setFormError(errorMessage(err, "Unable to complete task"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelectedTask() {
    if (!selectedTask) return;
    setSaving(true);
    setFormError(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/tasks/${selectedTask.id}`, {
        method: "DELETE",
      });
      closeTask();
      await refresh();
    } catch (err) {
      setConfirmDeleteTask(false);
      setFormError(errorMessage(err, "Unable to delete task"));
    } finally {
      setSaving(false);
    }
  }

  async function runAction(id: string, path: string, fail: string) {
    setBusyId(id);
    setLocalError(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/appointments/${id}/${path}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await refresh();
    } catch (err) {
      setLocalError(errorMessage(err, fail));
    } finally {
      setBusyId(null);
    }
  }

  async function sendCounter(event: FormEvent) {
    event.preventDefault();
    if (!counterId) return;
    setBusyId(counterId);
    setLocalError(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/appointments/${counterId}/propose-reschedule`, {
        method: "POST",
        body: JSON.stringify({
          startAt: combineLocalDateTime(counterDate, counterStart),
          endAt: combineLocalDateTime(counterDate, counterEnd),
        }),
      });
      setCounterId(null);
      await refresh();
    } catch (err) {
      setLocalError(errorMessage(err, "Unable to suggest another time"));
    } finally {
      setBusyId(null);
    }
  }

  const monthLabel = anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const dayLabel = selectedDay.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="ui-client-cal">
      {localError ? <Alert tone="danger">{localError}</Alert> : null}

      {pending.length > 0 ? (
        <div className="ui-client-cal__requests">
          {pending.map((row) => (
            <button
              key={row.id}
              type="button"
              className="ui-client-cal__request"
              onClick={() => openEdit(row)}
            >
              <strong>{row.title}</strong>
              <span>
                {row.status === "CANCELLATION_PENDING"
                  ? "Cancellation requested"
                  : "Reschedule requested"}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {rows === null && !localError ? (
        <LoadingState>Loading appointments…</LoadingState>
      ) : (
        <div className="ui-client-cal__shell">
          <div className="ui-client-cal__main">
            <div className="ui-client-cal__toolbar">
              <strong>{monthLabel}</strong>
              <div>
                <button
                  type="button"
                  className="ui-client-cal__nav"
                  aria-label="Previous month"
                  onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}
                >
                  ‹
                </button>
                <Button type="button" variant="secondary" size="sm" onClick={() => {
                  setAnchor(today);
                  setSelectedDay(today);
                }}>
                  Today
                </Button>
                <button
                  type="button"
                  className="ui-client-cal__nav"
                  aria-label="Next month"
                  onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}
                >
                  ›
                </button>
              </div>
            </div>
            <MonthGrid
              anchor={anchor}
              today={today}
              selectedDay={selectedDay}
              items={marks}
              onSelectDay={selectDay}
              onAddTask={(day) => {
                selectDay(day);
                openCreateTask(day);
              }}
              onAddAppointment={(day) => {
                selectDay(day);
                openCreate(day);
              }}
            />
          </div>

          <aside className="ui-client-cal__agenda">
            <div className="ui-client-cal__agenda-head">
              <div>
                <h3>Agenda</h3>
                <p>{dayLabel}</p>
              </div>
              <div className="ui-client-cal__head-actions">
                <Button type="button" variant="secondary" size="sm" onClick={() => openCreateTask()}>
                  New task
                </Button>
                <Button type="button" size="sm" onClick={() => openCreate()}>
                  New appointment
                </Button>
              </div>
            </div>
            <div className="ui-client-cal__agenda-list">
              {dayAppointments.length === 0 && dayTasks.length === 0 ? (
                <div className="ui-client-cal__empty">
                  <p>Nothing for this patient on this day.</p>
                </div>
              ) : (
                <>
                  {dayAppointments.map((row) => {
                    const busy = busyId === row.id;
                    const pendingReschedule =
                      row.status === "RESCHEDULE_PENDING" && row.proposedStartAt && row.proposedEndAt;
                    const pendingCancel = row.status === "CANCELLATION_PENDING";
                    const cancelled = row.status === "CANCELLED";
                    return (
                      <article
                        key={row.id}
                        className={`ui-client-cal__card is-clickable${cancelled ? " is-cancelled" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => openEdit(row)}
                        onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openEdit(row);
                          }
                        }}
                      >
                        <div className="ui-client-cal__card-top">
                          <span className="ui-client-cal__kind">Appointment</span>
                          <StatusBadge status={row.status} label={humanizeLabel(row.status)} />
                        </div>
                        <strong className="ui-client-cal__card-title" title={row.title}>{row.title}</strong>
                        <p>{formatTimeRange(row.startAt, row.endAt)}</p>
                        {row.category ? (
                          <p>{CATEGORY_LABELS[row.category] ?? humanizeLabel(row.category)}</p>
                        ) : null}
                        {row.notes ? (
                          <p className="ui-client-cal__notes" title={row.notes}>
                            {row.notes}
                          </p>
                        ) : null}
                        {pendingReschedule ? (
                          <p className="ui-client-cal__flag">
                            Requested: {formatDateTime(row.proposedStartAt!)}
                            {row.proposedEndAt ? ` – ${formatMessageTime(row.proposedEndAt)}` : ""}
                          </p>
                        ) : null}
                        {pendingCancel ? (
                          <p className="ui-client-cal__flag">Patient requested cancellation</p>
                        ) : null}
                        {pendingReschedule ? (
                          <div className="ui-client-cal__actions" onClick={(event) => event.stopPropagation()}>
                            <Button
                              type="button"
                              size="sm"
                              disabled={busy}
                              onClick={() => void runAction(row.id, "accept-reschedule", "Unable to accept reschedule")}
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => {
                                const start = new Date(row.proposedStartAt ?? row.startAt);
                                const end = new Date(row.proposedEndAt ?? row.endAt ?? row.startAt);
                                setCounterId(row.id);
                                setCounterDate(toDateInputValue(start));
                                setCounterStart(toTimeInputValue(start));
                                setCounterEnd(toTimeInputValue(end));
                              }}
                            >
                              Suggest another time
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => void runAction(row.id, "reject-reschedule", "Unable to decline reschedule")}
                            >
                              Decline
                            </Button>
                          </div>
                        ) : null}
                        {pendingCancel ? (
                          <div className="ui-client-cal__actions" onClick={(event) => event.stopPropagation()}>
                            <Button
                              type="button"
                              size="sm"
                              variant="danger"
                              disabled={busy}
                              onClick={() =>
                                void runAction(row.id, "accept-cancellation", "Unable to approve cancellation")
                              }
                            >
                              Approve cancel
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() =>
                                void runAction(row.id, "reject-cancellation", "Unable to decline cancellation")
                              }
                            >
                              Keep
                            </Button>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                  {dayTasks.map((task) => (
                    <article
                      key={task.id}
                      className={`ui-client-cal__card is-clickable${taskClosed(task.status) ? " is-cancelled" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => openTask(task)}
                      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openTask(task);
                        }
                      }}
                    >
                      <div className="ui-client-cal__card-top">
                        <span className="ui-client-cal__kind is-task">Task</span>
                        <StatusBadge status={task.status} label={humanizeLabel(task.status)} />
                      </div>
                      <strong className="ui-client-cal__card-title" title={task.title}>{task.title}</strong>
                      <p>{task.dueAt ? formatDateTime(task.dueAt) : "No due time"}</p>
                      {task.priority ? <p>Priority · {humanizeLabel(task.priority)}</p> : null}
                      {task.assigneeEmail ? <p>Assigned · {task.assigneeEmail}</p> : null}
                      {task.completedAt ? <p>Completed · {formatDateTime(task.completedAt)}</p> : null}
                      {task.description ? (
                        <p className="ui-client-cal__notes" title={task.description}>
                          {task.description}
                        </p>
                      ) : null}
                    </article>
                  ))}
                </>
              )}
            </div>
          </aside>
        </div>
      )}

      <Dialog
        open={apptMode !== null}
        title={apptMode === "create" ? "New appointment" : "Edit appointment"}
        onClose={closeAppt}
      >
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        {selected?.status === "RESCHEDULE_PENDING" && selected.proposedStartAt && selected.proposedEndAt ? (
          <p className="ui-muted" style={{ margin: "0 0 0.75rem" }}>
            Resolve the pending reschedule before changing this visit.
          </p>
        ) : null}
        {selected?.status === "CANCELLATION_PENDING" ? (
          <p className="ui-muted" style={{ margin: "0 0 0.75rem" }}>
            Resolve the cancellation request before changing this visit.
          </p>
        ) : null}
        <form className="ui-stack" onSubmit={(event) => void onSaveAppointment(event)}>
          <Field label="Title">
            <Input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              required
              minLength={2}
              disabled={locked}
            />
          </Field>
          <Field label="Category">
            <Select
              value={form.category}
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
              disabled={locked}
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input
              type="date"
              value={form.date}
              onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
              required
              disabled={locked}
            />
          </Field>
          <div className="ui-client-cal__when">
            <Field label="Start">
              <Input
                type="time"
                value={form.startTime}
                onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))}
                required
                disabled={locked}
              />
            </Field>
            <Field label="End">
              <Input
                type="time"
                value={form.endTime}
                onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))}
                required
                disabled={locked}
              />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              rows={3}
              placeholder="Optional notes for this visit"
              disabled={locked}
            />
          </Field>
          <div className="ui-row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div>
              {apptMode === "edit" && selected?.status === "SCHEDULED" ? (
                <Button type="button" variant="danger" disabled={saving} onClick={() => void onCancelAppointment()}>
                  Cancel appointment
                </Button>
              ) : null}
            </div>
            <div className="ui-row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <Button type="button" variant="secondary" onClick={closeAppt}>
                Close
              </Button>
              {!locked ? (
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : apptMode === "create" ? "Schedule" : "Save changes"}
                </Button>
              ) : null}
            </div>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={taskMode !== null && !confirmDeleteTask}
        title={taskMode === "create" ? "New task" : "Edit task"}
        onClose={closeTask}
      >
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <form className="ui-stack" onSubmit={(event) => void onSaveTask(event)}>
          <Field label="Title">
            <Input
              value={taskForm.title}
              onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
              required
              disabled={selectedTask ? taskClosed(selectedTask.status) : false}
            />
          </Field>
          <div className="ui-client-cal__when">
            <Field label="Due date">
              <Input
                type="date"
                value={taskForm.date}
                onChange={(event) => setTaskForm((current) => ({ ...current, date: event.target.value }))}
                required
                disabled={selectedTask ? taskClosed(selectedTask.status) : false}
              />
            </Field>
            <Field label="Time">
              <Input
                type="time"
                value={taskForm.time}
                onChange={(event) => setTaskForm((current) => ({ ...current, time: event.target.value }))}
                required
                disabled={selectedTask ? taskClosed(selectedTask.status) : false}
              />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea
              value={taskForm.description}
              onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))}
              rows={3}
              placeholder="Optional details"
              disabled={selectedTask ? taskClosed(selectedTask.status) : false}
            />
          </Field>
          <div className="ui-row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div>
              {taskMode === "edit" && selectedTask ? (
                <Button type="button" variant="danger" disabled={saving} onClick={() => setConfirmDeleteTask(true)}>
                  Delete task
                </Button>
              ) : null}
            </div>
            <div className="ui-row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <Button type="button" variant="secondary" onClick={closeTask}>
                Close
              </Button>
              {selectedTask && !taskClosed(selectedTask.status) ? (
                <Button type="button" variant="secondary" disabled={saving} onClick={() => void completeSelectedTask()}>
                  Mark done
                </Button>
              ) : null}
              {!selectedTask || !taskClosed(selectedTask.status) ? (
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : taskMode === "create" ? "Add task" : "Save changes"}
                </Button>
              ) : null}
            </div>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteTask && selectedTask !== null}
        title="Delete this task?"
        description={
          selectedTask
            ? `“${selectedTask.title}” will be removed from this patient’s calendar.`
            : undefined
        }
        confirmLabel="Delete task"
        danger
        pending={saving}
        onConfirm={() => void deleteSelectedTask()}
        onCancel={() => setConfirmDeleteTask(false)}
      />

      <Dialog open={!!counterId} title="Suggest another time" onClose={() => setCounterId(null)}>
        <form className="ui-stack" onSubmit={(event) => void sendCounter(event)}>
          <p className="ui-muted" style={{ margin: 0 }}>
            Send a different time to the patient. They will need to accept it.
          </p>
          <Field label="Date">
            <Input type="date" value={counterDate} onChange={(event) => setCounterDate(event.target.value)} required />
          </Field>
          <Field label="Start">
            <Input type="time" value={counterStart} onChange={(event) => setCounterStart(event.target.value)} required />
          </Field>
          <Field label="End">
            <Input type="time" value={counterEnd} onChange={(event) => setCounterEnd(event.target.value)} required />
          </Field>
          <div className="ui-row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <Button type="button" variant="secondary" onClick={() => setCounterId(null)}>
              Back
            </Button>
            <Button type="submit" disabled={busyId === counterId}>
              {busyId === counterId ? "Sending…" : "Send request"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function MonthGrid({
  anchor,
  today,
  selectedDay,
  items,
  onSelectDay,
  onAddAppointment,
  onAddTask,
}: {
  anchor: Date;
  today: Date;
  selectedDay: Date;
  items: CalendarMark[];
  onSelectDay: (day: Date) => void;
  onAddAppointment: (day: Date) => void;
  onAddTask: (day: Date) => void;
}) {
  const [addKey, setAddKey] = useState<string | null>(null);
  const start = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));

  useEffect(() => {
    if (!addKey) return;
    function close() {
      setAddKey(null);
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    const timer = window.setTimeout(() => {
      document.addEventListener("click", close);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [addKey]);

  return (
    <div className="ui-client-cal__month">
      <div className="ui-client-cal__weekdays">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="ui-client-cal__grid">
        {cells.map((day) => {
          const inMonth = day.getMonth() === anchor.getMonth();
          const key = day.toISOString();
          const menuOpen = addKey === key;
          const dayItems = items.filter((row) => isSameDay(new Date(row.startAt), day));
          return (
            <div
              key={key}
              className={`ui-client-cal__cell${isSameDay(day, today) ? " is-today" : ""}${isSameDay(day, selectedDay) ? " is-selected" : ""}${inMonth ? "" : " is-muted"}${menuOpen ? " is-adding" : ""}`}
              onClick={() => onSelectDay(day)}
            >
              <div className="ui-client-cal__cell-top">
                <button
                  type="button"
                  className="ui-client-cal__add"
                  aria-label="Add to this day"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  title="Add"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectDay(day);
                    setAddKey((current) => (current === key ? null : key));
                  }}
                >
                  +
                </button>
                {menuOpen ? (
                  <div
                    className="ui-client-cal__add-menu"
                    role="menu"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAddKey(null);
                        onAddAppointment(day);
                      }}
                    >
                      Appointment
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAddKey(null);
                        onAddTask(day);
                      }}
                    >
                      Task
                    </button>
                  </div>
                ) : null}
                <span className="ui-client-cal__date">{day.getDate()}</span>
              </div>
              <span className="ui-client-cal__pills">
                {dayItems.slice(0, 5).map((row) => (
                  <span
                    key={row.id}
                    className={`ui-client-cal__pill${row.kind === "task" ? " is-task" : ""}${row.status === "RESCHEDULE_PENDING" || row.status === "CANCELLATION_PENDING" ? " is-pending" : ""}${row.status === "CANCELLED" || row.status === "COMPLETED" ? " is-done" : ""}`}
                    title={`${formatMessageTime(row.startAt)} ${row.title}`}
                  >
                    {row.kind === "task"
                      ? row.title
                      : `${formatMessageTime(row.startAt)} ${row.title}`}
                  </span>
                ))}
                {dayItems.length > 5 ? <span className="ui-client-cal__more">+{dayItems.length - 5} more</span> : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
