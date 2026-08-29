import { formatDateOnly } from "../../lib/format";
import { DocSection, DocTable, measureText } from "./print-bits";
import type { MeasurementPrintBody } from "./types";

export function MeasurementBody({ body }: { body: MeasurementPrintBody }) {
  return (
    <>
      <DocSection title="Latest">
        <DocTable
          headers={["Metric", "Value", "Date"]}
          rows={body.latest.map((row) => [
            row.label,
            measureText(row.value, row.unit),
            formatDateOnly(row.measuredAt),
          ])}
          empty="No measurements"
        />
      </DocSection>
      <DocSection title="Recent history">
        <DocTable
          headers={["Date", "Metric", "Value"]}
          rows={body.history.map((row) => [
            formatDateOnly(row.measuredAt),
            row.label,
            measureText(row.value, row.unit),
          ])}
          empty="No history"
        />
      </DocSection>
    </>
  );
}
