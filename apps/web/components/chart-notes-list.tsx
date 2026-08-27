"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, ConfirmDialog, Dialog, EmptyState, Field, Input, Select, Textarea } from "@nutrition-saas/ui";
import { api } from "../lib/api";
import { MEAL_SLOT_OPTIONS, mealSlotLabel } from "../lib/clinical-profile";
import {
  formatDateAndTime,
  localDateInputFromInstant,
  localTimeInputValue,
  toLocalDateTimeIso,
} from "../lib/format";
import { errorMessage } from "../lib/humanize-error";

export type ChartNoteKind = "CLINICAL" | "MEAL" | "EATING_HABIT" | "PREGNANCY";

export type ChartNoteRow = {
  id: string;
  kind: string;
  body: string;
  mealSlot: string | null;
  notedAt?: string;
  createdAt: string;
};

function noteTitle(kind: ChartNoteKind) {
  if (kind === "MEAL") return "meal note";
  if (kind === "EATING_HABIT") return "eating habit";
  if (kind === "PREGNANCY") return "pregnancy note";
  return "clinical note";
}

export function NoteWhenFields({
  date,
  time,
  onDateChange,
  onTimeChange,
  disabled,
}: {
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="ui-clinical-rail__when">
      <Field label="Date">
        <Input
          type="date"
          value={date}
          required
          disabled={disabled}
          onChange={(event) => onDateChange(event.target.value)}
        />
      </Field>
      <Field label="Time">
        <Input
          type="time"
          value={time}
          required
          disabled={disabled}
          onChange={(event) => onTimeChange(event.target.value)}
        />
      </Field>
    </div>
  );
}

export function ChartNotesList({
  rows,
  empty,
  allowManage,
  meal,
  notesBase,
  onChanged,
  onError,
}: {
  rows: ChartNoteRow[];
  empty: string;
  allowManage: boolean;
  meal?: boolean;
  notesBase: string;
  onChanged: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState<ChartNoteRow | null>(null);
  const [slot, setSlot] = useState("BREAKFAST");
  const [body, setBody] = useState("");
  const [notedAtDate, setNotedAtDate] = useState("");
  const [notedAtTime, setNotedAtTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  function openNote(row: ChartNoteRow) {
    const when = row.notedAt ?? row.createdAt;
    setEditing(row);
    setBody(row.body);
    setSlot(row.mealSlot ?? "BREAKFAST");
    setNotedAtDate(localDateInputFromInstant(when));
    setNotedAtTime(localTimeInputValue(when));
    setPendingDelete(false);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const trimmed = body.trim();
    if (!trimmed) {
      onError("Write a note before saving");
      return;
    }
    setBusy(true);
    try {
      await api(`${notesBase}/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          body: trimmed,
          mealSlot: meal ? slot : undefined,
          notedAt: toLocalDateTimeIso(notedAtDate, notedAtTime),
        }),
      });
      setEditing(null);
      await onChanged();
    } catch (err) {
      onError(errorMessage(err, "Unable to save note"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing) return;
    setBusy(true);
    try {
      await api(`${notesBase}/${editing.id}`, { method: "DELETE" });
      setPendingDelete(false);
      setEditing(null);
      await onChanged();
    } catch (err) {
      onError(errorMessage(err, "Unable to remove note"));
    } finally {
      setBusy(false);
    }
  }

  if (rows.length === 0) return <EmptyState title={empty} />;

  return (
    <>
      <ul className="ui-clinical-rail__list">
        {rows.map((row) => (
          <li key={row.id}>
            <button type="button" className="ui-clinical-rail__note" onClick={() => openNote(row)}>
              {meal ? <strong>{mealSlotLabel(row.mealSlot)}</strong> : null}
              <p>{row.body}</p>
              <span className="ui-muted">{formatDateAndTime(row.notedAt ?? row.createdAt)}</span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog
        open={editing != null}
        title={allowManage ? "Edit note" : "Note"}
        onClose={() => {
          if (busy) return;
          setEditing(null);
        }}
      >
        {editing ? (
          <form className="ui-stack" onSubmit={(event) => void save(event)}>
            <NoteWhenFields
              date={notedAtDate}
              time={notedAtTime}
              disabled={!allowManage}
              onDateChange={setNotedAtDate}
              onTimeChange={setNotedAtTime}
            />
            {meal ? (
              <Field label="Meal">
                <Select
                  value={slot}
                  disabled={!allowManage}
                  onChange={(event) => setSlot(event.target.value)}
                >
                  {MEAL_SLOT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Note">
              <Textarea
                value={body}
                disabled={!allowManage}
                onChange={(event) => setBody(event.target.value)}
              />
            </Field>
            <div className="ui-row ui-clinical-rail__note-actions">
              {allowManage ? (
                <Button
                  type="button"
                  variant="danger"
                  disabled={busy}
                  onClick={() => setPendingDelete(true)}
                >
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="ui-row" style={{ gap: 8 }}>
                <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                  {allowManage ? "Cancel" : "Close"}
                </Button>
                {allowManage ? (
                  <Button type="submit" disabled={busy || !body.trim()}>
                    Save
                  </Button>
                ) : null}
              </div>
            </div>
          </form>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={pendingDelete}
        title="Remove this note?"
        description="This note will be deleted from the chart."
        confirmLabel="Remove"
        danger
        pending={busy}
        onCancel={() => {
          if (busy) return;
          setPendingDelete(false);
        }}
        onConfirm={() => void remove()}
      />
    </>
  );
}

export function ChartNotesSection({
  dietitianAccountId,
  clientId,
  kind,
  title,
  empty,
  allowManage,
  onError,
  className,
}: {
  dietitianAccountId: string;
  clientId: string;
  kind: ChartNoteKind;
  title: string;
  empty: string;
  allowManage: boolean;
  onError: (message: string) => void;
  className?: string;
}) {
  const [rows, setRows] = useState<ChartNoteRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slot, setSlot] = useState("BREAKFAST");
  const [body, setBody] = useState("");
  const [notedAtDate, setNotedAtDate] = useState(() => localDateInputFromInstant());
  const [notedAtTime, setNotedAtTime] = useState(() => localTimeInputValue());
  const notesBase = `/api/v1/dietitian/${dietitianAccountId}/clients/${clientId}/chart-notes`;
  const meal = kind === "MEAL";
  const noun = noteTitle(kind);

  async function load() {
    const notes = await api<ChartNoteRow[]>(`${notesBase}?kind=${kind}`);
    setRows(notes.filter((row) => row.kind === kind));
  }

  useEffect(() => {
    void load().catch((err) => onError(errorMessage(err, `Unable to load ${noun}s`)));
  }, [dietitianAccountId, clientId, kind]);

  async function add(event: FormEvent) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) {
      onError(`Write a ${noun} before saving`);
      return;
    }
    setBusy(true);
    try {
      await api(notesBase, {
        method: "POST",
        body: JSON.stringify({
          kind,
          body: trimmed,
          mealSlot: meal ? slot : undefined,
          notedAt: toLocalDateTimeIso(notedAtDate, notedAtTime),
        }),
      });
      setBody("");
      setNotedAtDate(localDateInputFromInstant());
      setNotedAtTime(localTimeInputValue());
      setOpen(false);
      await load();
    } catch (err) {
      onError(errorMessage(err, `Unable to add ${noun}`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={className ?? "ui-clinical-rail"}>
      <header className="ui-clinical-rail__head">
        <h3>{title}</h3>
        {allowManage ? (
          <button
            type="button"
            className="ui-clinical-rail__icon-btn"
            aria-label={`Add ${noun}`}
            title={`Add ${noun}`}
            onClick={() => {
              setNotedAtDate(localDateInputFromInstant());
              setNotedAtTime(localTimeInputValue());
              setOpen(true);
            }}
          >
            <span aria-hidden>+</span>
          </button>
        ) : null}
      </header>
      {rows == null ? (
        <p className="ui-muted">Loading notes…</p>
      ) : (
        <ChartNotesList
          rows={rows}
          empty={empty}
          allowManage={allowManage}
          meal={meal}
          notesBase={notesBase}
          onChanged={load}
          onError={onError}
        />
      )}

      <Dialog open={open} title={`Add ${noun}`} onClose={() => setOpen(false)}>
        <form className="ui-stack" onSubmit={(event) => void add(event)}>
          <NoteWhenFields
            date={notedAtDate}
            time={notedAtTime}
            onDateChange={setNotedAtDate}
            onTimeChange={setNotedAtTime}
          />
          {meal ? (
            <Field label="Meal">
              <Select value={slot} onChange={(event) => setSlot(event.target.value)}>
                {MEAL_SLOT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Note">
            <Textarea
              value={body}
              placeholder={meal ? "What did they eat, and any comments…" : "Add a chart note…"}
              onChange={(event) => setBody(event.target.value)}
            />
          </Field>
          <div className="ui-row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !body.trim()}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
