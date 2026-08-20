"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Section,
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

export default function PracticeHabitsPage() {
  const { dietitianAccountId } = usePractice();
  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
    void load().catch((err) => setError(errorMessage(err, "Unable to load habits")));
  }, [dietitianAccountId]);

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
      setName("");
      setDescription("");
      setTargetValue("");
      setTargetUnit("");
      setNotice("Habit created.");
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

  const globalHabits = habits.filter((h) => h.scope === "global");
  const practiceHabits = habits.filter((h) => h.scope === "practice");

  return (
    <section>
      <PageHeader
        eyebrow="Nutrition"
        title="Habits"
        description="Global defaults plus habits you create for this practice. Assign them on each client’s Tracking tab."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <Section title="Create practice habit">
        <form onSubmit={(event) => void createHabit(event)} className="ui-stack">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </Field>
          <div className="ui-inline-form">
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
            <div className="ui-inline-form__action">
              <Button type="submit" disabled={busy}>
                Create
              </Button>
            </div>
          </div>
        </form>
      </Section>

      <Section title="Practice habits">
        {practiceHabits.length === 0 ? (
          <EmptyState title="No practice habits yet">Create one above, then assign it to clients.</EmptyState>
        ) : (
          <ul className="ui-client-chart__list">
            {practiceHabits.map((habit) => (
              <li key={habit.id}>
                <span>
                  <strong>{habit.name}</strong>
                  {habit.defaultTargetValue != null
                    ? ` · ${habit.defaultTargetValue}${habit.defaultTargetUnit ? ` ${habit.defaultTargetUnit}` : ""}`
                    : ""}
                  {habit.description ? ` — ${habit.description}` : ""}
                </span>
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void deactivate(habit.id)}>
                  Archive
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Global defaults" description="Available to assign; managed by the platform.">
        <ul className="ui-client-chart__list">
          {globalHabits.map((habit) => (
            <li key={habit.id}>
              <span>
                {habit.name}
                {habit.defaultTargetValue != null
                  ? ` · ${habit.defaultTargetValue}${habit.defaultTargetUnit ? ` ${habit.defaultTargetUnit}` : ""}`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </section>
  );
}
