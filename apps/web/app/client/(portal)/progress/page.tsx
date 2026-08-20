"use client";

import { useEffect, useState } from "react";
import { Alert, PageHeader, StatCard } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { nutritionLabel } from "../../../../lib/format";

interface Summary {
  date: string;
  food: { presented: { energyKcal: number | null; proteinG: number | null } };
  water: { totalLiters: number };
  exercise: { totalDurationMinutes: number };
  sleep: { durationMinutes: number | null } | null;
  habits: { completed: number; total: number };
}

export default function ClientProgressPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Summary>("/api/v1/portal/tracking/summary")
      .then(setSummary)
      .catch((err) => setError(errorMessage(err, "Unable to load progress")));
  }, []);

  return (
    <section>
      <PageHeader
        title="Progress"
        description="Today’s tracking summary. A longer history view would need an additional endpoint."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="ui-grid">
        <StatCard label="Calories" value={nutritionLabel(summary?.food.presented.energyKcal, "kcal")} />
        <StatCard label="Protein" value={nutritionLabel(summary?.food.presented.proteinG, "g")} />
        <StatCard label="Water" value={summary ? `${summary.water.totalLiters.toFixed(1)} L` : "—"} />
        <StatCard label="Exercise" value={summary ? `${summary.exercise.totalDurationMinutes} min` : "—"} />
        <StatCard
          label="Sleep"
          value={
            summary?.sleep?.durationMinutes
              ? `${Math.floor(summary.sleep.durationMinutes / 60)}h ${summary.sleep.durationMinutes % 60}m`
              : "—"
          }
        />
        <StatCard
          label="Habits"
          value={summary ? `${summary.habits.completed} / ${summary.habits.total}` : "—"}
        />
      </div>
    </section>
  );
}
