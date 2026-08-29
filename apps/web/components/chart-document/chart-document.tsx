import { formatDateOnly } from "../../lib/format";
import { AssessmentsBody } from "./assessments-body";
import { ClinicalBody } from "./clinical-body";
import { MeasurementBody } from "./measurement-body";
import { NutritionAnalysisBody } from "./nutrition-analysis-body";
import { NutritionBody } from "./nutrition-body";
import { PrescriptionBody } from "./prescription-body";
import { TrackingBody } from "./tracking-body";
import type {
  AssessmentsPrintBody,
  ClientPrintPayload,
  ClinicalPrintBody,
  MeasurementPrintBody,
  NutritionAnalysisPrintBody,
  NutritionPrintBody,
  PrescriptionPrintBody,
  TrackingPrintBody,
} from "./types";

function measureLabel(value: number | null | undefined, unit?: string | null): string | null {
  if (value == null) return null;
  return unit ? `${value} ${unit}` : String(value);
}

export function ChartDocument({ data }: { data: ClientPrintPayload }) {
  const credentials = [data.dietitian.title, data.dietitian.specialization].filter(Boolean).join(" · ");

  return (
    <article
      className={["ui-chart-doc", data.doc === "nutrition-analysis" ? "ui-chart-doc--analysis" : ""]
        .filter(Boolean)
        .join(" ")}
      id="print-chart"
    >
      <header className="ui-chart-doc__header">
        <div>
          <h1 className="ui-chart-doc__brand">{data.practice.practiceName}</h1>
          <p className="ui-chart-doc__dietitian">{data.dietitian.name}</p>
          {credentials ? <p className="ui-chart-doc__meta">{credentials}</p> : null}
          {data.dietitian.email ? <p className="ui-chart-doc__meta">{data.dietitian.email}</p> : null}
          {data.practice.address ? <p className="ui-chart-doc__meta">{data.practice.address}</p> : null}
        </div>
        <div className="ui-chart-doc__title-block">
          <p className="ui-chart-doc__eyebrow">Client chart</p>
          <h2 className="ui-chart-doc__title">{data.title}</h2>
          <p className="ui-chart-doc__meta">{formatDateOnly(data.generatedAt)}</p>
        </div>
      </header>

      <section className="ui-chart-doc__client">
        <div>
          <p className="ui-chart-doc__label">Client</p>
          <p className="ui-chart-doc__client-name">{data.client.name}</p>
          {data.client.email ? <p className="ui-chart-doc__meta">{data.client.email}</p> : null}
        </div>
        <div className="ui-chart-doc__vitals">
          <div className="ui-chart-doc__vital">
            <span className="ui-chart-doc__label">Age</span>
            <span>{data.client.ageYears != null ? data.client.ageYears : "—"}</span>
          </div>
          {data.client.bmi != null ? (
            <div className="ui-chart-doc__vital">
              <span className="ui-chart-doc__label">BMI</span>
              <span>{data.client.bmi}</span>
            </div>
          ) : null}
          {data.client.height ? (
            <div className="ui-chart-doc__vital">
              <span className="ui-chart-doc__label">Height</span>
              <span>{measureLabel(data.client.height.value, data.client.height.unit)}</span>
            </div>
          ) : null}
          {data.client.weight ? (
            <div className="ui-chart-doc__vital">
              <span className="ui-chart-doc__label">Weight</span>
              <span>{measureLabel(data.client.weight.value, data.client.weight.unit)}</span>
            </div>
          ) : null}
        </div>
      </section>

      <div className="ui-chart-doc__body">
        {data.doc === "clinical" ? <ClinicalBody body={data.body as ClinicalPrintBody} /> : null}
        {data.doc === "assessments" ? <AssessmentsBody body={data.body as AssessmentsPrintBody} /> : null}
        {data.doc === "measurement" ? <MeasurementBody body={data.body as MeasurementPrintBody} /> : null}
        {data.doc === "tracking" ? <TrackingBody body={data.body as TrackingPrintBody} /> : null}
        {data.doc === "prescription" ? <PrescriptionBody body={data.body as PrescriptionPrintBody} /> : null}
        {data.doc === "nutrition" ? <NutritionBody body={data.body as NutritionPrintBody} /> : null}
        {data.doc === "nutrition-analysis" ? (
          <NutritionAnalysisBody body={data.body as NutritionAnalysisPrintBody} />
        ) : null}
      </div>
    </article>
  );
}
