"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert, Breadcrumbs, Button, Input, LoadingState, PageHeader, Textarea } from "@nutrition-saas/ui";
import {
  InvoiceDocument,
  computeInvoicePreview,
  computeLinePreview,
} from "../../../../../components/invoice-document";
import { SearchableSelect } from "../../../../../components/searchable-select";
import { api } from "../../../../../lib/api";
import { clientDisplayName } from "../../../../../lib/client-identity";
import { formatMoney } from "../../../../../lib/format";
import { errorMessage } from "../../../../../lib/humanize-error";
import { localDateKey } from "../../../../../lib/local-date";

interface ClientRow {
  id: string;
  firstName: string;
  lastName: string;
  displayName?: string | null;
}

interface PracticeSettings {
  practiceName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  invoiceFooter: string | null;
  invoiceDefaultTaxPercent?: number;
  currency?: string;
}

type LineDraft = {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

function newLine(partial?: Partial<LineDraft>): LineDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: partial?.description ?? "Nutrition consultation",
    quantity: partial?.quantity ?? "1",
    unitPrice: partial?.unitPrice ?? "100",
  };
}

export default function NewInvoicePage() {
  const params = useParams<{ dietitianAccountId: string }>();
  const dietitianAccountId = params.dietitianAccountId;
  const router = useRouter();
  const base = `/practice/${dietitianAccountId}/invoices`;

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [practice, setPractice] = useState<PracticeSettings | null>(null);
  const [clientId, setClientId] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [discountType, setDiscountType] = useState<"" | "PERCENT" | "FIXED">("");
  const [discountValue, setDiscountValue] = useState("");
  const [taxRatePercent, setTaxRatePercent] = useState("0");
  const [notes, setNotes] = useState("");
  const [docKind, setDocKind] = useState<"quotation" | "invoice">("quotation");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [clientList, settings] = await Promise.all([
          api<{ items: ClientRow[] }>(`/api/v1/dietitian/${dietitianAccountId}/clients?pageSize=50`),
          api<PracticeSettings>(`/api/v1/dietitian/${dietitianAccountId}/settings`),
        ]);
        if (cancelled) return;
        setClients(clientList.items);
        setPractice(settings);
        const presetClientId =
          typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("clientId") : null;
        if (presetClientId) setClientId(presetClientId);
        else if (clientList.items[0]) setClientId(clientList.items[0].id);
        if (settings.invoiceDefaultTaxPercent != null) {
          setTaxRatePercent(String(settings.invoiceDefaultTaxPercent));
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, "Unable to load create form"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [dietitianAccountId]);

  useEffect(() => {
    if (!previewOpen) return;
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPreviewOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [previewOpen]);

  const selectedClient = clients.find((client) => client.id === clientId);
  const currency = practice?.currency ?? "USD";
  const clientOptions = useMemo(() => {
    const options = clients.map((client) => ({ id: client.id, label: clientDisplayName(client) }));
    if (clientId && !options.some((option) => option.id === clientId)) {
      options.unshift({ id: clientId, label: "Selected client" });
    }
    return options;
  }, [clientId, clients]);

  const previewItems = useMemo(
    () =>
      lines.map((line) => {
        const computed = computeLinePreview(Number(line.quantity), Number(line.unitPrice));
        return {
          description: line.description,
          ...computed,
        };
      }),
    [lines],
  );

  const totals = useMemo(
    () =>
      computeInvoicePreview({
        items: previewItems,
        discountType,
        discountValue: Number(discountValue || 0),
        taxRatePercent: Number(taxRatePercent || 0),
      }),
    [previewItems, discountType, discountValue, taxRatePercent],
  );

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((line) => line.key !== key)));
  }

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (!clientId) {
      setError("Select a client.");
      return;
    }
    const items = lines
      .map((line) => ({
        description: line.description.trim(),
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
      }))
      .filter((item) => item.description && item.quantity > 0);

    if (!items.length) {
      setError("Add at least one line item with a description and quantity.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await api<{ id: string }>(`/api/v1/dietitian/${dietitianAccountId}/invoices`, {
        method: "POST",
        body: JSON.stringify({
          clientId,
          notes: notes || undefined,
          discountType: discountType || null,
          discountValue: discountType ? Number(discountValue || 0) : null,
          taxRatePercent: Number(taxRatePercent || 0),
          items,
        }),
      });
      router.push(`${base}/${created.id}`);
    } catch (err) {
      setError(errorMessage(err, "Could not create invoice"));
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section>
        <Breadcrumbs items={[{ label: "Invoices", href: base }, { label: "New" }]} />
        <LoadingState>Preparing invoice builder…</LoadingState>
      </section>
    );
  }

  const documentLabel = docKind === "quotation" ? "Quotation / Devis" : "Invoice / Facture";

  return (
    <section className="ui-invoice-builder">
      <div className="ui-invoice-builder__toolbar no-print">
        <Breadcrumbs items={[{ label: "Invoices", href: base }, { label: "New" }]} />
        <PageHeader
          eyebrow="Billing"
          title={docKind === "quotation" ? "New quotation" : "New invoice"}
          description="Choose the client and lines, then preview the printable document when you need it."
          actions={
            <div className="ui-row">
              <button type="button" className="ui-btn ui-btn--secondary" onClick={() => setPreviewOpen(true)}>
                Preview document
              </button>
              <Link href={base} className="ui-btn ui-btn--secondary">
                Cancel
              </Link>
              <Button type="submit" form="invoice-create-form" disabled={saving || clients.length === 0}>
                {saving ? "Saving…" : "Save draft"}
              </Button>
            </div>
          }
        />
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>

      <div className="ui-invoice-builder__grid">
        <form id="invoice-create-form" className="ui-invoice-builder__form no-print" onSubmit={(e) => void saveDraft(e)}>
          <div className="ui-invoice-builder__panel">
            <div className="ui-invoice-builder__meta">
              <div className="ui-invoice-builder__field">
                <span className="ui-invoice-builder__label">Type</span>
                <div className="ui-invoice-builder__seg" role="group" aria-label="Document type">
                  <button
                    type="button"
                    className={docKind === "quotation" ? "is-active" : ""}
                    onClick={() => setDocKind("quotation")}
                  >
                    Quotation
                  </button>
                  <button
                    type="button"
                    className={docKind === "invoice" ? "is-active" : ""}
                    onClick={() => setDocKind("invoice")}
                  >
                    Invoice
                  </button>
                </div>
              </div>
              <div className="ui-invoice-builder__field">
                <span className="ui-invoice-builder__label">Client</span>
                <SearchableSelect
                  value={clientId}
                  onChange={setClientId}
                  options={clientOptions}
                  placeholder="Select a client"
                  searchPlaceholder="Search clients"
                  emptyLabel="No clients match"
                  disabled={clients.length === 0 && !clientId}
                  aria-label="Client"
                />
              </div>
            </div>

            <div className="ui-invoice-builder__section">
              <div className="ui-invoice-builder__section-head">
                <h2>Line items</h2>
                <button
                  type="button"
                  className="ui-invoice-builder__text-btn"
                  onClick={() =>
                    setLines((prev) => [...prev, newLine({ description: "", quantity: "1", unitPrice: "0" })])
                  }
                >
                  Add line
                </button>
              </div>
              <div className="ui-invoice-builder__table">
                <div className="ui-invoice-builder__thead">
                  <span>Description</span>
                  <span>Qty</span>
                  <span>Price</span>
                  <span>Amount</span>
                  <span className="ui-sr-only">Remove</span>
                </div>
                {lines.map((line) => {
                  const amount = computeLinePreview(Number(line.quantity), Number(line.unitPrice)).lineTotal;
                  return (
                    <div key={line.key} className="ui-invoice-builder__row">
                      <Input
                        value={line.description}
                        onChange={(event) => updateLine(line.key, { description: event.target.value })}
                        placeholder="Service or package"
                        aria-label="Description"
                        required
                      />
                      <Input
                        type="number"
                        min="0.0001"
                        step="any"
                        value={line.quantity}
                        onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                        aria-label="Quantity"
                        required
                      />
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={line.unitPrice}
                        onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })}
                        aria-label="Unit price"
                        required
                      />
                      <p className="ui-invoice-builder__amount">{formatMoney(amount, currency)}</p>
                      <button
                        type="button"
                        className="ui-invoice-builder__remove"
                        disabled={lines.length <= 1}
                        onClick={() => removeLine(line.key)}
                        aria-label="Remove line"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="ui-invoice-builder__extras">
              <div className="ui-invoice-builder__field">
                <span className="ui-invoice-builder__label">Notes</span>
                <Textarea
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Payment terms, bank details…"
                />
              </div>
              <div className="ui-invoice-builder__adjust">
                <div className="ui-invoice-builder__field">
                  <span className="ui-invoice-builder__label">Discount</span>
                  <div className="ui-invoice-builder__seg" role="group" aria-label="Discount type">
                    <button
                      type="button"
                      className={discountType === "" ? "is-active" : ""}
                      onClick={() => {
                        setDiscountType("");
                        setDiscountValue("");
                      }}
                    >
                      None
                    </button>
                    <button
                      type="button"
                      className={discountType === "PERCENT" ? "is-active" : ""}
                      onClick={() => setDiscountType("PERCENT")}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      className={discountType === "FIXED" ? "is-active" : ""}
                      onClick={() => setDiscountType("FIXED")}
                    >
                      Amount
                    </button>
                  </div>
                  {discountType ? (
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={discountValue}
                      onChange={(event) => setDiscountValue(event.target.value)}
                      placeholder={discountType === "PERCENT" ? "Percent" : "Amount"}
                      aria-label="Discount value"
                    />
                  ) : null}
                </div>
                <div className="ui-invoice-builder__field">
                  <span className="ui-invoice-builder__label">Tax %</span>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={taxRatePercent}
                    onChange={(event) => setTaxRatePercent(event.target.value)}
                    aria-label="Tax percent"
                  />
                </div>
                <dl className="ui-invoice-builder__summary">
                  <div>
                    <dt>Subtotal</dt>
                    <dd>{formatMoney(totals.subtotal, currency)}</dd>
                  </div>
                  {totals.discountAmount > 0 ? (
                    <div>
                      <dt>Discount</dt>
                      <dd>−{formatMoney(totals.discountAmount, currency)}</dd>
                    </div>
                  ) : null}
                  {Number(taxRatePercent) > 0 ? (
                    <div>
                      <dt>Tax</dt>
                      <dd>{formatMoney(totals.taxAmount, currency)}</dd>
                    </div>
                  ) : null}
                  <div className="is-total">
                    <dt>Total</dt>
                    <dd>{formatMoney(totals.total, currency)}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </form>
      </div>

      {previewOpen ? (
        <div
          className="ui-invoice-preview"
          role="dialog"
          aria-modal="true"
          aria-label={documentLabel}
        >
          <div
            className="ui-invoice-preview__stage"
            onClick={(event) => {
              if (event.target === event.currentTarget) setPreviewOpen(false);
            }}
          >
            <div className="ui-invoice-preview__popup">
              <button
                type="button"
                className="ui-invoice-preview__close"
                onClick={() => setPreviewOpen(false)}
                aria-label="Close preview"
              >
                ×
              </button>
              <InvoiceDocument
                practice={{
                  practiceName: practice?.practiceName ?? "Your clinic",
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
                  documentNumber: "DRAFT",
                  clientName: selectedClient ? clientDisplayName(selectedClient) : "Select a client",
                  issueDate: localDateKey(),
                  dueDate: null,
                  currency,
                  subtotal: totals.subtotal,
                  discountType: discountType || null,
                  discountValue: discountType ? Number(discountValue || 0) : null,
                  discountAmount: totals.discountAmount,
                  taxRatePercent: Number(taxRatePercent || 0),
                  taxAmount: totals.taxAmount,
                  total: totals.total,
                  notes: notes || null,
                  items: previewItems,
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
