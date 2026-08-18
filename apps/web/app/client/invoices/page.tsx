"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";

interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  status: string;
  dueDate: string | null;
  total: number;
  currency: string;
}

interface InvoicePayload {
  invoice: InvoiceRow & {
    issueDate: string | null;
    items: Array<{ description: string; quantity: number; unitPrice: number; lineTotal: number }>;
    notes: string | null;
  };
  practice: {
    practiceName: string;
    contactEmail: string | null;
    invoiceFooter: string | null;
  };
}

export default function ClientInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [selected, setSelected] = useState<InvoicePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setInvoices(await api<InvoiceRow[]>("/api/v1/portal/invoices"));
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Unable to load invoices"));
  }, []);

  async function open(id: string) {
    setSelected(await api<InvoicePayload>(`/api/v1/portal/invoices/${id}`));
  }

  return (
    <div>
      <h1>Invoices</h1>
      <p style={{ color: "var(--color-muted)" }}>View invoices shared by your dietitian. You cannot change amounts or status here.</p>
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
        {invoices.map((invoice) => (
          <li key={invoice.id} style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 12 }}>
            <button type="button" onClick={() => void open(invoice.id)} style={{ background: "none", border: 0, padding: 0, color: "var(--color-accent)", cursor: "pointer" }}>
              {invoice.invoiceNumber ?? invoice.id}
            </button>
            <div style={{ fontSize: 13, color: "var(--color-muted)" }}>
              {invoice.status} · due {invoice.dueDate ?? "—"} · {invoice.total.toFixed(2)} {invoice.currency}
            </div>
          </li>
        ))}
      </ul>
      {invoices.length === 0 ? <p>No invoices yet.</p> : null}

      {selected ? (
        <section style={{ marginTop: 24, borderTop: "1px solid var(--color-border)", paddingTop: 16 }}>
          <h2>{selected.invoice.invoiceNumber}</h2>
          <p>{selected.practice.practiceName}</p>
          <p>
            Status: {selected.invoice.status} · Due: {selected.invoice.dueDate ?? "—"}
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {selected.invoice.items.map((item) => (
                <tr key={item.description}>
                  <td>{item.description}</td>
                  <td>{item.quantity}</td>
                  <td>{item.lineTotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            <strong>Total:</strong> {selected.invoice.total.toFixed(2)} {selected.invoice.currency}
          </p>
          {selected.invoice.notes ? <p>{selected.invoice.notes}</p> : null}
          {selected.practice.invoiceFooter ? <p style={{ fontSize: 13 }}>{selected.practice.invoiceFooter}</p> : null}
          <button type="button" onClick={() => window.print()}>
            Print
          </button>
        </section>
      ) : null}

      <p style={{ marginTop: 16 }}>
        <Link href="/client" style={{ color: "var(--color-accent)" }}>
          Back to home
        </Link>
      </p>
    </div>
  );
}
