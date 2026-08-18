"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../../lib/api";
import { buttonStyle, cellStyle, tableStyle } from "../../practice-shell";

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
  const params = useParams<{ organizationId: string; invoiceId: string }>();
  const { organizationId, invoiceId } = params;
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [print, setPrint] = useState<PrintPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [detail, payload] = await Promise.all([
      api<InvoiceDetail>(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}`),
      api<PrintPayload>(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/print`),
    ]);
    setInvoice(detail);
    setPrint(payload);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Unable to load invoice"));
  }, [organizationId, invoiceId]);

  async function action(path: string) {
    await api(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/${path}`, { method: "POST", body: JSON.stringify({}) });
    await load();
  }

  if (!invoice) {
    return <p>{error ?? "Loading…"}</p>;
  }

  return (
    <section>
      <p>
        <Link href={`/orgs/${organizationId}/invoices`} style={{ color: "var(--color-accent)" }}>
          ← Invoices
        </Link>
      </p>
      <h1>{invoice.invoiceNumber ?? "Draft invoice"}</h1>
      <p style={{ color: "var(--color-muted)" }}>
        {invoice.clientName} · {invoice.status}
      </p>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {invoice.status === "DRAFT" ? (
          <button type="button" style={buttonStyle} onClick={() => void action("issue").catch((err) => setError(String(err)))}>
            Issue
          </button>
        ) : null}
        {["ISSUED", "SENT", "OVERDUE"].includes(invoice.status) ? (
          <>
            <button type="button" style={buttonStyle} onClick={() => void action("send").catch((err) => setError(String(err)))}>
              Mark sent
            </button>
            <button type="button" style={buttonStyle} onClick={() => void action("pay").catch((err) => setError(String(err)))}>
              Mark paid
            </button>
            <button type="button" style={buttonStyle} onClick={() => void action("cancel").catch((err) => setError(String(err)))}>
              Cancel
            </button>
          </>
        ) : null}
        <button type="button" style={buttonStyle} onClick={() => window.print()}>
          Print
        </button>
      </div>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={cellStyle}>Description</th>
            <th style={cellStyle}>Qty</th>
            <th style={cellStyle}>Unit</th>
            <th style={cellStyle}>Line total</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => (
            <tr key={item.description + item.lineTotal}>
              <td style={cellStyle}>{item.description}</td>
              <td style={cellStyle}>{item.quantity}</td>
              <td style={cellStyle}>
                {item.unitPrice.toFixed(2)} {invoice.currency}
              </td>
              <td style={cellStyle}>
                {item.lineTotal.toFixed(2)} {invoice.currency}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <strong>Total:</strong> {invoice.total.toFixed(2)} {invoice.currency}
      </p>
      {invoice.notes ? <p>{invoice.notes}</p> : null}

      {print ? (
        <div id="print-invoice" style={{ marginTop: 24, padding: 16, border: "1px solid var(--color-border)" }}>
          <h2>{print.practice.practiceName}</h2>
          <p style={{ fontSize: 14, color: "var(--color-muted)" }}>
            {[print.practice.addressLine1, print.practice.city, print.practice.region, print.practice.postalCode, print.practice.country]
              .filter(Boolean)
              .join(", ")}
          </p>
          <p style={{ fontSize: 14 }}>{print.practice.contactEmail} {print.practice.contactPhone}</p>
          <hr />
          <p>
            <strong>Invoice:</strong> {print.invoice.invoiceNumber ?? "Draft"} · <strong>Status:</strong> {print.invoice.status}
          </p>
          <p>
            <strong>Issue:</strong> {print.invoice.issueDate ?? "—"} · <strong>Due:</strong> {print.invoice.dueDate ?? "—"}
          </p>
          <p>
            <strong>Bill to:</strong> {print.invoice.clientName}
          </p>
          {print.practice.invoiceFooter ? <p style={{ marginTop: 16, fontSize: 13 }}>{print.practice.invoiceFooter}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
