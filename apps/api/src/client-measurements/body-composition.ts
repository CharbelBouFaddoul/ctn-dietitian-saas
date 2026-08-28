export type SeriesPoint = { at: string; value: number; unit: string; id: string };

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function onDay(points: SeriesPoint[] | undefined, day: string): SeriesPoint | null {
  const ofDay = (points ?? []).filter((point) => dayKey(point.at) === day);
  return ofDay[ofDay.length - 1] ?? null;
}

function toKg(value: number, unit: string) {
  const n = unit.toLowerCase();
  if (n === "lb" || n === "lbs") return value * 0.45359237;
  return value;
}

function roundKg(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPct(value: number) {
  return Math.round(value * 10) / 10;
}

function pushIfMissing(
  series: Record<string, SeriesPoint[]>,
  type: string,
  point: SeriesPoint,
) {
  const current = series[type] ?? [];
  if (current.some((row) => dayKey(row.at) === dayKey(point.at))) return;
  series[type] = [...current, point].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function latestWeightOnOrBefore(weights: SeriesPoint[], day: string): SeriesPoint | null {
  const end = new Date(`${day}T23:59:59.999Z`).getTime();
  let best: SeriesPoint | null = null;
  for (const point of weights) {
    const t = new Date(point.at).getTime();
    if (t <= end) best = point;
  }
  return best;
}

/**
 * Fills body-composition gaps from the same day’s readings (or that day’s weight):
 * fat mass ↔ body fat %, muscle mass ↔ muscle %, lean mass = weight − fat mass.
 * Does not overwrite a recorded value on that day.
 */
export function deduceBodyComposition(series: Record<string, SeriesPoint[]>): Record<string, SeriesPoint[]> {
  const next: Record<string, SeriesPoint[]> = Object.fromEntries(
    Object.entries(series).map(([key, points]) => [key, [...points]]),
  );
  const weights = next.WEIGHT ?? [];
  const days = new Set(
    [
      ...weights,
      ...(next.BODY_FAT ?? []),
      ...(next.FAT_MASS ?? []),
      ...(next.MUSCLE_MASS ?? []),
      ...(next.MUSCLE_MASS_PERCENT ?? []),
    ].map((point) => dayKey(point.at)),
  );

  for (const day of days) {
    const weight = onDay(weights, day) ?? latestWeightOnOrBefore(weights, day);
    if (!weight || weight.value <= 0) continue;
    const kg = toKg(weight.value, weight.unit);
    if (kg <= 0) continue;
    const at = onDay(weights, day)?.at ?? `${day}T12:00:00.000Z`;

    const recordedFatPct = onDay(next.BODY_FAT, day);
    const recordedFatMass = onDay(next.FAT_MASS, day);
    let fatPct = recordedFatPct?.value ?? null;
    let fatMassKg = recordedFatMass ? toKg(recordedFatMass.value, recordedFatMass.unit) : null;
    if (fatMassKg == null && fatPct != null) fatMassKg = kg * (fatPct / 100);
    if (fatPct == null && fatMassKg != null) fatPct = (fatMassKg / kg) * 100;

    if (fatMassKg != null && fatMassKg >= 0 && !recordedFatMass) {
      pushIfMissing(next, "FAT_MASS", {
        id: `deduced-fat-mass-${day}`,
        at,
        value: roundKg(fatMassKg),
        unit: "kg",
      });
    }
    if (fatPct != null && fatPct >= 0 && fatPct <= 100 && !recordedFatPct) {
      pushIfMissing(next, "BODY_FAT", {
        id: `deduced-body-fat-${day}`,
        at,
        value: roundPct(fatPct),
        unit: "%",
      });
    }
    if (fatMassKg != null && fatMassKg >= 0 && fatMassKg < kg) {
      pushIfMissing(next, "LEAN_MASS", {
        id: `deduced-lean-${day}`,
        at,
        value: roundKg(kg - fatMassKg),
        unit: "kg",
      });
    }

    const recordedMuscle = onDay(next.MUSCLE_MASS, day);
    const recordedMusclePct = onDay(next.MUSCLE_MASS_PERCENT, day);
    let muscleKg = recordedMuscle ? toKg(recordedMuscle.value, recordedMuscle.unit) : null;
    let musclePct = recordedMusclePct?.value ?? null;
    if (muscleKg == null && musclePct != null) muscleKg = kg * (musclePct / 100);
    if (musclePct == null && muscleKg != null) musclePct = (muscleKg / kg) * 100;

    if (muscleKg != null && muscleKg >= 0 && !recordedMuscle) {
      pushIfMissing(next, "MUSCLE_MASS", {
        id: `deduced-muscle-${day}`,
        at,
        value: roundKg(muscleKg),
        unit: "kg",
      });
    }
    if (musclePct != null && musclePct >= 0 && musclePct <= 100 && !recordedMusclePct) {
      pushIfMissing(next, "MUSCLE_MASS_PERCENT", {
        id: `deduced-muscle-pct-${day}`,
        at,
        value: roundPct(musclePct),
        unit: "%",
      });
    }
  }

  return next;
}
