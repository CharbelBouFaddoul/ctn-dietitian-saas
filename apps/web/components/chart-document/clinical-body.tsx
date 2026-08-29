import { formatDateOnly } from "../../lib/format";
import { statusLabel } from "../../lib/practice-labels";
import { DocFields, DocSection, DocTable } from "./print-bits";
import type { ClinicalPrintBody } from "./types";

export function ClinicalBody({ body }: { body: ClinicalPrintBody }) {
  return (
    <>
      {body.sections.map((section) => (
        <DocSection key={section.title} title={section.title}>
          <DocFields fields={section.fields} />
        </DocSection>
      ))}
      <DocSection title="Goals">
        <DocTable
          headers={["Goal", "Status", "Target", "Notes"]}
          rows={body.goals.map((goal) => [
            goal.title,
            statusLabel(goal.status),
            formatDateOnly(goal.targetDate),
            goal.description ?? "—",
          ])}
          empty="No goals"
        />
      </DocSection>
      <DocSection title="Documents">
        <DocTable
          headers={["File", "Added"]}
          rows={body.documents.map((row) => [row.name, formatDateOnly(row.createdAt)])}
          empty="No documents"
        />
      </DocSection>
    </>
  );
}
