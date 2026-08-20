"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
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
import { clientIdentityLine } from "../../../../lib/client-identity";
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

type FormMode = "create" | "edit" | null;

const DAY_HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7:00–20:00
const CATEGORIES = Object.keys(CATEGORY_LABELS);

function clientLabel(c?: ClientOption | null, fallbackId?: string): string {
  if (!c) return fallbackId ? "Client" : "—";
  return clientIdentityLine(c);
}

function roundToHour(d: Date): Date {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  if (d.getMinutes() >= 30) x.setHours(x.getHours() + 1);
  return x;
}

function appointmentStatusLabel(status: string): string {
  if (status === "RESCHEDULE_PENDING") return "Reschedule pending";
  if (status === "NO_SHOW") return "No-show";
  return statusLabel(status);
}

export default function CalendarPage() {
  const params = useParams<{ dietitianAccountId: string }>();
  const searchParams = useSearchParams();
  const dietitianAccountId = params.dietitianAccountId;
  const deepLinkId = searchParams.get("appointmentId");

  const [view, setView] = useState<CalendarView>("week");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [rows, setRows] = useState<AppointmentRow[] | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [mode, setMode] = useState<FormMode>(null);
  const [selected, setSelected] = useState<AppointmentRow | null>(null);
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
    const data = await api<AppointmentRow[]>(
      `/api/v1/dietitian/${dietitianAccountId}/appointments?from=${range.from.toISOString()}&to=${range.to.toISOString()}`,
    );
    setRows(data);
  }, [dietitianAccountId, range.from, range.to]);

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

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!form.clientId || !form.title.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      let startAt = combineLocalDateTime(form.date, form.startTime);
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
        description="Manage appointments by day, week, or month."
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
          rows={rows ?? []}
          onDayClick={(d) => openCreate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9))}
          onSelect={openEdit}
        />
      ) : (
        <TimeGrid
          view={view}
          anchor={anchor}
          today={today}
          rows={rows ?? []}
          onSlotClick={openCreate}
          onSelect={openEdit}
        />
      )}

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
                  clients.length === 0 || (mode === "edit" && selected?.status === "RESCHEDULE_PENDING")
                }
              >
                <option value="" disabled>
                  {clients.length === 0 ? "No clients found" : "Select client"}
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {clientLabel(c)}
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
              {selected?.status !== "RESCHEDULE_PENDING" ? (
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
  rows,
  onDayClick,
  onSelect,
}: {
  anchor: Date;
  today: Date;
  rows: AppointmentRow[];
  onDayClick: (d: Date) => void;
  onSelect: (row: AppointmentRow) => void;
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
          const dayRows = rows.filter((r) => isSameDay(new Date(r.startAt), day));
          return (
            <button
              key={day.toISOString()}
              type="button"
              className={`ui-cal-month__cell${isSameDay(day, today) ? " is-today" : ""}${inMonth ? "" : " is-muted"}`}
              onClick={() => onDayClick(day)}
            >
              <span className="ui-cal-month__date">{day.getDate()}</span>
              <span className="ui-cal-month__events">
                {dayRows.slice(0, 3).map((row) => (
                  <span
                    key={row.id}
                    className={`ui-cal-chip cat-${row.category}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(row);
                    }}
                    role="link"
                  >
                    {formatMessageTime(row.startAt)} {row.title}
                  </span>
                ))}
                {dayRows.length > 3 ? (
                  <span className="ui-muted">+{dayRows.length - 3} more</span>
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
  rows,
  onSlotClick,
  onSelect,
}: {
  view: "week" | "day";
  anchor: Date;
  today: Date;
  rows: AppointmentRow[];
  onSlotClick: (d: Date) => void;
  onSelect: (row: AppointmentRow) => void;
}) {
  const days =
    view === "day"
      ? [startOfDay(anchor)]
      : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));

  return (
    <div className={`ui-cal-time${view === "day" ? " is-day" : ""}`}>
      <div className="ui-cal-time__head">
        <span className="ui-cal-time__gutter" />
        {days.map((day) => (
          <div key={day.toISOString()} className={`ui-cal-time__dayhead${isSameDay(day, today) ? " is-today" : ""}`}>
            <strong>{day.toLocaleDateString(undefined, { weekday: "short" })}</strong>
            <span>{day.getDate()}</span>
          </div>
        ))}
      </div>
      <div className="ui-cal-time__body">
        <div className="ui-cal-time__hours">
          {DAY_HOURS.map((h) => (
            <div key={h} className="ui-cal-time__hourlabel">
              {formatHourLabel(h)}
            </div>
          ))}
        </div>
        {days.map((day) => (
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
            {rows
              .filter((r) => isSameDay(new Date(r.startAt), day))
              .map((row) => {
                const start = new Date(row.startAt);
                const end = new Date(row.endAt);
                const hourH = 4.5; // keep in sync with .ui-cal-time__* row height
                const startMin = (start.getHours() - 7) * 60 + start.getMinutes();
                const endMin = (end.getHours() - 7) * 60 + end.getMinutes();
                const top = Math.max(0, (startMin / 60) * hourH);
                const height = Math.max(3.2, ((endMin - startMin) / 60) * hourH);
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`ui-cal-block cat-${row.category}${row.status === "RESCHEDULE_PENDING" ? " is-pending" : ""}`}
                    style={{ top: `${top}rem`, height: `${height}rem` }}
                    onClick={() => onSelect(row)}
                  >
                    <strong>{row.title}</strong>
                    <span>{clientLabel(row.client, row.clientId)}</span>
                    <span>
                      {formatMessageTime(row.startAt)}–{formatMessageTime(row.endAt)}
                    </span>
                  </button>
                );
              })}
          </div>
        ))}
      </div>
      {(rows ?? []).length === 0 ? (
        <EmptyState title="No appointments in this range">Click an empty slot to schedule.</EmptyState>
      ) : null}
    </div>
  );
}
