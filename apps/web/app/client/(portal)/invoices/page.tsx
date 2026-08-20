"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  EmptyState,
  LoadingState,
  PageHeader,
  Section,
  StatusBadge,
  Table,
  Td,
} from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { formatDateOnly, formatMoney } from "../../../../lib/format";
import { errorMessage } from "../../../../lib/humanize-error";
import { statusLabel } from "../../../../lib/practice-labels";

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
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
  const [selected, setSelected] = useState<InvoicePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    void api<InvoiceRow[]>("/api/v1/portal/invoices")
      .then(setInvoices)
      .catch((err) => setError(errorMessage(err, "Unable to load invoices")));
  }, []);

  async function open(id: string) {
    setLoadingDetail(true);
    setError(null);
    try {
      setSelected(await api<InvoicePayload>(`/api/v1/portal/invoices/${id}`));
    } catch (err) {
      setError(errorMessage(err, "Unable to open invoice"));
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <section>
      <PageHeader
        eyebrow="Billing"
        title="Invoices"
        description="Invoices from your dietitian. Amounts and status are set by their practice."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {invoices === null ? <LoadingState>Loading invoices…</LoadingState> : null}
      {invoices && invoices.length === 0 ? (
        <Section title="All invoices" tone="muted">
          <EmptyState title="No invoices yet">
            When your dietitian shares an invoice, you’ll see it here.
          </EmptyState>
        </Section>
      ) : null}

      {invoices && invoices.length > 0 ? (
        <Section title="All invoices">
          <ul className="ui-client-invoice-list">
            {invoices.map((invoice) => (
              <li key={invoice.id}>
                <div>
                  <button
                    type="button"
                    className="ui-link"
                    style={{ background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit" }}
                    onClick={() => void open(invoice.id)}
                  >
                    {invoice.invoiceNumber ?? "Invoice"}
                  </button>
                  <div className="ui-muted">
                    Due {formatDateOnly(invoice.dueDate) || "—"} · {formatMoney(invoice.total, invoice.currency)}
                  </div>
                </div>
                <div className="ui-row">
                  <StatusBadge status={invoice.status} label={statusLabel(invoice.status)} />
                  <Button size="sm" variant="secondary" onClick={() => void open(invoice.id)}>
                    View
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {loadingDetail ? <LoadingState>Opening invoice…</LoadingState> : null}

      {selected ? (
        <Section
          title={selected.invoice.invoiceNumber ?? "Invoice"}
          description={`${selected.practice.practiceName} · Due ${formatDateOnly(selected.invoice.dueDate) || "—"}`}
          actions={<StatusBadge status={selected.invoice.status} label={statusLabel(selected.invoice.status)} />}
        >
          <Table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {selected.invoice.items.map((item) => (
                <tr key={`${item.description}-${item.lineTotal}`}>
                  <Td label="Item">{item.description}</Td>
                  <Td label="Qty">{item.quantity}</Td>
                  <Td label="Amount">{formatMoney(item.lineTotal, selected.invoice.currency)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p style={{ marginTop: 12 }}>
            <strong>Total:</strong> {formatMoney(selected.invoice.total, selected.invoice.currency)}
          </p>
          {selected.invoice.notes ? <p className="ui-muted">{selected.invoice.notes}</p> : null}
          {selected.practice.invoiceFooter ? (
            <p className="ui-muted" style={{ fontSize: 13 }}>
              {selected.practice.invoiceFooter}
            </p>
          ) : null}
          <div className="ui-row" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => window.print()}>
              Print
            </Button>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Close
            </Button>
          </div>
        </Section>
      ) : null}
    </section>
  );
}
