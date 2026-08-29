import { formatDateOnly } from "../../lib/format";
import { statusLabel } from "../../lib/practice-labels";
import { DocSection, DocTable } from "./print-bits";
import type { AssessmentsPrintBody } from "./types";

export function AssessmentsBody({ body }: { body: AssessmentsPrintBody }) {
  return (
    <>
      {body.submitted.length === 0 && body.inProgress.length === 0 ? (
        <p className="ui-chart-doc__empty">No custom forms</p>
      ) : null}
      {body.submitted.map((form) => (
        <DocSection key={`${form.name}-${form.completedAt ?? "done"}`} title={form.name}>
          {form.completedAt ? (
            <p className="ui-chart-doc__meta">Submitted {formatDateOnly(form.completedAt)}</p>
          ) : null}
          <DocTable
            headers={["Question", "Answer"]}
            rows={form.questions.map((row) => [row.label, row.answer])}
            empty="No answers"
          />
        </DocSection>
      ))}
      {body.inProgress.length > 0 ? (
        <DocSection title="In progress">
          <DocTable
            headers={["Form", "Status", "Started"]}
            rows={body.inProgress.map((row) => [
              row.name,
              statusLabel(row.status),
              formatDateOnly(row.startedAt),
            ])}
          />
        </DocSection>
      ) : null}
    </>
  );
}
