"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  FilterBar,
  PageHeader,
  SearchInput,
  Select,
  StatusBadge,
  Table,
  Td,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { statusLabel } from "../../../../lib/practice-labels";
import { errorMessage } from "../../../../lib/humanize-error";
import { formatDateOnly, formatMoney } from "../../../../lib/format";

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
  const params = useParams<{ dietitianAccountId: string }>();
  const dietitianAccountId = params.dietitianAccountId;
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
  const [createBusy, setCreateBusy] = useState(false);

  const subtotal = useMemo(
    () => Number(quantity || 0) * Number(unitPrice || 0),
    [quantity, unitPrice],
  );

  async function load() {
    const query = new URLSearchParams();
    if (filterClientId) query.set("clientId", filterClientId);
    if (status) query.set("status", status);
    if (search) query.set("search", search);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const [invoices, clientList] = await Promise.all([
      api<ListResponse>(`/api/v1/dietitian/${dietitianAccountId}/invoices${suffix}`),
      api<{ items: ClientRow[] }>(`/api/v1/dietitian/${dietitianAccountId}/clients?pageSize=50`),
    ]);
    setData(invoices);
    setClients(clientList.items);
    if (!createClientId && clientList.items[0]) setCreateClientId(clientList.items[0].id);
  }

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load invoices")));
  }, [dietitianAccountId, filterClientId, status, search]);

  async function createDraft(event: FormEvent) {
    event.preventDefault();
    setCreateBusy(true);
    setError(null);
    try {
      const created = await api<{ id: string }>(`/api/v1/dietitian/${dietitianAccountId}/invoices`, {
        method: "POST",
        body: JSON.stringify({
          clientId: createClientId,
          items: [{ description, quantity: Number(quantity), unitPrice: Number(unitPrice) }],
        }),
      });
      window.location.href = `/practice/${dietitianAccountId}/invoices/${created.id}`;
    } catch (err) {
      setError(errorMessage(err, "Could not create invoice"));
      setCreateBusy(false);
    }
  }

  const hasFilters = Boolean(filterClientId || status || search);

  return (
    <section>
      <PageHeader
        title="Invoices"
        description="Create, issue, and track invoices. Payment is handled outside the platform."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div style={{ marginBottom: 20 }}>
        <FilterBar>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Invoice # or client…"
            aria-label="Search invoices"
          />
          <Select
            value={filterClientId}
            onChange={(e) => setFilterClientId(e.target.value)}
          >
            <option value="">All clients</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.firstName} {client.lastName}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((value) => (
              <option key={value || "all"} value={value}>
                {value ? humanizeLabel(value) : "All statuses"}
              </option>
            ))}
          </Select>
        </FilterBar>
      </div>

      <Card title="New draft invoice">
        <form onSubmit={(event) => void createDraft(event)} className="ui-inline-form">
          <label className="ui-field">
            Client
            <select
              className="ui-input"
              value={createClientId}
              onChange={(e) => setCreateClientId(e.target.value)}
              required
            >
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.firstName} {client.lastName}
                </option>
              ))}
            </select>
          </label>
          <label className="ui-field">
            Description
            <input
              className="ui-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </label>
          <label className="ui-field" style={{ flex: "0 1 7rem", minWidth: "6rem" }}>
            Qty
            <input
              className="ui-input"
              type="number"
              min="0.0001"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </label>
          <label className="ui-field" style={{ flex: "0 1 8rem", minWidth: "7rem" }}>
            Unit price
            <input
              className="ui-input"
              type="number"
              min="0"
              step="0.01"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              required
            />
          </label>
          <div className="ui-field" style={{ flex: "0 1 7rem", minWidth: "6rem" }}>
            <span>Subtotal</span>
            <strong style={{ lineHeight: "2.25rem" }}>{subtotal.toFixed(2)}</strong>
          </div>
          <div className="ui-inline-form__action">
            <Button type="submit" disabled={createBusy}>
              {createBusy ? "Saving…" : "Save draft"}
            </Button>
          </div>
        </form>
      </Card>

      {(data?.items ?? []).length === 0 ? (
        <EmptyState title={hasFilters ? "No invoices match" : "No invoices yet"}>
          {hasFilters
            ? "Try adjusting your filters."
            : "Use the form above to create a draft invoice."}
        </EmptyState>
      ) : (
        <>
          <Table>
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
              {(data?.items ?? []).map((row) => (
                <tr key={row.id}>
                  <Td label="Invoice">
                    <Link
                      href={`/practice/${dietitianAccountId}/invoices/${row.id}`}
                      className="ui-link"
                      style={{ fontWeight: 500 }}
                    >
                      {row.invoiceNumber ?? "Draft"}
                    </Link>
                  </Td>
                  <Td label="Client">{row.clientName ?? "Client"}</Td>
                  <Td label="Status">
                    <StatusBadge status={row.status} label={statusLabel(row.status)} />
                  </Td>
                  <Td label="Due">
                    <span className="ui-muted">{formatDateOnly(row.dueDate)}</span>
                  </Td>
                  <Td label="Total">
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatMoney(row.total, row.currency)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="ui-muted" style={{ marginTop: 10, fontSize: "0.875rem" }}>
            {data?.total ?? 0} invoice{(data?.total ?? 1) !== 1 ? "s" : ""}
          </p>
        </>
      )}
    </section>
  );
}
