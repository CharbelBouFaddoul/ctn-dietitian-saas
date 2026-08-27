"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { DonutChart } from "@nutrition-saas/ui";

export type MealMacro = {
  id: string;
  name: string;
  energyKcal: number;
  fatG: number;
  carbohydrateG: number;
  proteinG: number;
};

const FAT = "#e8a82e";
const CARB = "#e89a6a";
const PROT = "#4f8fe0";
const FAT_KCAL = 9;
const CARB_KCAL = 4;
const PROT_KCAL = 4;

function fmt(value: number, decimals = 0) {
  if (!Number.isFinite(value)) return "—";
  return (Math.round(value * 10 ** decimals) / 10 ** decimals).toFixed(decimals);
}

function perKg(grams: number, weightKg: number | null) {
  if (weightKg == null || weightKg <= 0) return "—";
  return `${fmt(grams / weightKg, 2)} g/kg`;
}

function mealRows(meal: MealMacro, weightKg: number | null) {
  const fatKcal = meal.fatG * FAT_KCAL;
  const carbKcal = meal.carbohydrateG * CARB_KCAL;
  const proteinKcal = meal.proteinG * PROT_KCAL;
  const energy = meal.energyKcal > 0 ? meal.energyKcal : fatKcal + carbKcal + proteinKcal;
  const pct = (kcal: number) => (energy > 0 ? `${fmt((kcal / energy) * 100, 1)}%` : "—");
  return [
    { id: "fat", label: "Fat", kcal: `${fmt(fatKcal, 0)} kcal`, pct: pct(fatKcal), grams: `${fmt(meal.fatG, 1)} g`, perKg: perKg(meal.fatG, weightKg) },
    {
      id: "carb",
      label: "Carbs",
      kcal: `${fmt(carbKcal, 0)} kcal`,
      pct: pct(carbKcal),
      grams: `${fmt(meal.carbohydrateG, 1)} g`,
      perKg: perKg(meal.carbohydrateG, weightKg),
    },
    {
      id: "protein",
      label: "Protein",
      kcal: `${fmt(proteinKcal, 0)} kcal`,
      pct: pct(proteinKcal),
      grams: `${fmt(meal.proteinG, 1)} g`,
      perKg: perKg(meal.proteinG, weightKg),
    },
    { id: "energy", label: "Energy", kcal: `${fmt(energy, 0)} kcal`, pct: "", grams: "", perKg: "" },
  ];
}

function followCursor(x: number, y: number, width = 280, height = 220) {
  const gapX = -8;
  const gapY = 14;
  const pad = 8;
  let left = x - width - gapX;
  let top = y + gapY;
  if (left < pad) left = pad;
  if (top + height > window.innerHeight - pad) top = window.innerHeight - height - pad;
  if (left + width > window.innerWidth - pad) left = window.innerWidth - width - pad;
  if (top < pad) top = pad;
  return { left, top };
}

export function MealMacroDonuts({
  meals,
  weightKg,
  layout = "rail",
}: {
  meals: MealMacro[];
  weightKg: number | null;
  layout?: "rail" | "wide";
}) {
  const [hover, setHover] = useState<{ meal: MealMacro; x: number; y: number } | null>(null);

  if (meals.length === 0) {
    return <p className="ui-muted">No meals on this day.</p>;
  }

  const popup = hover ? followCursor(hover.x, hover.y) : null;

  return (
    <div className={`ui-mp-meals ui-mp-meals--${layout}`}>
      <header className="ui-mp-meals__head">
        <h3>Meals</h3>
        <ul className="ui-mp-meals__key">
          <li>
            <span style={{ background: FAT }} /> Fat
          </li>
          <li>
            <span style={{ background: CARB }} /> Carbs
          </li>
          <li>
            <span style={{ background: PROT }} /> Protein
          </li>
        </ul>
      </header>
      <div className="ui-mp-meals__grid">
        {meals.map((meal) => (
          <div
            key={meal.id}
            className="ui-mp-meals__item"
            onMouseEnter={(event) => setHover({ meal, x: event.clientX, y: event.clientY })}
            onMouseMove={(event) => setHover({ meal, x: event.clientX, y: event.clientY })}
            onMouseLeave={() => setHover(null)}
          >
            <DonutChart
              size={layout === "wide" ? 72 : 64}
              thickness={layout === "wide" ? 16 : 14}
              legend={false}
              showPct={false}
              interactive={false}
              valueUnit="kcal"
              slices={[
                { label: "Fat", value: meal.fatG * FAT_KCAL, color: FAT },
                { label: "Carbs", value: meal.carbohydrateG * CARB_KCAL, color: CARB },
                { label: "Protein", value: meal.proteinG * PROT_KCAL, color: PROT },
              ]}
            />
            <span className="ui-mp-meals__name">{meal.name}</span>
            <span className="ui-mp-meals__kcal">{fmt(meal.energyKcal, 0)} kcal</span>
          </div>
        ))}
      </div>
      {hover && popup && typeof document !== "undefined"
        ? createPortal(
            <div className="ui-mp-meals__flyout" style={{ left: popup.left, top: popup.top }} role="tooltip">
              <p className="ui-mp-meals__flyout-title">{hover.meal.name}</p>
              <dl>
                {mealRows(hover.meal, weightKg).map((row) => (
                  <div key={row.id} className={`ui-mp-meals__flyout-row ui-mp-meals__flyout-row--${row.id}`}>
                    <dt>{row.label}</dt>
                    <dd>
                      <strong>{row.kcal}</strong>
                      {row.pct ? <span>{row.pct}</span> : null}
                      {row.grams ? <span>{row.grams}</span> : null}
                      {row.perKg ? <span>{row.perKg}</span> : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
