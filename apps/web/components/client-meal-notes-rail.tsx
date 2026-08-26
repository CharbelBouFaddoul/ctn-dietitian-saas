"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, ConfirmDialog, Dialog, EmptyState, Field, Input, Select, Textarea } from "@nutrition-saas/ui";
import { api } from "../lib/api";
import { MEAL_SLOT_OPTIONS, mealSlotLabel } from "../lib/clinical-profile";
import { formatDateOnly, localDateInputValue } from "../lib/format";
import { errorMessage } from "../lib/humanize-error";

type ChartNote = {
  id: string;
  kind: string;
  body: string;
  mealSlot: string | null;
  notedAt: string;
  createdAt: string;
};

export function ClientMealNotesRail({
  dietitianAccountId,
  clientId,
  allowManage,
  onError,
}: {
  dietitianAccountId: string;
  clientId: string;
  allowManage: boolean;
  onError: (message: string) => void;
}) {
  const [rows, setRows] = useState<ChartNote[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [slot, setSlot] = useState("BREAKFAST");
  const [body, setBody] = useState("");
  const [notedAt, setNotedAt] = useState(() => localDateInputValue());
  const base = `/api/v1/dietitian/${dietitianAccountId}/clients/${clientId}`;

  async function load() {
    const notes = await api<ChartNote[]>(`${base}/chart-notes`);
    setRows(notes.filter((row) => row.kind === "MEAL"));
  }

  useEffect(() => {
    void load().catch((err) => onError(errorMessage(err, "Unable to load meal notes")));
  }, [dietitianAccountId, clientId]);

  async function add(event: FormEvent) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) {
      onError("Write a meal note before saving");
      return;
    }
    setBusy(true);
    try {
      await api(`${base}/chart-notes`, {
        method: "POST",
        body: JSON.stringify({ kind: "MEAL", body: trimmed, mealSlot: slot, notedAt }),
      });
      setBody("");
      setNotedAt(localDateInputValue());
      setOpen(false);
      await load();
    } catch (err) {
      onError(errorMessage(err, "Unable to add note"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`${base}/chart-notes/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      onError(errorMessage(err, "Unable to remove note"));
    }
  }

  return (
    <section className="ui-clinical-rail ui-mp__notes-rail">
      <header className="ui-clinical-rail__head">
        <h3>Meal notes</h3>
        {allowManage ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setNotedAt(localDateInputValue());
              setOpen(true);
            }}
          >
            Add
          </Button>
        ) : null}
      </header>
      {rows == null ? (
        <p className="ui-muted">Loading notes…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="No meal notes yet" />
      ) : (
        <ul className="ui-clinical-rail__list">
          {rows.map((row) => (
            <li key={row.id}>
              <div className="ui-clinical-rail__copy">
                <strong>{mealSlotLabel(row.mealSlot)}</strong>
                <p>{row.body}</p>
                <div className="ui-clinical-rail__meta">
                  <span className="ui-muted">{formatDateOnly(row.notedAt ?? row.createdAt)}</span>
                  {allowManage ? (
                    <button type="button" className="ui-mp__danger" onClick={() => setPendingId(row.id)}>
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} title="Add meal note" onClose={() => setOpen(false)}>
        <form className="ui-stack" onSubmit={(event) => void add(event)}>
          <Field label="Date">
            <Input type="date" value={notedAt} required onChange={(event) => setNotedAt(event.target.value)} />
          </Field>
          <Field label="Meal">
            <Select value={slot} onChange={(event) => setSlot(event.target.value)}>
              {MEAL_SLOT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note">
            <Textarea
              value={body}
              placeholder="What did they eat, and any comments…"
              onChange={(event) => setBody(event.target.value)}
            />
          </Field>
          <div className="ui-row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !body.trim()}>
              Save meal note
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={pendingId != null}
        title="Remove this note?"
        description="This note will be deleted from the chart."
        confirmLabel="Remove"
        danger
        onCancel={() => setPendingId(null)}
        onConfirm={() => {
          if (pendingId) void remove(pendingId);
          setPendingId(null);
        }}
      />
    </section>
  );
}
