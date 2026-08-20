"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
import { humanizeLabel } from "@nutrition-saas/ui";
interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  status: string;
  clientId: string;
  clientName?: string;
  issueDate: string | null;
  dueDate: string | null;
  total: number;
  currency: string;
}

interface ListResponse {
  items: InvoiceRow[];
  total: number;
}

interface ClientRow {
  id: string;
  firstName: string;
  lastName: string;
}

const STATUSES = ["", "DRAFT", "ISSUED", "SENT", "PAID", "OVERDUE", "CANCELLED"];

export default function InvoicesPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const [data, setData] = useState<ListResponse | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [filterClientId, setFilterClientId] = useState("");
  const [createClientId, setCreateClientId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [description, setDescription] = useState("Nutrition consultation");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("100");
  const [error, setError] = useState<string | null>(null);

  const subtotal = useMemo(() => Number(quantity || 0) * Number(unitPrice || 0), [quantity, unitPrice]);

  async function load() {
    const query = new URLSearchParams();
    if (filterClientId) query.set("clientId", filterClientId);
    if (status) query.set("status", status);
    if (search) query.set("search", search);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const [invoices, clientList] = await Promise.all([
      api<ListResponse>(`/api/v1/organizations/${organizationId}/invoices${suffix}`),
      api<{ items: ClientRow[] }>(`/api/v1/organizations/${organizationId}/clients?pageSize=100`),
    ]);
    setData(invoices);
    setClients(clientList.items);
    if (!createClientId && clientList.items[0]) setCreateClientId(clientList.items[0].id);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Unable to load invoices"));
  }, [organizationId, filterClientId, status, search]);

  async function createDraft(event: FormEvent) {
    event.preventDefault();
    const created = await api<{ id: string }>(`/api/v1/organizations/${organizationId}/invoices`, {
      method: "POST",
      body: JSON.stringify({
        clientId: createClientId,
        items: [{ description, quantity: Number(quantity), unitPrice: Number(unitPrice) }],
      }),
    });
    window.location.href = `/orgs/${organizationId}/invoices/${created.id}`;
  }

  return (
    <section>
      <h1>Invoices</h1>
      <p style={{ color: "var(--color-muted)" }}>
        Create, issue, and track invoices. Payment is handled outside the platform.
      </p>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <label className="ui-field">
          Client filter
          <select className="ui-input" value={filterClientId} onChange={(event) => setFilterClientId(event.target.value)}>
            <option value="">All clients</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.firstName} {client.lastName}
              </option>
            ))}
          </select>
        </label>
        <label className="ui-field">
          Status
          <select className="ui-input" value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUSES.map((value) => (
              <option key={value || "all"} value={value}>
                {value ? humanizeLabel(value) : "All"}
              </option>
            ))}
          </select>
        </label>
        <label className="ui-field">
          Search
          <input className="ui-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Invoice # or client" />
        </label>
      </div>

      <h2>Quick draft</h2>
      <form
        onSubmit={(event) => void createDraft(event).catch((err) => setError(err instanceof Error ? err.message : "Create failed"))}
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, alignItems: "end" }}
      >
        <label className="ui-field">
          Client
          <select className="ui-input" value={createClientId} onChange={(event) => setCreateClientId(event.target.value)} required>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.firstName} {client.lastName}
              </option>
            ))}
          </select>
        </label>
        <label className="ui-field">
          Description
          <input className="ui-input" value={description} onChange={(event) => setDescription(event.target.value)} required />
        </label>
        <label className="ui-field">
          Qty
          <input className="ui-input" type="number" min="0.0001" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
        </label>
        <label className="ui-field">
          Unit price
          <input className="ui-input" type="number" min="0" step="0.01" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} required />
        </label>
        <div className="ui-field">
          <span>Subtotal</span>
          <strong>{subtotal.toFixed(2)}</strong>
        </div>
        <button type="submit" className="ui-btn ui-btn--primary" style={{height: 38}}>
          Save draft
        </button>
      </form>

      <table className="ui-table">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Client</th>
            <th>Status</th>
            <th>Due</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((row) => (
            <tr key={row.id}>
              <td>
                <Link href={`/orgs/${organizationId}/invoices/${row.id}`} style={{ color: "var(--color-accent)" }}>
                  {row.invoiceNumber ?? "Draft"}
                </Link>
              </td>
              <td>{row.clientName ?? row.clientId}</td>
              <td>{row.status}</td>
              <td>{row.dueDate ?? "—"}</td>
              <td>
                {row.total.toFixed(2)} {row.currency}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: "var(--color-muted)", marginTop: 8 }}>{data?.total ?? 0} invoice(s)</p>
    </section>
  );
}
