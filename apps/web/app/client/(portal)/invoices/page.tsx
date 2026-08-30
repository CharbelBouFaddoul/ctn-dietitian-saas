"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  EmptyState,
  LoadingState,
  PageHeader,
  Section,
  StatusBadge,
} from "@nutrition-saas/ui";
import { InvoiceDocument } from "../../../../components/invoice-document";
import { FilterPopover, ListFilters } from "../../../../components/list-filters";
import { api } from "../../../../lib/api";
import { formatDateOnly, formatMoney } from "../../../../lib/format";
import { errorMessage } from "../../../../lib/humanize-error";
import { statusLabel } from "../../../../lib/practice-labels";

const STATUS_CHIPS = [
  { value: "", label: "All statuses" },
  { value: "ISSUED", label: "Issued" },
  { value: "SENT", label: "Sent" },
  { value: "PAID", label: "Paid" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  status: string;
  dueDate: string | null;
  total: number;
  currency: string;
}

interface InvoiceDetail extends InvoiceRow {
  issueDate: string | null;
  subtotal: number;
  discountType: "PERCENT" | "FIXED" | null;
  discountValue: number | null;
  discountAmount: number;
  taxRatePercent: number;
  taxAmount: number;
  notes: string | null;
  items: Array<{ description: string; quantity: number; unitPrice: number; lineTotal: number }>;
}

interface InvoicePayload {
  invoice: InvoiceDetail;
  practice: {
    practiceName: string;
    contactEmail: string | null;
    contactPhone?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    region?: string | null;
    postalCode?: string | null;
    country?: string | null;
    invoiceFooter: string | null;
  };
}

export default function ClientInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
  const [selected, setSelected] = useState<InvoicePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!invoices) return null;
    return invoices.filter((invoice) => {
      const number = (invoice.invoiceNumber ?? "invoice").toLowerCase();
      const matchesSearch = !query || number.includes(query);
      const matchesStatus = !status || invoice.status === status;
      return matchesSearch && matchesStatus;
    });
  }, [invoices, query, status]);
  const hasFilters = Boolean(query || status);

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
    <section className="ui-invoice-page">
      <div className="ui-invoice-page__controls no-print">
        <PageHeader
          eyebrow="Billing"
          title="Invoices"
          description="Invoices from your dietitian. Open one to view, print, or save as PDF."
        />
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <ListFilters
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search invoice number"
          hasFilters={hasFilters}
          onClear={() => {
            setSearch("");
            setStatus("");
          }}
          count={filtered?.length}
          countNoun="invoice"
          loading={invoices === null}
        >
          <FilterPopover
            label="Filter by status"
            value={status ? statusLabel(status) : "Status"}
            active={Boolean(status)}
            searchPlaceholder="Search status"
            onSelect={setStatus}
            items={STATUS_CHIPS.map((chip) => ({
              id: chip.value,
              label: chip.label,
              active: status === chip.value,
            }))}
          />
        </ListFilters>

        {invoices === null ? <LoadingState>Loading invoices…</LoadingState> : null}
        {filtered && filtered.length === 0 ? (
          <Section title="All invoices" tone="muted">
            <EmptyState title={hasFilters ? "No invoices match" : "No invoices yet"}>
              {hasFilters
                ? "Try a different search or status, or clear filters."
                : "When your dietitian shares an invoice, you’ll see it here."}
            </EmptyState>
          </Section>
        ) : null}

        {filtered && filtered.length > 0 ? (
          <Section title="All invoices">
            <ul className="ui-client-invoice-list">
              {filtered.map((invoice) => (
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
          <div className="ui-row" style={{ marginBottom: 12 }}>
            <Button variant="secondary" onClick={() => window.print()}>
              Print / Download PDF
            </Button>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Close
            </Button>
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="ui-facture-stage">
          <InvoiceDocument
            practice={selected.practice}
            invoice={{
              documentLabel: "Invoice / Facture",
              documentNumber: selected.invoice.invoiceNumber ?? "Invoice",
              statusLabel: statusLabel(selected.invoice.status),
              clientName: "You",
              issueDate: selected.invoice.issueDate,
              dueDate: selected.invoice.dueDate,
              currency: selected.invoice.currency,
              subtotal: selected.invoice.subtotal,
              discountType: selected.invoice.discountType,
              discountValue: selected.invoice.discountValue,
              discountAmount: selected.invoice.discountAmount,
              taxRatePercent: selected.invoice.taxRatePercent,
              taxAmount: selected.invoice.taxAmount,
              total: selected.invoice.total,
              notes: selected.invoice.notes,
              items: selected.invoice.items,
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
