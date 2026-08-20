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
  StatusBadge,
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
    (r) => (r.status === "SCHEDULED" || r.status === "RESCHEDULE_PENDING") && new Date(r.endAt) >= new Date(),
  );
  const past = (rows ?? []).filter((r) => !upcoming.includes(r));

  async function cancelAppt() {
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
      setActionError(errorMessage(err, "Unable to cancel"));
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

  return (
    <section>
      <PageHeader title="Appointments" description="Upcoming visits with your dietitian." />
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
                      <span className="ui-muted">
                        {CATEGORY_LABELS[row.category] ?? row.category} ·{" "}
                        {new Date(row.startAt).toLocaleString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <StatusBadge status={row.status} />
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
          <div className="ui-stack">
            <p style={{ margin: 0 }}>
              <StatusBadge status={selected.status} /> · {CATEGORY_LABELS[selected.category] ?? selected.category}
            </p>
            <p style={{ margin: 0 }}>
              {new Date(selected.startAt).toLocaleString()} – {formatMessageTime(selected.endAt)}
            </p>
            {selected.notes ? <p className="ui-muted">{selected.notes}</p> : null}

            {selected.status === "RESCHEDULE_PENDING" && selected.proposedStartAt && selected.proposedEndAt ? (
              <div className="ui-cal-proposal">
                <strong>Proposed new time</strong>
                <p>
                  {new Date(selected.proposedStartAt).toLocaleString()} –{" "}
                  {formatMessageTime(selected.proposedEndAt)}
                </p>
                {dietitianProposed ? (
                  <div className="ui-row" style={{ gap: 8 }}>
                    <Button type="button" disabled={pending} onClick={() => void accept()}>
                      Accept
                    </Button>
                    <Button type="button" variant="secondary" disabled={pending} onClick={() => void reject()}>
                      Reject
                    </Button>
                  </div>
                ) : (
                  <p className="ui-muted">Waiting for your dietitian to respond.</p>
                )}
              </div>
            ) : null}

            {selected.status === "SCHEDULED" || selected.status === "RESCHEDULE_PENDING" ? (
              <div className="ui-row" style={{ justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                {selected.status === "SCHEDULED" ? (
                  <Button
                    type="button"
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
                <Button type="button" variant="danger" disabled={pending} onClick={() => void cancelAppt()}>
                  Cancel appointment
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog open={proposeOpen} title="Request new time" onClose={() => setProposeOpen(false)}>
        <form className="ui-stack" onSubmit={(e) => void propose(e)}>
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
    </section>
  );
}
