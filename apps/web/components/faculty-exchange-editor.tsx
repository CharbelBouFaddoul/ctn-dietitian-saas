"use client";

import { Input } from "@nutrition-saas/ui";
import {
  tallyExchanges,
  type FacultyExchangeId,
  type FacultyExchanges,
} from "../lib/faculty-nutrition";

type DayTotals = {
  energyKcal: number | null;
  carbohydrateG: number | null;
  proteinG: number | null;
  fatG: number | null;
};

type Props = {
  exchanges: FacultyExchanges;
  readOnly?: boolean;
  hint?: string;
  needKcal?: number | null;
  dayTotals?: DayTotals;
  onChange: (id: FacultyExchangeId, value: number) => void;
};

function fmt(value: number | null | undefined, decimals = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

function comparedTo(actual: number | null | undefined, target: number, unit: string): string {
  if (actual == null || !Number.isFinite(actual)) return "—";
  const diff = Math.round(actual - target);
  if (diff === 0) return "on target";
  const amount = Math.abs(diff).toLocaleString();
  return diff > 0 ? `${amount} ${unit} above` : `${amount} ${unit} below`;
}

export function FacultyExchangeEditor({
  exchanges,
  readOnly = false,
  hint,
  needKcal,
  dayTotals,
  onChange,
}: Props) {
  const tally = tallyExchanges(exchanges);
  const sections = ["Milk", "Carbohydrate", "Meat", "Fat", "Other"] as const;

  return (
    <div className="ui-faculty-exchanges">
      <div className="ui-faculty-exchanges__table" role="table">
        <div className="ui-faculty-exchanges__hrow" role="row">
          <span>Food group</span>
          <span>Exchanges</span>
          <span>CHO</span>
          <span>Protein</span>
          <span>Fat</span>
          <span>kcal</span>
        </div>
        {sections.map((section) => {
          const rows = tally.lines.filter((line) => line.section === section);
          return (
            <div key={section} className="ui-faculty-exchanges__section">
              <div className="ui-faculty-exchanges__section-label">{section}</div>
              {rows.map((line) => (
                <div className="ui-faculty-exchanges__row" role="row" key={line.id}>
                  <span className="ui-faculty-exchanges__name">{line.label}</span>
                  <span>
                    {readOnly ? (
                      <span className="ui-faculty-exchanges__value">{fmt(line.count, 1)}</span>
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        max={50}
                        step={0.5}
                        inputMode="decimal"
                        aria-label={`${line.label} exchanges`}
                        value={line.count || ""}
                        placeholder="0"
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          onChange(line.id, Number.isFinite(next) ? Math.max(0, next) : 0);
                        }}
                      />
                    )}
                  </span>
                  <span>{fmt(line.choTotalG, 0)}</span>
                  <span>{fmt(line.proteinTotalG, 0)}</span>
                  <span>{fmt(line.fatTotalG, 0)}</span>
                  <span>{fmt(line.kcalTotal, 0)}</span>
                </div>
              ))}
            </div>
          );
        })}
        <div className="ui-faculty-exchanges__row ui-faculty-exchanges__row--total" role="row">
          <span>Total</span>
          <span>{fmt(tally.count, 1)}</span>
          <span>{fmt(tally.carbohydrateG, 0)} g</span>
          <span>{fmt(tally.proteinG, 0)} g</span>
          <span>{fmt(tally.fatG, 0)} g</span>
          <span>{fmt(tally.exchangeKcal, 0)}</span>
        </div>
      </div>

      <div className="ui-faculty-exchanges__summary">
        <p>
          Daily plan {fmt(tally.atwaterKcal, 0)} kcal
          {tally.carbPct != null
            ? ` — carbohydrate ${tally.carbPct}%, protein ${tally.proteinPct}%, fat ${tally.fatPct}%`
            : ""}
        </p>
        {needKcal != null && tally.atwaterKcal > 0 ? (
          <p>Compared with estimated need: {comparedTo(tally.atwaterKcal, needKcal, "kcal")}</p>
        ) : null}
        {dayTotals ? (
          <p>
            This day compared with the plan: energy {comparedTo(dayTotals.energyKcal, tally.atwaterKcal, "kcal")},
            carbohydrate {comparedTo(dayTotals.carbohydrateG, tally.carbohydrateG, "g")}, protein{" "}
            {comparedTo(dayTotals.proteinG, tally.proteinG, "g")}, fat {comparedTo(dayTotals.fatG, tally.fatG, "g")}
          </p>
        ) : null}
        {hint ? <p className="ui-muted">{hint}</p> : null}
      </div>
    </div>
  );
}
