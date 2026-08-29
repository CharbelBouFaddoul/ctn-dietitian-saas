"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Alert, Button, LoadingState } from "@nutrition-saas/ui";
import { ChartDocument } from "../../../../../../components/chart-document/chart-document";
import {
  isClientPrintDoc,
  type ClientPrintPayload,
} from "../../../../../../components/chart-document/types";
import { api } from "../../../../../../lib/api";
import { downloadChartPdf } from "../../../../../../lib/download-chart-pdf";
import { errorMessage } from "../../../../../../lib/humanize-error";

function fileName(payload: ClientPrintPayload) {
  const client = payload.client.name.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "client";
  const title = payload.title.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "chart";
  return `${client}-${title}.pdf`;
}

function PrintDocument() {
  const params = useParams<{ dietitianAccountId: string; clientId: string }>();
  const searchParams = useSearchParams();
  const { dietitianAccountId, clientId } = params;
  const doc = searchParams.get("doc");
  const [payload, setPayload] = useState<ClientPrintPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const chartHref = `/practice/${dietitianAccountId}/clients/${clientId}${
    doc === "nutrition-analysis"
      ? "?tab=nutrition-analysis"
      : doc === "nutrition"
        ? "?tab=meal-plan"
        : doc
          ? `?tab=${doc}`
          : ""
  }`;

  useEffect(() => {
    if (!isClientPrintDoc(doc)) {
      setError("Unknown document");
      setPayload(null);
      return;
    }
    void api<ClientPrintPayload>(
      `/api/v1/dietitian/${dietitianAccountId}/clients/${clientId}/print?doc=${doc}`,
    )
      .then(setPayload)
      .catch((err) => setError(errorMessage(err, "Unable to load document")));
  }, [dietitianAccountId, clientId, doc]);

  async function downloadPdf() {
    const paper = document.getElementById("print-chart");
    if (!paper || !payload) return;
    setDownloading(true);
    setError(null);
    try {
      await downloadChartPdf(paper, fileName(payload));
    } catch (err) {
      setError(errorMessage(err, "Unable to download PDF"));
    } finally {
      setDownloading(false);
    }
  }

  if (!payload && !error) {
    return <LoadingState />;
  }

  return (
    <section className="ui-chart-print">
      <div className="ui-chart-doc-toolbar no-print">
        <Link href={chartHref} className="ui-btn ui-btn--ghost">
          Back to chart
        </Link>
        <Button variant="secondary" onClick={() => window.print()} disabled={!payload}>
          Print
        </Button>
        <Button onClick={() => void downloadPdf()} disabled={!payload || downloading}>
          {downloading ? "Downloading…" : "Download PDF"}
        </Button>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {payload ? (
        <div className="ui-chart-doc-stage">
          <ChartDocument data={payload} />
        </div>
      ) : null}
    </section>
  );
}

export default function ClientChartPrintPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <PrintDocument />
    </Suspense>
  );
}
