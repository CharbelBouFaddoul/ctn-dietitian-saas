"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Section,
  Select,
  StatusBadge,
  Textarea,
} from "@nutrition-saas/ui";
import { FilterPopover, ListFilters, LIST_SEARCH_DEBOUNCE_MS } from "../../../../components/list-filters";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { statusLabel } from "../../../../lib/practice-labels";

interface PlanRow {
  id: string;
  name: string;
  status: string;
  client: { id: string; firstName: string; lastName: string; displayName: string | null };
  currentPublishedVersion: number | null;
  draftVersion: number | null;
}

interface ListResponse {
  items: PlanRow[];
  total: number;
}

interface ClientRow {
  id: string;
  firstName: string;
  lastName: string;
  displayName?: string | null;
}

function clientLabel(client: ClientRow): string {
  return client.displayName ?? `${client.firstName} ${client.lastName}`;
}

const STATUS_FILTERS = [
  { id: "", label: "Active & drafts" },
  { id: "DRAFT", label: "Draft" },
  { id: "ACTIVE", label: "Active" },
  { id: "ARCHIVED", label: "Archived" },
] as const;

export default function MealPlansRoute() {
  return (
    <Suspense fallback={<LoadingMealPlans />}>
      <MealPlansPage />
    </Suspense>
  );
}

function LoadingMealPlans() {
  return (
    <section className="ui-list-page">
      <PageHeader eyebrow="Nutrition" title="Meal plans" description="Loading…" />
    </section>
  );
}

function MealPlansPage() {
  const params = useParams<{ dietitianAccountId: string }>();
  const searchParams = useSearchParams();
  const dietitianAccountId = params.dietitianAccountId;
  const [data, setData] = useState<ListResponse | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dayLabelMode, setDayLabelMode] = useState<"NUMBERED" | "WEEKDAY">("NUMBERED");
  const [clientId, setClientId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [filterClientId, setFilterClientId] = useState(() => searchParams.get("clientId") ?? "");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    const qs = new URLSearchParams();
    if (statusFilter) qs.set("status", statusFilter);
    if (filterClientId) qs.set("clientId", filterClientId);
    if (search) qs.set("q", search);
    const query = qs.toString() ? `?${qs.toString()}` : "";
    const [plans, clientList] = await Promise.all([
      api<ListResponse>(`/api/v1/dietitian/${dietitianAccountId}/meal-plans${query}`),
      api<{ items: ClientRow[] }>(`/api/v1/dietitian/${dietitianAccountId}/clients?pageSize=50`),
    ]);
    setData(plans);
    setClients(clientList.items);
    if (!clientId) {
      const fromFilter = filterClientId && clientList.items.some((row) => row.id === filterClientId);
      setClientId(fromFilter ? filterClientId : (clientList.items[0]?.id ?? ""));
    }
  }

  useEffect(() => {
    const next = searchDraft.trim();
    if (next === search) return;
    const timer = window.setTimeout(() => setSearch(next), LIST_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search, searchDraft]);

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load meal plans")));
  }, [dietitianAccountId, statusFilter, filterClientId, search]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ id: string; versions: Array<{ id: string; status: string }> }>(
        `/api/v1/dietitian/${dietitianAccountId}/meal-plans`,
        {
          method: "POST",
          body: JSON.stringify({
            clientId,
            name,
            description: description.trim() || null,
            dayLabelMode,
          }),
        },
      );
      window.location.href = `/practice/${dietitianAccountId}/clients/${clientId}?tab=meal-plan&planId=${created.id}`;
    } catch (err) {
      setError(errorMessage(err, "Could not create meal plan"));
      setBusy(false);
    }
  }

  async function archivePlan(id: string, planName: string) {
    if (!window.confirm(`Delete meal plan “${planName}”? It will be archived and hidden from the active list.`)) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/meal-plans/${id}/archive`, { method: "POST" });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not delete plan"));
    } finally {
      setBusyId(null);
    }
  }

  const items = data?.items ?? [];
  const hasFilters = Boolean(statusFilter || filterClientId || search);
  const selectedClient = clients.find((client) => client.id === filterClientId);
  const statusTrigger = STATUS_FILTERS.find((item) => item.id === statusFilter)?.label;

  function clearFilters() {
    setSearchDraft("");
    setSearch("");
    setFilterClientId("");
    setStatusFilter("");
  }

  return (
    <section className="ui-list-page">
      <PageHeader
        eyebrow="Nutrition"
        title="Meal plans"
        description="Build client days from foods and reusable meals. Publish a snapshot when ready — patients only see the published version."
        actions={
          <Button onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Hide form" : "New meal plan"}
          </Button>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {showCreate ? (
        <Section
          title="Create meal plan"
          description="Starts as a draft with one day and Breakfast / Lunch / Dinner."
        >
          <form onSubmit={(event) => void create(event)} className="ui-stack" style={{ gap: 16, width: "100%" }}>
            <Field label="Plan name">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                placeholder="e.g. Week 1 — weight loss"
                autoFocus
              />
            </Field>
            <Field label="Client">
              <Select value={clientId} onChange={(event) => setClientId(event.target.value)} required>
                {clients.length === 0 ? <option value="">No clients yet</option> : null}
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {clientLabel(client)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Day labels"
              hint="How days appear in the editor and for the client after publish."
            >
              <Select
                value={dayLabelMode}
                onChange={(event) => setDayLabelMode(event.target.value as "NUMBERED" | "WEEKDAY")}
              >
                <option value="NUMBERED">Day 1, Day 2, Day 3…</option>
                <option value="WEEKDAY">Monday, Tuesday, Wednesday…</option>
              </Select>
            </Field>
            <Field label="Description" hint="Optional. Visible to the client when published.">
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Goals, notes, or week focus…"
                rows={3}
              />
            </Field>
            <div className="ui-row" style={{ gap: 10 }}>
              <Button type="submit" disabled={busy || !clientId}>
                {busy ? "Creating…" : "Create draft"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Section>
      ) : null}

      <ListFilters
        search={searchDraft}
        onSearchChange={setSearchDraft}
        searchPlaceholder="Search plans"
        hasFilters={hasFilters}
        onClear={clearFilters}
        count={data?.total ?? 0}
        countNoun="plan"
        loading={!data && !error}
      >
        <FilterPopover
          label="Filter by client"
          value={filterClientId ? (selectedClient ? clientLabel(selectedClient) : "Client") : "Client"}
          active={Boolean(filterClientId)}
          searchPlaceholder="Search clients"
          onSelect={setFilterClientId}
          items={[
            { id: "", label: "All clients", active: !filterClientId },
            ...clients.map((client) => ({
              id: client.id,
              label: clientLabel(client),
              active: filterClientId === client.id,
            })),
          ]}
        />
        <FilterPopover
          label="Filter by status"
          value={statusFilter ? statusTrigger ?? "Status" : "Status"}
          active={Boolean(statusFilter)}
          searchPlaceholder="Search status"
          onSelect={setStatusFilter}
          items={STATUS_FILTERS.map((item) => ({
            id: item.id,
            label: item.id ? item.label : "Active & drafts",
            active: statusFilter === item.id,
          }))}
        />
      </ListFilters>

      <div className="ui-list-results">
        {items.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No meal plans match" : "No meal plans yet"}
            action={
              !hasFilters ? (
                <Button onClick={() => setShowCreate(true)}>Create first plan</Button>
              ) : (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              )
            }
          >
            {hasFilters
              ? "Try a different name, client, or status."
              : "Create a draft, add foods and reusable meals to each day, then publish for the client."}
          </EmptyState>
        ) : (
          <ul className="ui-list-cards">
            {items.map((row) => {
              const clientName = row.client.displayName ?? `${row.client.firstName} ${row.client.lastName}`;
              const versions = [
                row.draftVersion ? `Draft v${row.draftVersion}` : "No draft",
                row.currentPublishedVersion ? `Published v${row.currentPublishedVersion}` : "Not published",
              ].join(" · ");
              return (
                <li key={row.id}>
                  <article className="ui-list-cards__item">
                    <Link
                      href={`/practice/${dietitianAccountId}/meal-plans/${row.id}`}
                      className="ui-list-cards__main"
                      title={`${row.name} · ${clientName}`}
                    >
                      <strong>{row.name}</strong>
                      <p>
                        {clientName} · {versions}
                      </p>
                    </Link>
                    <div className="ui-list-cards__aside">
                      <StatusBadge status={row.status} label={statusLabel(row.status)} />
                      {row.status !== "ARCHIVED" ? (
                        <div className="ui-list-cards__actions">
                          <button
                            type="button"
                            className="ui-list-cards__action is-danger"
                            disabled={busyId === row.id}
                            onClick={() => void archivePlan(row.id, row.name)}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
