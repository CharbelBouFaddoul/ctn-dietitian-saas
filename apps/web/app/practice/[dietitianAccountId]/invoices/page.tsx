"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Alert,
  EmptyState,
  FilterBar,
  LoadingState,
  PageHeader,
  SearchInput,
  Section,
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
  const base = `/practice/${dietitianAccountId}/invoices`;
  const [data, setData] = useState<ListResponse | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [filterClientId, setFilterClientId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams();
        if (filterClientId) query.set("clientId", filterClientId);
        if (status) query.set("status", status);
        if (search) query.set("search", search);
        const suffix = query.toString() ? `?${query.toString()}` : "";
        const [invoices, clientList] = await Promise.all([
          api<ListResponse>(`/api/v1/dietitian/${dietitianAccountId}/invoices${suffix}`),
          api<{ items: ClientRow[] }>(`/api/v1/dietitian/${dietitianAccountId}/clients?pageSize=50`),
        ]);
        if (cancelled) return;
        setData(invoices);
        setClients(clientList.items);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, "Unable to load invoices"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [dietitianAccountId, filterClientId, status, search]);

  const hasFilters = Boolean(filterClientId || status || search);
  const items = data?.items ?? [];

  return (
    <section className="ui-invoice-list">
      <PageHeader
        eyebrow="Billing"
        title="Invoices"
        description="Track drafts, quotations, and issued invoices. Clients only see invoices after you send them."
        actions={
          <Link href={`${base}/new`} className="ui-btn ui-btn--primary">
            New invoice
          </Link>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Section
        title="Find invoices"
        description="Search by invoice number or client, then narrow by status."
        tone="muted"
      >
        <FilterBar className="ui-invoice-list__filters">
          <div className="ui-filter-bar__field ui-filter-bar__field--grow">
            <p className="ui-filter-bar__label">Search</p>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Invoice # or client…"
              aria-label="Search invoices"
            />
          </div>
          <div className="ui-filter-bar__field">
            <p className="ui-filter-bar__label">Client</p>
            <Select
              value={filterClientId}
              onChange={(e) => setFilterClientId(e.target.value)}
              aria-label="Filter by client"
              className="ui-invoice-list__filter-select"
            >
              <option value="">All clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.firstName} {client.lastName}
                </option>
              ))}
            </Select>
          </div>
          <div className="ui-filter-bar__field">
            <p className="ui-filter-bar__label">Status</p>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Filter by status"
              className="ui-invoice-list__filter-select"
            >
              {STATUSES.map((value) => (
                <option key={value || "all"} value={value}>
                  {value ? humanizeLabel(value) : "All statuses"}
                </option>
              ))}
            </Select>
          </div>
          {hasFilters ? (
            <div className="ui-filter-bar__actions">
              <button
                type="button"
                className="ui-filter-bar__clear"
                onClick={() => {
                  setSearch("");
                  setFilterClientId("");
                  setStatus("");
                }}
              >
                Clear filters
              </button>
            </div>
          ) : null}
        </FilterBar>
      </Section>

      <Section
        title="All invoices"
        description={
          data
            ? `${data.total} invoice${data.total !== 1 ? "s" : ""}${hasFilters ? " matching filters" : ""}`
            : "Loading…"
        }
        actions={
          <Link href={`${base}/new`} className="ui-link" style={{ fontWeight: 500 }}>
            Create invoice
          </Link>
        }
      >
        {loading && !data ? <LoadingState>Loading invoices…</LoadingState> : null}

        {!loading && items.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No invoices match" : "No invoices yet"}
            action={
              !hasFilters ? (
                <Link href={`${base}/new`} className="ui-btn ui-btn--primary">
                  Create your first invoice
                </Link>
              ) : undefined
            }
          >
            {hasFilters
              ? "Try clearing search or changing filters."
              : "Build a quotation or invoice as a printable document, then issue and send it to your client."}
          </EmptyState>
        ) : null}

        {items.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <th>Document</th>
                <th>Client</th>
                <th>Status</th>
                <th>Issue date</th>
                <th>Due</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <Td label="Document">
                    <Link href={`${base}/${row.id}`} className="ui-link" style={{ fontWeight: 600 }}>
                      {row.invoiceNumber ?? (row.status === "DRAFT" ? "Draft quotation" : "Invoice")}
                    </Link>
                  </Td>
                  <Td label="Client">{row.clientName ?? "Client"}</Td>
                  <Td label="Status">
                    <StatusBadge status={row.status} label={statusLabel(row.status)} />
                  </Td>
                  <Td label="Issue date">
                    <span className="ui-muted">{formatDateOnly(row.issueDate) || "—"}</span>
                  </Td>
                  <Td label="Due">
                    <span className="ui-muted">{formatDateOnly(row.dueDate) || "—"}</span>
                  </Td>
                  <Td label="Total">
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                      {formatMoney(row.total, row.currency)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Section>
    </section>
  );
}
