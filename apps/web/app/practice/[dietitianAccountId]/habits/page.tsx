"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  StatusBadge,
  Tabs,
  Textarea,
} from "@nutrition-saas/ui";
import { ListFilters, LIST_SEARCH_DEBOUNCE_MS } from "../../../../components/list-filters";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { usePractice } from "../practice-shell";

type HabitRow = {
  id: string;
  scope: "global" | "practice";
  name: string;
  description: string | null;
  category: string | null;
  defaultTargetValue: number | null;
  defaultTargetUnit: string | null;
  active: boolean;
};

const VIEWS = ["all", "practice", "global"] as const;
type ViewKey = (typeof VIEWS)[number];

const VIEW_LABELS: Record<ViewKey, string> = {
  all: "All",
  practice: "Clinic",
  global: "Global",
};

function targetLabel(habit: HabitRow) {
  if (habit.defaultTargetValue == null) return null;
  return `${habit.defaultTargetValue}${habit.defaultTargetUnit ? ` ${habit.defaultTargetUnit}` : ""}`;
}

export default function PracticeHabitsPage() {
  const { dietitianAccountId } = usePractice();
  const searchParams = useSearchParams();
  const fromClient = searchParams.get("fromClient");
  const clientTrackingHref = fromClient
    ? `/practice/${dietitianAccountId}/clients/${fromClient}?tab=tracking`
    : null;

  const [habits, setHabits] = useState<HabitRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewKey>("all");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [targetUnit, setTargetUnit] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<HabitRow | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);

  async function load() {
    const rows = await api<HabitRow[]>(`/api/v1/dietitian/${dietitianAccountId}/habits`);
    setHabits(rows);
  }

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load habit library")));
  }, [dietitianAccountId]);

  useEffect(() => {
    const next = searchDraft.trim();
    if (next === search) return;
    const timer = window.setTimeout(() => {
      setSearch(next);
    }, LIST_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search, searchDraft]);

  const activeHabits = useMemo(
    () => (habits ?? []).filter((h) => h.active !== false),
    [habits],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeHabits.filter((habit) => {
      if (view === "practice" && habit.scope !== "practice") return false;
      if (view === "global" && habit.scope !== "global") return false;
      if (!q) return true;
      return (
        habit.name.toLowerCase().includes(q) ||
        (habit.description ?? "").toLowerCase().includes(q) ||
        (habit.defaultTargetUnit ?? "").toLowerCase().includes(q)
      );
    });
  }, [activeHabits, search, view]);

  const hasSearch = Boolean(search.trim());
  const hasFilters = hasSearch || view !== "all";

  function resetForm() {
    setName("");
    setDescription("");
    setTargetValue("");
    setTargetUnit("");
  }

  function openCreate() {
    resetForm();
    setNotice(null);
    setError(null);
    setFormError(null);
    setCreating(true);
  }

  function closeCreate() {
    if (busy) return;
    setCreating(false);
    setFormError(null);
    resetForm();
  }

  function clearFilters() {
    setSearchDraft("");
    setSearch("");
    setView("all");
  }

  async function createHabit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/habits`, {
        method: "POST",
        body: JSON.stringify({
          name,
          description: description || undefined,
          defaultTargetValue: targetValue ? Number(targetValue) : undefined,
          defaultTargetUnit: targetUnit || undefined,
        }),
      });
      resetForm();
      setCreating(false);
      setView("practice");
      setNotice(
        fromClient
          ? "Habit added. Go back to Tracking to assign it to this client."
          : "Habit added to the library. Assign it from a client’s Tracking tab.",
      );
      await load();
    } catch (err) {
      setFormError(errorMessage(err, "Unable to create habit"));
    } finally {
      setBusy(false);
    }
  }

  async function archiveHabit() {
    if (!pendingArchive) return;
    setArchiveBusy(true);
    setError(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/habits/${pendingArchive.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: false }),
      });
      setPendingArchive(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to update habit"));
      setPendingArchive(null);
    } finally {
      setArchiveBusy(false);
    }
  }

  return (
    <section className="ui-list-page">
      <PageHeader
        title="Habits"
        description="Reusable habits for this clinic. Assign them from a client’s Tracking tab."
        actions={
          <div className="ui-row" style={{ gap: 10 }}>
            {clientTrackingHref ? (
              <Link href={clientTrackingHref} className="ui-btn ui-btn--secondary">
                Back to Tracking
              </Link>
            ) : null}
            <Button onClick={openCreate}>New habit</Button>
          </div>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <Tabs
        items={VIEWS.map((id) => ({ id, label: VIEW_LABELS[id] }))}
        value={view}
        onChange={(id) => setView(id as ViewKey)}
      />

      <ListFilters
        search={searchDraft}
        onSearchChange={setSearchDraft}
        searchPlaceholder="Search habits"
        hasFilters={hasFilters}
        onClear={clearFilters}
        count={filtered.length}
        countNoun="habit"
        loading={!habits && !error}
      />

      <div className="ui-list-results">
        {filtered.length === 0 ? (
          <EmptyState
            title={activeHabits.length === 0 ? "No habits yet" : "No habits in this view"}
            action={
              view === "all" && !hasSearch ? (
                <Button onClick={openCreate}>New habit</Button>
              ) : hasFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear
                </Button>
              ) : undefined
            }
          >
            {hasSearch
              ? "Try a different search, or clear filters."
              : view === "all"
                ? "Create a clinic habit, then assign it from a client’s Tracking tab."
                : "Try switching to a different view or create a new habit."}
          </EmptyState>
        ) : (
          <ul className="ui-list-cards">
            {filtered.map((habit) => {
              const target = targetLabel(habit);
              const meta = [target, habit.description].filter(Boolean).join(" · ") || "No target";
              return (
                <li key={habit.id}>
                  <article className="ui-list-cards__item">
                    <div className="ui-list-cards__main">
                      <strong>{habit.name}</strong>
                      <p>{meta}</p>
                    </div>
                    <div className="ui-list-cards__aside">
                      <StatusBadge
                        status={habit.scope === "global" ? "GLOBAL" : "ACTIVE"}
                        label={habit.scope === "global" ? "Global" : "Clinic"}
                        tone={habit.scope === "global" ? "neutral" : "accent"}
                      />
                      {habit.scope === "practice" ? (
                        <div className="ui-list-cards__actions">
                          <button
                            type="button"
                            className="ui-list-cards__action is-danger"
                            disabled={busy || archiveBusy}
                            onClick={() => setPendingArchive(habit)}
                          >
                            Archive
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={creating} title="New habit" onClose={closeCreate}>
        <form className="ui-stack" style={{ gap: 14 }} onSubmit={(event) => void createHabit(event)}>
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <p className="ui-muted" style={{ margin: 0 }}>
            Saved to this clinic library only. Not assigned until you pick a client.
          </p>
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              placeholder="e.g. Drink water"
              autoFocus
            />
          </Field>
          <Field label="Description" hint="Optional">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Guidance for the patient"
            />
          </Field>
          <Field label="Target value" hint="Optional">
            <Input
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              min="0"
              step="0.1"
            />
          </Field>
          <Field label="Unit" hint="Optional">
            <Input value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)} placeholder="ml, min…" />
          </Field>
          <div className="ui-row" style={{ gap: 10, justifyContent: "flex-end" }}>
            <Button type="button" variant="secondary" disabled={busy} onClick={closeCreate}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "Adding…" : "Add to library"}
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={pendingArchive !== null}
        title="Archive this habit?"
        description={
          pendingArchive
            ? `“${pendingArchive.name}” will be removed from the clinic library. Existing client assignments are not changed.`
            : undefined
        }
        confirmLabel="Archive habit"
        danger
        pending={archiveBusy}
        onConfirm={() => void archiveHabit()}
        onCancel={() => setPendingArchive(null)}
      />
    </section>
  );
}
