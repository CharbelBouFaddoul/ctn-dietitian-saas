import { formatDateOnly } from "../../lib/format";
import { statusLabel } from "../../lib/practice-labels";
import { DocSection, DocTable, measureText } from "./print-bits";
import type { TrackingPrintBody } from "./types";

export function TrackingBody({ body }: { body: TrackingPrintBody }) {
  return (
    <>
      <p className="ui-chart-doc__meta">
        {formatDateOnly(body.from)} – {formatDateOnly(body.to)}
      </p>
      {body.days.map((day) => (
        <DocSection key={day.date} title={formatDateOnly(day.date)}>
          <DocTable
            headers={["Food", "Amount", "Meal"]}
            rows={day.foods.map((row) => [
              row.name,
              measureText(row.quantity, row.unit),
              row.meal ? statusLabel(row.meal) : "—",
            ])}
            empty="No food logged"
          />
          <p className="ui-chart-doc__meta">Water {measureText(day.waterMl, "ml")}</p>
          <DocTable
            headers={["Activity", "Minutes", "Intensity"]}
            rows={day.exercise.map((row) => [
              row.activity,
              String(row.minutes),
              row.intensity ? statusLabel(row.intensity) : "—",
            ])}
            empty="No exercise"
          />
          <p className="ui-chart-doc__meta">
            Sleep{" "}
            {day.sleep
              ? `${day.sleep.minutes != null ? `${day.sleep.minutes} min` : "—"}`
              : "not logged"}
            {day.sleep?.quality != null ? ` · quality ${day.sleep.quality}` : ""}
          </p>
          {day.habits.length > 0 ? (
            <DocTable
              headers={["Habit", "Done"]}
              rows={day.habits.map((row) => [row.name, row.completed ? "Yes" : "No"])}
            />
          ) : null}
        </DocSection>
      ))}
    </>
  );
}
