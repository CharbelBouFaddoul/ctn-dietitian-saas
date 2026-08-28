"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "@nutrition-saas/ui";
import { FilterPopover, ListFilters, LIST_SEARCH_DEBOUNCE_MS } from "../../../../components/list-filters";
import { api } from "../../../../lib/api";
import { clientDisplayName } from "../../../../lib/client-identity";
import { addLocalDays, localDateKey } from "../../../../lib/local-date";
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
  page: number;
  limit: number;
}

interface ClientRow {
  id: string;
  firstName: string;
  lastName: string;
  displayName?: string | null;
}

const PAGE_SIZE = 50;

const STATUS_CHIPS = [
  { value: "", label: "All" },
  { value: "DRAFT", label: "Draft" },
  { value: "ISSUED", label: "Issued" },
  { value: "SENT", label: "Sent" },
  { value: "PAID", label: "Paid" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

const DATE_PRESETS = [
  { id: "30d", label: "Last 30 days" },
  { id: "month", label: "This month" },
  { id: "year", label: "This year" },
] as const;

type DatePreset = (typeof DATE_PRESETS)[number]["id"] | "";

function monthStart(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

function yearStart(key: string): string {
  return `${key.slice(0, 4)}-01-01`;
}

function presetRange(id: Exclude<DatePreset, "">): { from: string; to: string } {
  const today = localDateKey();
  if (id === "30d") return { from: addLocalDays(today, -29), to: today };
  if (id === "month") return { from: monthStart(today), to: today };
  return { from: yearStart(today), to: today };
}

function activePreset(issuedFrom: string, issuedTo: string): DatePreset {
  if (!issuedFrom || !issuedTo) return "";
  const today = localDateKey();
  if (issuedTo !== today) return "";
  if (issuedFrom === addLocalDays(today, -29)) return "30d";
  if (issuedFrom === monthStart(today)) return "month";
  if (issuedFrom === yearStart(today)) return "year";
  return "";
}

function invoiceTitle(row: InvoiceRow): string {
  return row.invoiceNumber ?? (row.status === "DRAFT" ? "Draft quotation" : "Invoice");
}

function issuedSummary(issuedFrom: string, issuedTo: string, preset: DatePreset): string {
  if (preset === "30d") return "Last 30 days";
  if (preset === "month") return "This month";
  if (preset === "year") return "This year";
  if (issuedFrom && issuedTo) return `${formatDateOnly(issuedFrom)} – ${formatDateOnly(issuedTo)}`;
  if (issuedFrom) return `From ${formatDateOnly(issuedFrom)}`;
  if (issuedTo) return `Until ${formatDateOnly(issuedTo)}`;
  return "Issued";
}

function IssuedRangeMenu({
  issuedFrom,
  issuedTo,
  currentPreset,
  onPreset,
  onFrom,
  onTo,
}: {
  issuedFrom: string;
  issuedTo: string;
  currentPreset: DatePreset;
  onPreset: (id: DatePreset) => void;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
}) {
  const active = Boolean(issuedFrom || issuedTo);
  return (
    <FilterPopover label="Issued date" value={issuedSummary(issuedFrom, issuedTo, currentPreset)} active={active}>
      {(close) => (
        <>
          <button
            type="button"
            className={`ui-list-filters__option${!active ? " is-active" : ""}`}
            onClick={() => {
              onPreset("");
              close();
            }}
          >
            Any time
          </button>
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`ui-list-filters__option${currentPreset === preset.id ? " is-active" : ""}`}
              onClick={() => {
                onPreset(preset.id);
                close();
              }}
            >
              {preset.label}
            </button>
          ))}
          <div className="ui-list-filters__custom">
            <label>
              From
              <Input
                type="date"
                value={issuedFrom}
                max={issuedTo || undefined}
                onChange={(event) => onFrom(event.target.value)}
                aria-label="Issued from"
              />
            </label>
            <label>
              To
              <Input
                type="date"
                value={issuedTo}
                min={issuedFrom || undefined}
                onChange={(event) => onTo(event.target.value)}
                aria-label="Issued to"
              />
            </label>
          </div>
        </>
      )}
    </FilterPopover>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={<LoadingState>Loading invoices…</LoadingState>}>
      <InvoicesPageInner />
    </Suspense>
  );
}

function InvoicesPageInner() {
  const params = useParams<{ dietitianAccountId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const dietitianAccountId = params.dietitianAccountId;
  const base = `/practice/${dietitianAccountId}/invoices`;

  const [data, setData] = useState<ListResponse | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [filterClientId, setFilterClientId] = useState(() => searchParams.get("clientId") ?? "");
  const [status, setStatus] = useState(() => searchParams.get("status") ?? "");
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [searchDraft, setSearchDraft] = useState(() => searchParams.get("search") ?? "");
  const [issuedFrom, setIssuedFrom] = useState(() => searchParams.get("issuedFrom") ?? "");
  const [issuedTo, setIssuedTo] = useState(() => searchParams.get("issuedTo") ?? "");
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get("page")) || 1));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const next = searchDraft.trim();
    if (next === search) return;
    const timer = window.setTimeout(() => {
      setSearch(next);
      setPage(1);
    }, LIST_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search, searchDraft]);

  useEffect(() => {
    const query = new URLSearchParams();
    if (filterClientId) query.set("clientId", filterClientId);
    if (status) query.set("status", status);
    if (search) query.set("search", search);
    if (issuedFrom) query.set("issuedFrom", issuedFrom);
    if (issuedTo) query.set("issuedTo", issuedTo);
    if (page > 1) query.set("page", String(page));
    const next = query.toString();
    if (next === searchParams.toString()) return;
    router.replace(`${base}${next ? `?${next}` : ""}`, { scroll: false });
  }, [base, filterClientId, status, search, issuedFrom, issuedTo, page, router, searchParams]);

  useEffect(() => {
    let cancelled = false;
    void api<{ items: ClientRow[] }>(`/api/v1/dietitian/${dietitianAccountId}/clients?pageSize=50`)
      .then((result) => {
        if (!cancelled) setClients(result.items);
      })
      .catch(() => {
        if (!cancelled) setClients([]);
      });
    return () => {
      cancelled = true;
    };
  }, [dietitianAccountId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams();
        query.set("limit", String(PAGE_SIZE));
        query.set("page", String(page));
        if (filterClientId) query.set("clientId", filterClientId);
        if (status) query.set("status", status);
        if (search) query.set("search", search);
        if (issuedFrom) query.set("issuedFrom", issuedFrom);
        if (issuedTo) query.set("issuedTo", issuedTo);
        const invoices = await api<ListResponse>(
          `/api/v1/dietitian/${dietitianAccountId}/invoices?${query.toString()}`,
        );
        if (cancelled) return;
        setData(invoices);
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
  }, [dietitianAccountId, filterClientId, status, search, issuedFrom, issuedTo, page]);

  const hasFilters = Boolean(filterClientId || status || search || issuedFrom || issuedTo);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedClient = clients.find((client) => client.id === filterClientId);
  const selectedClientName =
    selectedClient ? clientDisplayName(selectedClient) : items.find((row) => row.clientId === filterClientId)?.clientName;
  const currentPreset = activePreset(issuedFrom, issuedTo);
  const newInvoiceHref = filterClientId ? `${base}/new?clientId=${filterClientId}` : `${base}/new`;

  function clearFilters() {
    setSearchDraft("");
    setSearch("");
    setFilterClientId("");
    setStatus("");
    setIssuedFrom("");
    setIssuedTo("");
    setPage(1);
  }

  function applyPreset(id: DatePreset) {
    if (!id) {
      setIssuedFrom("");
      setIssuedTo("");
      setPage(1);
      return;
    }
    const range = presetRange(id);
    setIssuedFrom(range.from);
    setIssuedTo(range.to);
    setPage(1);
  }

  return (
    <section className="ui-invoice-list">
      <PageHeader
        eyebrow="Billing"
        title="Invoices"
        description="Track drafts, quotations, and issued invoices. Clients only see invoices after you send them."
        actions={
          <Link href={newInvoiceHref} className="ui-btn ui-btn--primary">
            New invoice
          </Link>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <ListFilters
        search={searchDraft}
        onSearchChange={setSearchDraft}
        searchPlaceholder="Search invoices"
        hasFilters={hasFilters}
        onClear={clearFilters}
        count={total}
        countNoun="invoice"
        loading={loading && !data}
      >
        <FilterPopover
          label="Filter by client"
          value={filterClientId ? selectedClientName ?? "Client" : "Client"}
          active={Boolean(filterClientId)}
          searchPlaceholder="Search clients"
          onSelect={(id) => {
            setFilterClientId(id);
            setPage(1);
          }}
          items={[
            { id: "", label: "All clients", active: !filterClientId },
            ...(filterClientId && !clients.some((client) => client.id === filterClientId)
              ? [{ id: filterClientId, label: selectedClientName ?? "Selected client", active: true }]
              : []),
            ...clients.map((client) => ({
              id: client.id,
              label: clientDisplayName(client),
              active: filterClientId === client.id,
            })),
          ]}
        />
        <FilterPopover
          label="Filter by status"
          value={status ? statusLabel(status) : "Status"}
          active={Boolean(status)}
          searchPlaceholder="Search status"
          onSelect={(id) => {
            setStatus(id);
            setPage(1);
          }}
          items={STATUS_CHIPS.map((chip) => ({
            id: chip.value,
            label: chip.value ? chip.label : "All statuses",
            active: status === chip.value,
          }))}
        />
        <IssuedRangeMenu
          issuedFrom={issuedFrom}
          issuedTo={issuedTo}
          currentPreset={currentPreset}
          onPreset={applyPreset}
          onFrom={(value) => {
            setIssuedFrom(value);
            setPage(1);
          }}
          onTo={(value) => {
            setIssuedTo(value);
            setPage(1);
          }}
        />
      </ListFilters>

      <div className="ui-invoice-results">
        {loading && !data ? <LoadingState>Loading invoices…</LoadingState> : null}

        {!loading && items.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No invoices match" : "No invoices yet"}
            action={
              !hasFilters ? (
                <Link href={newInvoiceHref} className="ui-btn ui-btn--primary">
                  Create your first invoice
                </Link>
              ) : (
                <button type="button" className="ui-btn ui-btn--secondary" onClick={clearFilters}>
                  Clear filters
                </button>
              )
            }
          >
            {hasFilters
              ? "Try a different status, date range, or search."
              : "Build a quotation or invoice as a printable document, then issue and send it to your client."}
          </EmptyState>
        ) : null}

        {items.length > 0 ? (
          <ul className="ui-invoice-cards">
            {items.map((row) => {
              const issued = row.issueDate ? `Issued ${formatDateOnly(row.issueDate)}` : "Not issued";
              const due = row.dueDate ? `Due ${formatDateOnly(row.dueDate)}` : null;
              return (
                <li key={row.id}>
                  <Link
                    href={`${base}/${row.id}`}
                    className="ui-invoice-cards__item"
                    title={`${invoiceTitle(row)} · ${row.clientName ?? "Client"}`}
                  >
                    <div className="ui-invoice-cards__meta">
                      <strong>{invoiceTitle(row)}</strong>
                      <p>
                        {row.clientName ?? "Client"}
                        {" · "}
                        {issued}
                        {due ? ` · ${due}` : ""}
                      </p>
                    </div>
                    <div className="ui-invoice-cards__aside">
                      <StatusBadge status={row.status} label={statusLabel(row.status)} />
                      <span className="ui-invoice-cards__total">{formatMoney(row.total, row.currency)}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}

        {total > PAGE_SIZE ? (
          <div className="ui-invoice-pager">
            <p>
              Page {page} of {pageCount}
            </p>
            <div className="ui-invoice-pager__actions">
              <button
                type="button"
                className="ui-btn ui-btn--secondary ui-btn--sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="ui-btn ui-btn--secondary ui-btn--sm"
                disabled={page >= pageCount || loading}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
