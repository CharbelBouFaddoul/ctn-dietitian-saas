"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  FilterBar,
  Input,
  PageHeader,
  SearchInput,
  Section,
  Select,
  Textarea,
} from "@nutrition-saas/ui";
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

type ScopeFilter = "ALL" | "PRACTICE" | "GLOBAL";

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

  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ScopeFilter>("ALL");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [targetUnit, setTargetUnit] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const rows = await api<HabitRow[]>(`/api/v1/dietitian/${dietitianAccountId}/habits`);
    setHabits(rows);
  }

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load habit library")));
  }, [dietitianAccountId]);

  const activeHabits = useMemo(
    () => habits.filter((h) => h.active !== false),
    [habits],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activeHabits.filter((habit) => {
      if (scope === "PRACTICE" && habit.scope !== "practice") return false;
      if (scope === "GLOBAL" && habit.scope !== "global") return false;
      if (!q) return true;
      return (
        habit.name.toLowerCase().includes(q) ||
        (habit.description ?? "").toLowerCase().includes(q) ||
        (habit.defaultTargetUnit ?? "").toLowerCase().includes(q)
      );
    });
  }, [activeHabits, query, scope]);

  const practiceCount = activeHabits.filter((h) => h.scope === "practice").length;
  const globalCount = activeHabits.filter((h) => h.scope === "global").length;

  function resetForm() {
    setName("");
    setDescription("");
    setTargetValue("");
    setTargetUnit("");
  }

  async function createHabit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
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
      setScope("PRACTICE");
      setNotice(
        fromClient
          ? "Habit added. Go back to Tracking to assign it to this client."
          : "Habit added to the library. Assign it from a client’s Tracking tab.",
      );
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to create habit"));
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(habitId: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/habits/${habitId}`, {
        method: "PATCH",
        body: JSON.stringify({ active: false }),
      });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to update habit"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ui-habit-lib">
      <PageHeader
        eyebrow="Patients"
        title="Habit library"
        description="Browse and create reusable habits, then assign them on each client’s Tracking tab."
        actions={
          <div className="ui-habit-lib__header-actions">
            {clientTrackingHref ? (
              <Link href={clientTrackingHref} className="ui-btn ui-btn--secondary ui-btn--sm">
                Back to Tracking
              </Link>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setCreating((open) => !open);
                setNotice(null);
                setError(null);
              }}
            >
              {creating ? "Cancel" : "New habit"}
            </Button>
          </div>
        }
      />

      <p className="ui-habit-lib__flow">
        <span>Library</span>
        <span aria-hidden="true">→</span>
        <span>Assign on Tracking</span>
        <span aria-hidden="true">→</span>
        <span>Patient checklist in portal</span>
      </p>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {creating ? (
        <Section title="New clinic habit" description="Saved to this clinic library only. Not assigned until you pick a client.">
          <form onSubmit={(event) => void createHabit(event)} className="ui-habit-lib__form">
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
            <Field label="Description">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Optional guidance for the patient"
              />
            </Field>
            <div className="ui-habit-lib__form-row">
              <Field label="Target value">
                <Input
                  type="number"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  min="0"
                  step="0.1"
                />
              </Field>
              <Field label="Unit">
                <Input value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)} placeholder="ml, min…" />
              </Field>
            </div>
            <div className="ui-habit-lib__form-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  resetForm();
                  setCreating(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                Add to library
              </Button>
            </div>
          </form>
        </Section>
      ) : null}

      <FilterBar>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search habits…"
          aria-label="Search habits"
        />
        <Select
          value={scope}
          onChange={(e) => setScope(e.target.value as ScopeFilter)}
          aria-label="Filter by source"
        >
          <option value="ALL">All ({activeHabits.length})</option>
          <option value="PRACTICE">Clinic ({practiceCount})</option>
          <option value="GLOBAL">Global ({globalCount})</option>
        </Select>
      </FilterBar>

      <Section
        title="Habits"
        description={
          filtered.length === activeHabits.length
            ? `${practiceCount} clinic · ${globalCount} global`
            : `${filtered.length} match${filtered.length === 1 ? "" : "es"}`
        }
      >
        {filtered.length === 0 ? (
          <EmptyState
            title={activeHabits.length === 0 ? "No habits yet" : "No habits match"}
            action={
              activeHabits.length === 0 ? (
                <Button type="button" onClick={() => setCreating(true)}>
                  New habit
                </Button>
              ) : undefined
            }
          >
            {activeHabits.length === 0
              ? "Create a clinic habit, or use global defaults once they appear here."
              : "Try another search or filter."}
          </EmptyState>
        ) : (
          <ul className="ui-habit-lib__list">
            {filtered.map((habit) => {
              const target = targetLabel(habit);
              return (
                <li key={habit.id}>
                  <div className="ui-habit-lib__item">
                    <div className="ui-habit-lib__item-top">
                      <strong>{habit.name}</strong>
                      <span
                        className={
                          habit.scope === "global" ? "ui-habit-lib__badge" : "ui-habit-lib__badge ui-habit-lib__badge--clinic"
                        }
                      >
                        {habit.scope === "global" ? "Global" : "Clinic"}
                      </span>
                    </div>
                    {target || habit.description ? (
                      <p className="ui-habit-lib__meta">
                        {target}
                        {target && habit.description ? " · " : null}
                        {habit.description}
                      </p>
                    ) : null}
                  </div>
                  {habit.scope === "practice" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void deactivate(habit.id)}
                    >
                      Archive
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </section>
  );
}
