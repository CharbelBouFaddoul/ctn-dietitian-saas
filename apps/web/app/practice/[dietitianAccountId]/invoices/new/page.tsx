"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Alert,
  Breadcrumbs,
  Button,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Select,
  Textarea,
} from "@nutrition-saas/ui";
import {
  InvoiceDocument,
  computeInvoicePreview,
  computeLinePreview,
} from "../../../../../components/invoice-document";
import { api } from "../../../../../lib/api";
import { errorMessage } from "../../../../../lib/humanize-error";
import { localDateKey } from "../../../../../lib/local-date";

interface ClientRow {
  id: string;
  firstName: string;
  lastName: string;
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
        if (clientList.items[0]) setClientId(clientList.items[0].id);
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

  const selectedClient = clients.find((c) => c.id === clientId);
  const currency = practice?.currency ?? "USD";

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
        <Breadcrumbs items={[{ label: "Invoices", href: base }, { label: "New document" }]} />
        <PageHeader
          eyebrow="Billing"
          title="New invoice"
          description="Fill in the details on the left. The paper preview on the right is what you can print or save as PDF after saving."
          actions={
            <div className="ui-row">
              <Link href={base} className="ui-btn ui-btn--secondary">
                Cancel
              </Link>
              <Button type="submit" form="invoice-create-form" disabled={saving}>
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
            <h2 className="ui-invoice-builder__panel-title">Document</h2>
            <div className="ui-invoice-builder__fields">
              <Field label="Document type">
                <Select
                  value={docKind}
                  onChange={(e) => setDocKind(e.target.value as "quotation" | "invoice")}
                >
                  <option value="quotation">Quotation (draft)</option>
                  <option value="invoice">Invoice (draft)</option>
                </Select>
              </Field>
              <Field label="Client">
                <Select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                  {clients.length === 0 ? <option value="">No clients yet</option> : null}
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.firstName} {client.lastName}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>

          <div className="ui-invoice-builder__panel">
            <div className="ui-invoice-builder__panel-head">
              <h2 className="ui-invoice-builder__panel-title">Line items</h2>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setLines((prev) => [...prev, newLine({ description: "", quantity: "1", unitPrice: "0" })])}
              >
                Add line
              </Button>
            </div>
            <div className="ui-invoice-builder__lines">
              {lines.map((line) => (
                <div key={line.key} className="ui-invoice-builder__line">
                  <Field label="Description">
                    <Input
                      value={line.description}
                      onChange={(e) => updateLine(line.key, { description: e.target.value })}
                      placeholder="Service or package"
                      required
                    />
                  </Field>
                  <Field label="Qty">
                    <Input
                      type="number"
                      min="0.0001"
                      step="any"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                      required
                    />
                  </Field>
                  <Field label="Unit price">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                      required
                    />
                  </Field>
                  <div className="ui-invoice-builder__line-actions">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={lines.length <= 1}
                      onClick={() => removeLine(line.key)}
                      aria-label="Remove line"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="ui-invoice-builder__panel">
            <h2 className="ui-invoice-builder__panel-title">Totals</h2>
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
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Bank details, payment terms, thank-you note…"
              />
            </Field>
          </div>

          <div className="ui-invoice-builder__sticky-actions">
            <p className="ui-muted" style={{ margin: 0, fontSize: 13 }}>
              Preview total: <strong>{totals.total.toFixed(2)} {currency}</strong>
            </p>
            <Button type="submit" disabled={saving || clients.length === 0}>
              {saving ? "Saving…" : "Save draft & open document"}
            </Button>
          </div>
        </form>

        <div className="ui-invoice-builder__preview">
          <div className="ui-invoice-builder__preview-head no-print">
            <h2>Paper preview</h2>
            <p className="ui-muted">Printable A4-style document. Save the draft, then use Print / Download PDF.</p>
          </div>
          <div className="ui-facture-stage">
            <InvoiceDocument
              practice={{
                practiceName: practice?.practiceName ?? "Your practice",
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
                clientName: selectedClient
                  ? `${selectedClient.firstName} ${selectedClient.lastName}`
                  : "Select a client",
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
    </section>
  );
}
