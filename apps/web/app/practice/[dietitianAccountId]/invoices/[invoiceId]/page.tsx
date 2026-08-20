"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Alert,
  Breadcrumbs,
  Button,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
} from "@nutrition-saas/ui";
import { InvoiceDocument } from "../../../../../components/invoice-document";
import { api } from "../../../../../lib/api";
import { statusLabel } from "../../../../../lib/practice-labels";
import { errorMessage } from "../../../../../lib/humanize-error";

interface InvoiceDetail {
  id: string;
  invoiceNumber: string | null;
  status: string;
  clientName?: string;
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  subtotal: number;
  discountType: "PERCENT" | "FIXED" | null;
  discountValue: number | null;
  discountAmount: number;
  taxRatePercent: number;
  taxAmount: number;
  total: number;
  notes: string | null;
  items: Array<{ description: string; quantity: number; unitPrice: number; lineTotal: number }>;
}

interface PrintPayload {
  invoice: InvoiceDetail;
  practice: {
    practiceName: string;
    contactEmail: string | null;
    contactPhone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
    invoiceFooter: string | null;
  };
}

export default function InvoiceDetailPage() {
  const params = useParams<{ dietitianAccountId: string; invoiceId: string }>();
  const { dietitianAccountId, invoiceId } = params;
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [print, setPrint] = useState<PrintPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [discountType, setDiscountType] = useState<"" | "PERCENT" | "FIXED">("");
  const [discountValue, setDiscountValue] = useState("");
  const [taxRatePercent, setTaxRatePercent] = useState("0");
  const [notes, setNotes] = useState("");

  async function load() {
    const [detail, payload] = await Promise.all([
      api<InvoiceDetail>(`/api/v1/dietitian/${dietitianAccountId}/invoices/${invoiceId}`),
      api<PrintPayload>(`/api/v1/dietitian/${dietitianAccountId}/invoices/${invoiceId}/print`),
    ]);
    setInvoice(detail);
    setPrint(payload);
    setDiscountType(detail.discountType ?? "");
    setDiscountValue(detail.discountValue != null ? String(detail.discountValue) : "");
    setTaxRatePercent(String(detail.taxRatePercent ?? 0));
    setNotes(detail.notes ?? "");
  }

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load invoice")));
  }, [dietitianAccountId, invoiceId]);

  async function action(path: string) {
    setActionBusy(true);
    setError(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/invoices/${invoiceId}/${path}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Action failed. Please try again."));
    } finally {
      setActionBusy(false);
    }
  }

  async function saveDraftTotals(event: FormEvent) {
    event.preventDefault();
    if (!invoice || invoice.status !== "DRAFT") return;
    setActionBusy(true);
    setError(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/invoices/${invoiceId}`, {
        method: "PATCH",
        body: JSON.stringify({
          notes: notes || null,
          discountType: discountType || null,
          discountValue: discountType ? Number(discountValue || 0) : null,
          taxRatePercent: Number(taxRatePercent || 0),
        }),
      });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to update invoice"));
    } finally {
      setActionBusy(false);
    }
  }

  const invoicesHref = `/practice/${dietitianAccountId}/invoices`;

  if (!invoice && !error) {
    return (
      <section>
        <Breadcrumbs items={[{ label: "Invoices", href: invoicesHref }, { label: "Loading…" }]} />
        <LoadingState />
      </section>
    );
  }

  if (!invoice) {
    return (
      <section>
        <Breadcrumbs items={[{ label: "Invoices", href: invoicesHref }, { label: "Invoice" }]} />
        <Alert tone="danger">{error ?? "Unable to load invoice"}</Alert>
      </section>
    );
  }

  const isDraft = invoice.status === "DRAFT";
  const title = invoice.invoiceNumber ?? (isDraft ? "Draft quotation" : "Invoice");
  const canIssue = isDraft;
  const canTransition = ["ISSUED", "SENT", "OVERDUE"].includes(invoice.status);
  const practice = print?.practice;
  const documentLabel = isDraft ? "Quotation / Devis" : "Invoice / Facture";

  return (
    <section className="ui-invoice-page">
      <div className="ui-invoice-page__controls no-print">
        <Breadcrumbs items={[{ label: "Invoices", href: invoicesHref }, { label: title }]} />
        <PageHeader
          eyebrow="Document"
          title={title}
          description={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {invoice.clientName ?? "Client"}
              <StatusBadge status={invoice.status} label={statusLabel(invoice.status)} />
            </span>
          }
          actions={
            <div className="ui-invoice-page__actions">
              {canIssue ? (
                <Button disabled={actionBusy} onClick={() => void action("issue")}>
                  Issue invoice
                </Button>
              ) : null}
              {canTransition ? (
                <>
                  <Button disabled={actionBusy} onClick={() => void action("send")}>
                    Mark sent
                  </Button>
                  <Button disabled={actionBusy} onClick={() => void action("pay")}>
                    Mark paid
                  </Button>
                  <Button variant="danger" disabled={actionBusy} onClick={() => void action("cancel")}>
                    Cancel
                  </Button>
                </>
              ) : null}
              <Button variant="secondary" onClick={() => window.print()}>
                Print
              </Button>
              <Button variant="secondary" onClick={() => window.print()}>
                Download PDF
              </Button>
              <Link href={invoicesHref} className="ui-btn ui-btn--ghost">
                Back to list
              </Link>
            </div>
          }
        />

        <p className="ui-muted ui-invoice-page__hint">
          Download PDF opens your browser print dialog — choose “Save as PDF”. The paper below is the full document.
        </p>

        {error ? (
          <div style={{ marginBottom: 16 }}>
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}

        {canIssue ? (
          <form onSubmit={(event) => void saveDraftTotals(event)} className="ui-invoice-page__draft-form">
            <h2 className="ui-invoice-builder__panel-title">Edit draft totals</h2>
            <div className="ui-invoice-builder__fields ui-invoice-builder__fields--3">
              <Field label="Discount type">
                <Select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as "" | "PERCENT" | "FIXED")}
                >
                  <option value="">None</option>
                  <option value="PERCENT">Percent %</option>
                  <option value="FIXED">Fixed amount</option>
                </Select>
              </Field>
              <Field label="Discount value">
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  disabled={!discountType}
                />
              </Field>
              <Field label="Tax %">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={taxRatePercent}
                  onChange={(e) => setTaxRatePercent(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Notes / payment details">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <Button type="submit" disabled={actionBusy}>
              Update document
            </Button>
          </form>
        ) : null}
      </div>

      <div className="ui-facture-stage">
        <InvoiceDocument
          practice={{
            practiceName: practice?.practiceName ?? "Practice",
            contactEmail: practice?.contactEmail,
            contactPhone: practice?.contactPhone,
            addressLine1: practice?.addressLine1,
            addressLine2: practice?.addressLine2,
            city: practice?.city,
            region: practice?.region,
            postalCode: practice?.postalCode,
            country: practice?.country,
            invoiceFooter: practice?.invoiceFooter,
          }}
          invoice={{
            documentLabel,
            documentNumber: invoice.invoiceNumber ?? "DRAFT",
            statusLabel: statusLabel(invoice.status),
            clientName: invoice.clientName ?? "Client",
            issueDate: invoice.issueDate,
            dueDate: invoice.dueDate,
            currency: invoice.currency,
            subtotal: invoice.subtotal,
            discountType: invoice.discountType,
            discountValue: invoice.discountValue,
            discountAmount: invoice.discountAmount,
            taxRatePercent: invoice.taxRatePercent,
            taxAmount: invoice.taxAmount,
            total: invoice.total,
            notes: invoice.notes,
            items: invoice.items,
          }}
        />
      </div>
    </section>
  );
}
