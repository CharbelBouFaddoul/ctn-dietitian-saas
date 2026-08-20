"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Alert,
  Breadcrumbs,
  Button,
  LoadingState,
  PageHeader,
  StatusBadge,
  Table,
  Td,
} from "@nutrition-saas/ui";
import { api } from "../../../../../lib/api";
import { statusLabel } from "../../../../../lib/practice-labels";
import { errorMessage } from "../../../../../lib/humanize-error";
import { formatDateOnly, formatMoney } from "../../../../../lib/format";

interface InvoiceDetail {
  id: string;
  invoiceNumber: string | null;
  status: string;
  clientName?: string;
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  subtotal: number;
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

  async function load() {
    const [detail, payload] = await Promise.all([
      api<InvoiceDetail>(`/api/v1/dietitian/${dietitianAccountId}/invoices/${invoiceId}`),
      api<PrintPayload>(`/api/v1/dietitian/${dietitianAccountId}/invoices/${invoiceId}/print`),
    ]);
    setInvoice(detail);
    setPrint(payload);
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

  const invoicesHref = `/practice/${dietitianAccountId}/invoices`;

  if (!invoice && !error) {
    return (
      <section>
        <Breadcrumbs
          items={[{ label: "Invoices", href: invoicesHref }, { label: "Loading…" }]}
        />
        <LoadingState />
      </section>
    );
  }

  if (!invoice) {
    return (
      <section>
        <Breadcrumbs
          items={[{ label: "Invoices", href: invoicesHref }, { label: "Invoice" }]}
        />
        <Alert tone="danger">{error ?? "Unable to load invoice"}</Alert>
      </section>
    );
  }

  const title = invoice.invoiceNumber ?? "Draft invoice";
  const canIssue = invoice.status === "DRAFT";
  const canTransition = ["ISSUED", "SENT", "OVERDUE"].includes(invoice.status);

  return (
    <section>
      <Breadcrumbs
        items={[{ label: "Invoices", href: invoicesHref }, { label: title }]}
      />
      <PageHeader
        title={title}
        description={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {invoice.clientName ?? "Client"}
            <StatusBadge status={invoice.status} label={statusLabel(invoice.status)} />
          </span>
        }
        actions={
          <div className="ui-row">
            {canIssue ? (
              <Button disabled={actionBusy} onClick={() => void action("issue")}>
                Issue
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
                <Button
                  variant="danger"
                  disabled={actionBusy}
                  onClick={() => void action("cancel")}
                >
                  Cancel
                </Button>
              </>
            ) : null}
            <Button variant="secondary" onClick={() => window.print()}>
              Print
            </Button>
          </div>
        }
      />

      {error ? (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 20,
          marginBottom: 24,
        }}
      >
        <div>
          <p className="ui-eyebrow" style={{ marginBottom: 4 }}>
            Issue date
          </p>
          <p style={{ margin: 0, fontWeight: 500 }}>{formatDateOnly(invoice.issueDate)}</p>
        </div>
        <div>
          <p className="ui-eyebrow" style={{ marginBottom: 4 }}>
            Due date
          </p>
          <p style={{ margin: 0, fontWeight: 500 }}>{formatDateOnly(invoice.dueDate)}</p>
        </div>
      </div>

      <Table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit price</th>
            <th>Line total</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, idx) => (
            <tr key={idx}>
              <Td label="Description">{item.description}</Td>
              <Td label="Qty">{item.quantity}</Td>
              <Td label="Unit price">{formatMoney(item.unitPrice, invoice.currency)}</Td>
              <Td label="Line total">
                <strong>{formatMoney(item.lineTotal, invoice.currency)}</strong>
              </Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td
              colSpan={3}
              style={{ textAlign: "right", fontWeight: 600, padding: "10px 16px 10px 0" }}
            >
              Total
            </td>
            <td style={{ fontWeight: 700, fontSize: "1.0625rem", padding: "10px 16px" }}>
              {formatMoney(invoice.total, invoice.currency)}
            </td>
          </tr>
        </tfoot>
      </Table>

      {invoice.notes ? (
        <div
          style={{
            marginTop: 16,
            padding: "12px 16px",
            background: "var(--color-surface)",
            borderRadius: 8,
            border: "1px solid var(--color-border)",
          }}
        >
          <p className="ui-eyebrow" style={{ marginBottom: 4 }}>
            Notes
          </p>
          <p style={{ margin: 0 }}>{invoice.notes}</p>
        </div>
      ) : null}

      {print ? (
        <div
          id="print-invoice"
          style={{
            marginTop: 32,
            padding: "24px 28px",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            background: "var(--color-surface)",
          }}
        >
          <h2 style={{ margin: "0 0 4px" }}>{print.practice.practiceName}</h2>
          <p className="ui-muted" style={{ margin: "0 0 2px", fontSize: 13 }}>
            {[
              print.practice.addressLine1,
              print.practice.city,
              print.practice.region,
              print.practice.postalCode,
              print.practice.country,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
          {print.practice.contactEmail || print.practice.contactPhone ? (
            <p className="ui-muted" style={{ margin: "0 0 16px", fontSize: 13 }}>
              {[print.practice.contactEmail, print.practice.contactPhone]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          <hr
            style={{ border: "none", borderTop: "1px solid var(--color-border)", margin: "12px 0" }}
          />
          <div style={{ display: "grid", gap: 4, fontSize: 14 }}>
            <p style={{ margin: 0 }}>
              <strong>Invoice:</strong> {print.invoice.invoiceNumber ?? "Draft"} ·{" "}
              <strong>Status:</strong> {statusLabel(print.invoice.status)}
            </p>
            <p style={{ margin: 0 }}>
              <strong>Issued:</strong> {formatDateOnly(print.invoice.issueDate)} ·{" "}
              <strong>Due:</strong> {formatDateOnly(print.invoice.dueDate)}
            </p>
            <p style={{ margin: 0 }}>
              <strong>Bill to:</strong> {print.invoice.clientName ?? "Client"}
            </p>
          </div>
          {print.practice.invoiceFooter ? (
            <p style={{ marginTop: 16, fontSize: 12, color: "var(--color-muted)" }}>
              {print.practice.invoiceFooter}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
