"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
import { buttonStyle, cellStyle, fieldStyle, inputStyle, tableStyle } from "../practice-shell";

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
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [description, setDescription] = useState("Nutrition consultation");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("100");
  const [error, setError] = useState<string | null>(null);

  const subtotal = useMemo(() => Number(quantity || 0) * Number(unitPrice || 0), [quantity, unitPrice]);

  async function load() {
    const query = new URLSearchParams();
    if (clientId) query.set("clientId", clientId);
    if (status) query.set("status", status);
    if (search) query.set("search", search);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const [invoices, clientList] = await Promise.all([
      api<ListResponse>(`/api/v1/organizations/${organizationId}/invoices${suffix}`),
      api<{ items: ClientRow[] }>(`/api/v1/organizations/${organizationId}/clients?pageSize=100`),
    ]);
    setData(invoices);
    setClients(clientList.items);
    if (!clientId && clientList.items[0]) setClientId(clientList.items[0].id);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Unable to load invoices"));
  }, [organizationId, clientId, status, search]);

  async function createDraft(event: FormEvent) {
    event.preventDefault();
    const created = await api<{ id: string }>(`/api/v1/organizations/${organizationId}/invoices`, {
      method: "POST",
      body: JSON.stringify({
        clientId,
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
        <label style={fieldStyle}>
          Client filter
          <select style={inputStyle} value={clientId} onChange={(event) => setClientId(event.target.value)}>
            <option value="">All clients</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.firstName} {client.lastName}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          Status
          <select style={inputStyle} value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUSES.map((value) => (
              <option key={value || "all"} value={value}>
                {value || "All"}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          Search
          <input style={inputStyle} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Invoice # or client" />
        </label>
      </div>

      <h2>Quick draft</h2>
      <form
        onSubmit={(event) => void createDraft(event).catch((err) => setError(err instanceof Error ? err.message : "Create failed"))}
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, alignItems: "end" }}
      >
        <label style={fieldStyle}>
          Client
          <select style={inputStyle} value={clientId} onChange={(event) => setClientId(event.target.value)} required>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.firstName} {client.lastName}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          Description
          <input style={inputStyle} value={description} onChange={(event) => setDescription(event.target.value)} required />
        </label>
        <label style={fieldStyle}>
          Qty
          <input style={inputStyle} type="number" min="0.0001" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
        </label>
        <label style={fieldStyle}>
          Unit price
          <input style={inputStyle} type="number" min="0" step="0.01" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} required />
        </label>
        <div style={fieldStyle}>
          <span>Subtotal</span>
          <strong>{subtotal.toFixed(2)}</strong>
        </div>
        <button type="submit" style={{ ...buttonStyle, height: 38 }}>
          Save draft
        </button>
      </form>

      <table style={{ ...tableStyle, marginTop: 20 }}>
        <thead>
          <tr>
            <th style={cellStyle}>Invoice</th>
            <th style={cellStyle}>Client</th>
            <th style={cellStyle}>Status</th>
            <th style={cellStyle}>Due</th>
            <th style={cellStyle}>Total</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((row) => (
            <tr key={row.id}>
              <td style={cellStyle}>
                <Link href={`/orgs/${organizationId}/invoices/${row.id}`} style={{ color: "var(--color-accent)" }}>
                  {row.invoiceNumber ?? "Draft"}
                </Link>
              </td>
              <td style={cellStyle}>{row.clientName ?? row.clientId}</td>
              <td style={cellStyle}>{row.status}</td>
              <td style={cellStyle}>{row.dueDate ?? "—"}</td>
              <td style={cellStyle}>
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
