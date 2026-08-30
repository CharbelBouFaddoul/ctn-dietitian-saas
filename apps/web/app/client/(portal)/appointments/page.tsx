"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { CATEGORY_LABELS, combineLocalDateTime, toDateInputValue, toTimeInputValue } from "../../../../lib/calendar-range";
import { formatMessageTime } from "../../../../lib/chat-format";
import { errorMessage } from "../../../../lib/humanize-error";

interface AppointmentRow {
  id: string;
  title: string;
  category: string;
  startAt: string;
  endAt: string;
  status: string;
  notes: string | null;
  proposedStartAt: string | null;
  proposedEndAt: string | null;
  proposedByUserId: string | null;
}

interface Me {
  user: { id: string };
}

export default function PortalAppointmentsPage() {
  const searchParams = useSearchParams();
  const deepLinkId = searchParams.get("appointmentId");
  const [rows, setRows] = useState<AppointmentRow[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AppointmentRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [proposeDate, setProposeDate] = useState(toDateInputValue(new Date()));
  const [proposeStart, setProposeStart] = useState("10:00");
  const [proposeEnd, setProposeEnd] = useState("11:00");
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestDate, setRequestDate] = useState(toDateInputValue(new Date()));
  const [requestStart, setRequestStart] = useState("10:00");
  const [requestEnd, setRequestEnd] = useState("11:00");
  const [requestCategory, setRequestCategory] = useState("CONSULTATION");
  const [requestNote, setRequestNote] = useState("");

  const load = useCallback(async () => {
    const [authMe, list] = await Promise.all([
      api<Me>("/api/v1/auth/me"),
      api<AppointmentRow[]>("/api/v1/portal/appointments"),
    ]);
    setMe(authMe);
    setRows(list);
    return list;
  }, []);

  useEffect(() => {
    void load()
      .then((list) => {
        if (deepLinkId) {
          const hit = list.find((r) => r.id === deepLinkId) ?? null;
          setSelected(hit);
        }
      })
      .catch((err) => setError(errorMessage(err, "Unable to load appointments")));
  }, [load, deepLinkId]);

  useEffect(() => {
    function onSwitch() {
      void load()
        .then(() => {
          setSelected(null);
          setError(null);
        })
        .catch((err) => setError(errorMessage(err, "Unable to load appointments")));
    }
    window.addEventListener("portal-connection-changed", onSwitch);
    return () => window.removeEventListener("portal-connection-changed", onSwitch);
  }, [load]);

  const upcoming = (rows ?? []).filter(
    (r) =>
      (r.status === "SCHEDULED" ||
        r.status === "RESCHEDULE_PENDING" ||
        r.status === "CANCELLATION_PENDING" ||
        r.status === "REQUESTED") &&
      new Date(r.endAt) >= new Date(),
  );
  const past = (rows ?? []).filter((r) => !upcoming.includes(r));

  async function requestCancel() {
    if (!selected) return;
    setPending(true);
    setActionError(null);
    try {
      await api(`/api/v1/portal/appointments/${selected.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSelected(null);
      await load();
    } catch (err) {
      setActionError(errorMessage(err, "Unable to request cancellation"));
    } finally {
      setPending(false);
    }
  }

  async function propose(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setPending(true);
    setActionError(null);
    try {
      await api(`/api/v1/portal/appointments/${selected.id}/propose-reschedule`, {
        method: "POST",
        body: JSON.stringify({
          startAt: combineLocalDateTime(proposeDate, proposeStart),
          endAt: combineLocalDateTime(proposeDate, proposeEnd),
        }),
      });
      setProposeOpen(false);
      setSelected(null);
      await load();
    } catch (err) {
      setActionError(errorMessage(err, "Unable to propose"));
    } finally {
      setPending(false);
    }
  }

  async function accept() {
    if (!selected) return;
    setPending(true);
    setActionError(null);
    try {
      await api(`/api/v1/portal/appointments/${selected.id}/accept-reschedule`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSelected(null);
      await load();
    } catch (err) {
      setActionError(errorMessage(err, "Unable to accept"));
    } finally {
      setPending(false);
    }
  }

  async function requestVisit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setActionError(null);
    try {
      await api("/api/v1/portal/appointments", {
        method: "POST",
        body: JSON.stringify({
          category: requestCategory,
          startAt: combineLocalDateTime(requestDate, requestStart),
          endAt: combineLocalDateTime(requestDate, requestEnd),
          notes: requestNote.trim() || undefined,
        }),
      });
      setRequestOpen(false);
      setRequestNote("");
      await load();
    } catch (err) {
      setActionError(errorMessage(err, "Unable to request a visit"));
    } finally {
      setPending(false);
    }
  }

  async function reject() {
    if (!selected) return;
    setPending(true);
    setActionError(null);
    try {
      await api(`/api/v1/portal/appointments/${selected.id}/reject-reschedule`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSelected(null);
      await load();
    } catch (err) {
      setActionError(errorMessage(err, "Unable to reject"));
    } finally {
      setPending(false);
    }
  }

  const dietitianProposed =
    selected?.status === "RESCHEDULE_PENDING" &&
    selected.proposedByUserId &&
    me?.user.id &&
    selected.proposedByUserId !== me.user.id;

  function appointmentStatusLabel(row: AppointmentRow): string {
    if (row.status === "REQUESTED") return "Waiting for clinic";
    if (row.status === "CANCELLATION_PENDING") return "Cancellation requested";
    if (row.status === "RESCHEDULE_PENDING") {
      const fromDietitian =
        row.proposedByUserId != null && me?.user.id != null && row.proposedByUserId !== me.user.id;
      return fromDietitian ? "Dietitian suggested a new time" : "Waiting on dietitian";
    }
    return row.status.replaceAll("_", " ");
  }

  function appointmentCardMeta(row: AppointmentRow): string {
    const category = CATEGORY_LABELS[row.category] ?? row.category;
    const when = new Date(row.startAt).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    if (
      row.status === "RESCHEDULE_PENDING" &&
      row.proposedStartAt &&
      row.proposedByUserId != null &&
      me?.user.id != null &&
      row.proposedByUserId !== me.user.id
    ) {
      const proposed = new Date(row.proposedStartAt).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      return `${category} · Suggested: ${proposed}`;
    }
    return `${category} · ${when}`;
  }

  return (
    <section>
      <PageHeader
        title="Appointments"
        description="Upcoming visits with your dietitian."
        actions={
          <Button
            type="button"
            onClick={() => {
              const start = new Date();
              start.setMinutes(0, 0, 0);
              start.setHours(start.getHours() + 1);
              const end = new Date(start);
              end.setHours(end.getHours() + 1);
              setRequestDate(toDateInputValue(start));
              setRequestStart(toTimeInputValue(start));
              setRequestEnd(toTimeInputValue(end));
              setRequestCategory("CONSULTATION");
              setRequestNote("");
              setActionError(null);
              setRequestOpen(true);
            }}
          >
            Request a visit
          </Button>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {rows === null && !error ? <LoadingState>Loading appointments…</LoadingState> : null}

      {rows ? (
        <div className="ui-portal-appts">
          <h2>Upcoming</h2>
          {upcoming.length === 0 ? (
            <EmptyState title="No upcoming appointments">Your dietitian will schedule visits here.</EmptyState>
          ) : (
            <ul className="ui-portal-appts__list">
              {upcoming.map((row) => (
                <li key={row.id}>
                  <button type="button" className="ui-portal-appts__card" onClick={() => setSelected(row)}>
                    <div>
                      <strong>{row.title}</strong>
                      <span className="ui-muted">{appointmentCardMeta(row)}</span>
                    </div>
                    <StatusBadge status={row.status} label={appointmentStatusLabel(row)} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h2>Past</h2>
          {past.length === 0 ? (
            <p className="ui-muted">No past appointments yet.</p>
          ) : (
            <ul className="ui-portal-appts__list">
              {past.slice(0, 20).map((row) => (
                <li key={row.id}>
                  <button type="button" className="ui-portal-appts__card is-past" onClick={() => setSelected(row)}>
                    <div>
                      <strong>{row.title}</strong>
                      <span className="ui-muted">{new Date(row.startAt).toLocaleString()}</span>
                    </div>
                    <StatusBadge status={row.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <Dialog open={!!selected} title={selected?.title ?? "Appointment"} onClose={() => setSelected(null)}>
        {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
        {selected ? (
          <div className="ui-portal-appt-detail">
            <div className="ui-portal-appt-detail__meta">
              <StatusBadge status={selected.status} label={appointmentStatusLabel(selected)} />
              <span>{CATEGORY_LABELS[selected.category] ?? selected.category}</span>
            </div>

            <div className="ui-portal-appt-detail__when">
              <span className="ui-portal-appt-detail__label">Scheduled</span>
              <p>
                {new Date(selected.startAt).toLocaleString()} – {formatMessageTime(selected.endAt)}
              </p>
            </div>

            {selected.notes ? <p className="ui-muted ui-portal-appt-detail__notes">{selected.notes}</p> : null}

            {selected.status === "REQUESTED" ? (
              <p className="ui-portal-appt-detail__request">
                Waiting for the clinic to confirm this visit.
              </p>
            ) : null}

            {selected.status === "CANCELLATION_PENDING" ? (
              <p className="ui-portal-appt-detail__request">
                Cancellation requested — waiting for your dietitian.
              </p>
            ) : null}

            {selected.status === "RESCHEDULE_PENDING" && selected.proposedStartAt && selected.proposedEndAt ? (
              <div className="ui-portal-appt-detail__when">
                <span className="ui-portal-appt-detail__label">
                  {dietitianProposed ? "Dietitian suggested" : "You requested"}
                </span>
                <p className="ui-portal-appt-detail__request">
                  {new Date(selected.proposedStartAt).toLocaleString()} –{" "}
                  {formatMessageTime(selected.proposedEndAt)}
                </p>
                {!dietitianProposed ? (
                  <p className="ui-muted" style={{ margin: "0.35rem 0 0" }}>
                    Waiting for your dietitian to respond.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="ui-portal-appt-detail__actions">
              {dietitianProposed ? (
                <>
                  <Button type="button" size="sm" disabled={pending} onClick={() => void accept()}>
                    Accept
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => {
                      const s = new Date(selected.proposedStartAt ?? selected.startAt);
                      setProposeDate(toDateInputValue(s));
                      setProposeStart(toTimeInputValue(s));
                      setProposeEnd(
                        toTimeInputValue(new Date(selected.proposedEndAt ?? selected.endAt)),
                      );
                      setProposeOpen(true);
                    }}
                  >
                    Suggest another time
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => void reject()}>
                    Decline
                  </Button>
                </>
              ) : null}

              {selected.status === "SCHEDULED" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const s = new Date(selected.startAt);
                    setProposeDate(toDateInputValue(s));
                    setProposeStart(toTimeInputValue(s));
                    setProposeEnd(toTimeInputValue(new Date(selected.endAt)));
                    setProposeOpen(true);
                  }}
                >
                  Request reschedule
                </Button>
              ) : null}

              {selected.status === "SCHEDULED" || selected.status === "RESCHEDULE_PENDING" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => void requestCancel()}
                >
                  Request cancellation
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={proposeOpen}
        title={dietitianProposed ? "Suggest another time" : "Request new time"}
        onClose={() => setProposeOpen(false)}
      >
        <form className="ui-stack" onSubmit={(e) => void propose(e)}>
          <p className="ui-muted" style={{ margin: 0 }}>
            {dietitianProposed
              ? "Send a different time to your dietitian. They will need to accept it."
              : "Ask your dietitian to move this appointment."}
          </p>
          <Field label="Date">
            <Input type="date" value={proposeDate} onChange={(e) => setProposeDate(e.target.value)} required />
          </Field>
          <Field label="Start">
            <Input type="time" value={proposeStart} onChange={(e) => setProposeStart(e.target.value)} required />
          </Field>
          <Field label="End">
            <Input type="time" value={proposeEnd} onChange={(e) => setProposeEnd(e.target.value)} required />
          </Field>
          <div className="ui-row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <Button type="button" variant="secondary" onClick={() => setProposeOpen(false)}>
              Back
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send request"}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={requestOpen} title="Request a visit" onClose={() => setRequestOpen(false)}>
        {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
        <form className="ui-stack" onSubmit={(e) => void requestVisit(e)}>
          <p className="ui-muted" style={{ margin: 0 }}>
            Pick a date and time. Your clinic will confirm or decline the request.
          </p>
          <Field label="Visit type">
            <Select
              value={requestCategory}
              onChange={(e) => setRequestCategory(e.target.value)}
            >
              {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} required />
          </Field>
          <Field label="Start">
            <Input type="time" value={requestStart} onChange={(e) => setRequestStart(e.target.value)} required />
          </Field>
          <Field label="End">
            <Input type="time" value={requestEnd} onChange={(e) => setRequestEnd(e.target.value)} required />
          </Field>
          <Field label="Note (optional)">
            <Textarea
              value={requestNote}
              onChange={(e) => setRequestNote(e.target.value)}
              rows={3}
              placeholder="Anything the clinic should know"
            />
          </Field>
          <div className="ui-row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <Button type="button" variant="secondary" onClick={() => setRequestOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send request"}
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
