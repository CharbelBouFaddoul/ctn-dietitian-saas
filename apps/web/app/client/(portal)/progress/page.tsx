"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, EmptyState, PageHeader, Section, Skeleton } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { nutritionLabel } from "../../../../lib/format";
import { PatientAccents } from "../patient-accents";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api<Summary>("/api/v1/portal/tracking/summary")
      .then(setSummary)
      .catch((err) => setError(errorMessage(err, "Unable to load progress")))
      .finally(() => setLoading(false));
  }, []);

  const hasAny =
    summary &&
    (summary.food.presented.energyKcal != null ||
      summary.water.totalLiters > 0 ||
      summary.exercise.totalDurationMinutes > 0 ||
      summary.sleep?.durationMinutes ||
      summary.habits.completed > 0);

  const metrics = [
    {
      tone: "food" as const,
      label: "Nutrition",
      value: `${nutritionLabel(summary?.food.presented.energyKcal, "kcal")}${
        summary?.food.presented.proteinG != null ? ` · ${summary.food.presented.proteinG} g protein` : ""
      }`,
      icon: PatientAccents.food,
    },
    {
      tone: "water" as const,
      label: "Hydration",
      value: summary ? `${summary.water.totalLiters.toFixed(1)} L` : "—",
      icon: PatientAccents.water,
    },
    {
      tone: "exercise" as const,
      label: "Activity",
      value: summary ? `${summary.exercise.totalDurationMinutes} min` : "—",
      icon: PatientAccents.exercise,
    },
    {
      tone: "sleep" as const,
      label: "Sleep",
      value: summary?.sleep?.durationMinutes
        ? `${Math.floor(summary.sleep.durationMinutes / 60)}h ${summary.sleep.durationMinutes % 60}m`
        : "Not logged",
      icon: PatientAccents.sleep,
    },
    {
      tone: "habits" as const,
      label: "Habits",
      value: summary ? `${summary.habits.completed} of ${summary.habits.total || summary.habits.completed}` : "—",
      icon: PatientAccents.habits,
    },
  ];

  return (
    <section>
      <PageHeader
        eyebrow="Reflection"
        title="Progress"
        description="Today’s progress based on what you’ve tracked."
        actions={
          <Link href="/client/tracking" className="ui-btn ui-btn--secondary ui-btn--sm">
            Log tracking
          </Link>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {loading ? (
        <Section title="Today’s overview" tone="mint">
          <div className="ui-client-metrics">
            <Skeleton style={{ height: 88 }} />
            <Skeleton style={{ height: 88 }} />
            <Skeleton style={{ height: 88 }} />
          </div>
        </Section>
      ) : !hasAny ? (
        <Section title="Today’s overview" tone="muted">
          <EmptyState
            title="Nothing tracked yet today"
            action={
              <Link href="/client/tracking" className="ui-btn ui-btn--primary ui-btn--sm">
                Start tracking
              </Link>
            }
          >
            Your progress will appear here as you track your nutrition and habits.
          </EmptyState>
        </Section>
      ) : (
        <Section title="Today’s overview" tone="mint">
          <div className="ui-client-metrics">
            {metrics.map((metric) => (
              <div key={metric.tone} className="ui-client-metric" data-tone={metric.tone}>
                <span className="ui-client-metric__icon">{metric.icon}</span>
                <span className="ui-client-metric__label">{metric.label}</span>
                <strong className="ui-client-metric__value">{metric.value}</strong>
              </div>
            ))}
          </div>
        </Section>
      )}
    </section>
  );
}
