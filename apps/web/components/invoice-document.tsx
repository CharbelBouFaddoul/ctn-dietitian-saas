import { Table, Td } from "@nutrition-saas/ui";
import { formatDateOnly, formatMoney } from "../lib/format";

export interface InvoiceDocumentItem {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface InvoiceDocumentPractice {
  practiceName: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
  invoiceFooter?: string | null;
}

export interface InvoiceDocumentData {
  documentLabel: string;
  documentNumber: string;
  statusLabel?: string;
  clientName: string;
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  subtotal: number;
  discountType?: "PERCENT" | "FIXED" | null;
  discountValue?: number | null;
  discountAmount: number;
  taxRatePercent: number;
  taxAmount: number;
  total: number;
  notes?: string | null;
  items: InvoiceDocumentItem[];
}

export function InvoiceDocument({
  practice,
  invoice,
  className,
}: {
  practice: InvoiceDocumentPractice;
  invoice: InvoiceDocumentData;
  className?: string;
}) {
  const address = [
    practice.addressLine1,
    practice.addressLine2,
    [practice.city, practice.region, practice.postalCode].filter(Boolean).join(" "),
    practice.country,
  ]
    .filter(Boolean)
    .join(" · ");

  const contact = [practice.contactEmail, practice.contactPhone].filter(Boolean).join(" · ");

  return (
    <article className={["ui-facture", "ui-facture--paper", className].filter(Boolean).join(" ")} id="print-invoice">
      <header className="ui-facture__header">
        <div>
          <h1 className="ui-facture__brand">{practice.practiceName || "Clinic"}</h1>
          {address ? <p className="ui-facture__meta">{address}</p> : null}
          {contact ? <p className="ui-facture__meta">{contact}</p> : null}
        </div>
        <div className="ui-facture__title-block">
          <p className="ui-facture__eyebrow">{invoice.documentLabel}</p>
          <h2 className="ui-facture__number">{invoice.documentNumber}</h2>
          {invoice.statusLabel ? <p className="ui-facture__meta">Status: {invoice.statusLabel}</p> : null}
        </div>
      </header>

      <div className="ui-facture__parties">
        <div>
          <p className="ui-facture__label">Bill to</p>
          <p className="ui-facture__party">{invoice.clientName || "Client"}</p>
        </div>
        <div>
          <p className="ui-facture__label">Issue date</p>
          <p>{formatDateOnly(invoice.issueDate) || "—"}</p>
          <p className="ui-facture__label" style={{ marginTop: 8 }}>
            Due date
          </p>
          <p>{formatDateOnly(invoice.dueDate) || "—"}</p>
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
          {invoice.items.length === 0 ? (
            <tr>
              <td colSpan={4} className="ui-muted" style={{ padding: "12px 0" }}>
                Add line items to build this document.
              </td>
            </tr>
          ) : (
            invoice.items.map((item, idx) => (
              <tr key={`${item.description}-${idx}`}>
                <Td label="Description">{item.description || "—"}</Td>
                <Td label="Qty">{item.quantity}</Td>
                <Td label="Unit price">{formatMoney(item.unitPrice, invoice.currency)}</Td>
                <Td label="Line total">
                  <strong>{formatMoney(item.lineTotal, invoice.currency)}</strong>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <div className="ui-facture__totals">
        <div className="ui-facture__totals-row">
          <span>Subtotal</span>
          <strong>{formatMoney(invoice.subtotal, invoice.currency)}</strong>
        </div>
        {invoice.discountAmount > 0 ? (
          <div className="ui-facture__totals-row">
            <span>
              Discount
              {invoice.discountType === "PERCENT" && invoice.discountValue != null
                ? ` (${invoice.discountValue}%)`
                : ""}
            </span>
            <strong>−{formatMoney(invoice.discountAmount, invoice.currency)}</strong>
          </div>
        ) : null}
        {invoice.taxAmount > 0 || invoice.taxRatePercent > 0 ? (
          <div className="ui-facture__totals-row">
            <span>Tax ({invoice.taxRatePercent}%)</span>
            <strong>{formatMoney(invoice.taxAmount, invoice.currency)}</strong>
          </div>
        ) : null}
        <div className="ui-facture__totals-row ui-facture__totals-row--grand">
          <span>Total</span>
          <strong>{formatMoney(invoice.total, invoice.currency)}</strong>
        </div>
      </div>

      {invoice.notes ? (
        <div className="ui-facture__notes">
          <p className="ui-facture__label">Notes / payment details</p>
          <p>{invoice.notes}</p>
        </div>
      ) : null}

      {practice.invoiceFooter ? <p className="ui-facture__footer">{practice.invoiceFooter}</p> : null}
    </article>
  );
}

export function computeLinePreview(quantity: number, unitPrice: number) {
  const q = Number.isFinite(quantity) ? quantity : 0;
  const p = Number.isFinite(unitPrice) ? unitPrice : 0;
  const lineTotal = Math.round(q * p * 100) / 100;
  return { quantity: q, unitPrice: p, lineTotal };
}

export function computeInvoicePreview(input: {
  items: Array<{ quantity: number; unitPrice: number }>;
  discountType: "" | "PERCENT" | "FIXED";
  discountValue: number;
  taxRatePercent: number;
}) {
  const subtotal = input.items.reduce((sum, item) => {
    return sum + computeLinePreview(item.quantity, item.unitPrice).lineTotal;
  }, 0);
  let discountAmount = 0;
  const dVal = Number.isFinite(input.discountValue) ? input.discountValue : 0;
  if (input.discountType === "PERCENT" && dVal > 0) discountAmount = (subtotal * dVal) / 100;
  if (input.discountType === "FIXED" && dVal > 0) discountAmount = dVal;
  if (discountAmount > subtotal) discountAmount = subtotal;
  discountAmount = Math.round(discountAmount * 100) / 100;
  const taxable = subtotal - discountAmount;
  const taxAmount = Math.round(((taxable * (input.taxRatePercent || 0)) / 100) * 100) / 100;
  const total = Math.round((taxable + taxAmount) * 100) / 100;
  return { subtotal, discountAmount, taxAmount, total };
}
