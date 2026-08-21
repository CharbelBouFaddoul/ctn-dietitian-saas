"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, EmptyState, LineChart, PageHeader, Section, Skeleton } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { nutritionLabel } from "../../../../lib/format";
import { addLocalDays, localDateKey } from "../../../../lib/local-date";
import { PatientAccents } from "../patient-accents";

interface Summary {
  date: string;
  food: { presented: { energyKcal: number | null; proteinG: number | null } };
  water: { totalLiters: number; targetMl?: number | null };
  exercise: { totalDurationMinutes: number };
  sleep: { durationMinutes: number | null } | null;
  sleepWeek?: { averageDurationMinutes: number | null };
  habits: { completed: number; total: number };
}

type EvolutionResponse = {
  series: Record<string, Array<{ at: string; value: number; unit: string }>>;
  bmiSeries: Array<{ at: string; value: number; unit: string }>;
  comparison: { available: boolean; weight: { absolute: number; percent: number | null } | null };
};

type RangePreset = "7" | "30" | "90" | "all";

function rangeQuery(preset: RangePreset): string {
  if (preset === "all") return "";
  const days = Number(preset);
  const to = localDateKey();
  const from = addLocalDays(to, -(days - 1));
  return `?from=${from}T00:00:00.000Z&to=${to}T23:59:59.999Z`;
}

export default function ClientProgressPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [evolution, setEvolution] = useState<EvolutionResponse | null>(null);
  const [range, setRange] = useState<RangePreset>("30");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(preset: RangePreset = range) {
    const [s, evo] = await Promise.all([
      api<Summary>("/api/v1/portal/tracking/summary"),
      api<EvolutionResponse>(`/api/v1/portal/evolution${rangeQuery(preset)}`).catch(() => null),
    ]);
    setSummary(s);
    setEvolution(evo);
  }

  useEffect(() => {
    void load()
      .catch((err) => setError(errorMessage(err, "Unable to load progress")))
      .finally(() => setLoading(false));

    function onSwitch() {
      setLoading(true);
      void load()
        .then(() => setError(null))
        .catch((err) => setError(errorMessage(err, "Unable to load progress")))
        .finally(() => setLoading(false));
    }
    window.addEventListener("portal-connection-changed", onSwitch);
    return () => window.removeEventListener("portal-connection-changed", onSwitch);
  }, []);

  async function selectRange(preset: RangePreset) {
    setRange(preset);
    setLoading(true);
    try {
      await load(preset);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to load progress"));
    } finally {
      setLoading(false);
    }
  }

  const hasAny =
    summary &&
    (summary.food.presented.energyKcal != null ||
      summary.water.totalLiters > 0 ||
      summary.exercise.totalDurationMinutes > 0 ||
      summary.sleep?.durationMinutes ||
      summary.habits.completed > 0);

  const weightPoints = (evolution?.series.WEIGHT ?? []).map((p) => ({ at: p.at, value: p.value }));
  const weightUnit = evolution?.series.WEIGHT?.[0]?.unit ?? "kg";

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
      value: summary
        ? summary.water.targetMl != null
          ? `${summary.water.totalLiters.toFixed(1)} L / ${(summary.water.targetMl / 1000).toFixed(1)} L`
          : `${summary.water.totalLiters.toFixed(1)} L`
        : "—",
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
        description="Today’s tracking plus your measurement evolution for the active practice."
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

      <Section
        title="Weight evolution"
        tone="muted"
        actions={
          <div className="ui-row" style={{ gap: 6, flexWrap: "wrap" }}>
            {(["7", "30", "90", "all"] as const).map((preset) => (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant={range === preset ? "primary" : "secondary"}
                onClick={() => void selectRange(preset)}
              >
                {preset === "all" ? "All" : `${preset}d`}
              </Button>
            ))}
          </div>
        }
      >
        <LineChart
          points={weightPoints}
          unit={weightUnit}
          emptyTitle="No weight measurements yet for this clinic connection."
        />
        {evolution?.comparison.weight ? (
          <p className="ui-muted" style={{ marginTop: 8 }}>
            Change since first reading: {evolution.comparison.weight.absolute >= 0 ? "+" : ""}
            {evolution.comparison.weight.absolute} {weightUnit}
            {evolution.comparison.weight.percent != null
              ? ` (${evolution.comparison.weight.percent >= 0 ? "+" : ""}${evolution.comparison.weight.percent}%)`
              : ""}
          </p>
        ) : null}
      </Section>
    </section>
  );
}
