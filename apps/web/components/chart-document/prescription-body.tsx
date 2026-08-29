import { formatDateOnly } from "../../lib/format";
import { statusLabel } from "../../lib/practice-labels";
import { DocFields, DocSection, measureText } from "./print-bits";
import type { PrescriptionPrintBody, PrintField } from "./types";

function filled(rows: Array<PrintField | null>): PrintField[] {
  return rows.filter((row): row is PrintField => Boolean(row?.value));
}

export function PrescriptionBody({ body }: { body: PrescriptionPrintBody }) {
  const current = filled([
    body.current.weightKg != null
      ? { label: "Weight", value: measureText(body.current.weightKg, body.current.weightUnit) }
      : null,
    body.current.height != null
      ? { label: "Height", value: measureText(body.current.height, body.current.heightUnit) }
      : null,
    body.current.bmi != null ? { label: "BMI", value: String(body.current.bmi) } : null,
    body.current.bodyFatPct != null
      ? { label: "Body fat", value: measureText(body.current.bodyFatPct, "%") }
      : null,
  ]);
  const goals = filled([
    body.goals.weightKg != null ? { label: "Weight", value: measureText(body.goals.weightKg, "kg") } : null,
    body.goals.bodyFatPct != null
      ? { label: "Body fat", value: measureText(body.goals.bodyFatPct, "%") }
      : null,
    body.goals.energyKcal != null
      ? { label: "Energy", value: measureText(body.goals.energyKcal, "kcal") }
      : null,
  ]);
  const energy = filled([
    body.energy.bmrFormula ? { label: "BMR", value: statusLabel(body.energy.bmrFormula) } : null,
    body.energy.energyFormula ? { label: "Energy formula", value: statusLabel(body.energy.energyFormula) } : null,
    body.energy.palCurrentKey
      ? {
          label: "PAL current",
          value: `${statusLabel(body.energy.palCurrentKey)}${
            body.energy.palCurrentValue != null ? ` (${body.energy.palCurrentValue})` : ""
          }`,
        }
      : null,
    body.energy.palGoalKey ? { label: "PAL goal", value: statusLabel(body.energy.palGoalKey) } : null,
  ]);
  const macros = filled([
    body.macros.fatPct != null ? { label: "Fat", value: `${body.macros.fatPct}%` } : null,
    body.macros.carbPct != null ? { label: "Carbohydrate", value: `${body.macros.carbPct}%` } : null,
    body.macros.proteinPct != null ? { label: "Protein", value: `${body.macros.proteinPct}%` } : null,
    body.macros.proteinPerKg != null
      ? { label: "Protein / kg", value: measureText(body.macros.proteinPerKg, "g/kg") }
      : null,
    body.macros.fiberGoalG != null ? { label: "Fiber", value: measureText(body.macros.fiberGoalG, "g") } : null,
  ]);
  const duration = filled([
    body.duration.beginDate ? { label: "Start", value: formatDateOnly(body.duration.beginDate) } : null,
    body.duration.forecastFinishDate
      ? { label: "Forecast finish", value: formatDateOnly(body.duration.forecastFinishDate) }
      : null,
  ]);

  return (
    <>
      <DocSection title="Current">
        <DocFields fields={current} />
      </DocSection>
      <DocSection title="Goals">
        <DocFields fields={goals} />
      </DocSection>
      <DocSection title="Energy">
        <DocFields fields={energy} />
      </DocSection>
      <DocSection title="Macros">
        <DocFields fields={macros} />
      </DocSection>
      <DocSection title="Duration">
        <DocFields fields={duration} />
      </DocSection>
    </>
  );
}
