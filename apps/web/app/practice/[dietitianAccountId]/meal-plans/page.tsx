"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  FilterBar,
  Input,
  PageHeader,
  SearchInput,
  Section,
  Select,
  StatusBadge,
  Table,
  Td,
  Textarea,
} from "@nutrition-saas/ui";
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

export default function MealPlansPage() {
  const params = useParams<{ dietitianAccountId: string }>();
  const dietitianAccountId = params.dietitianAccountId;
  const [data, setData] = useState<ListResponse | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dayLabelMode, setDayLabelMode] = useState<"NUMBERED" | "WEEKDAY">("NUMBERED");
  const [clientId, setClientId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    const qs = new URLSearchParams();
    if (statusFilter) qs.set("status", statusFilter);
    if (filterClientId) qs.set("clientId", filterClientId);
    if (nameQuery.trim()) qs.set("q", nameQuery.trim());
    const query = qs.toString() ? `?${qs.toString()}` : "";
    const [plans, clientList] = await Promise.all([
      api<ListResponse>(`/api/v1/dietitian/${dietitianAccountId}/meal-plans${query}`),
      api<{ items: ClientRow[] }>(`/api/v1/dietitian/${dietitianAccountId}/clients?pageSize=50`),
    ]);
    setData(plans);
    setClients(clientList.items);
    if (!clientId && clientList.items[0]) setClientId(clientList.items[0].id);
  }

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void load().catch((err) => setError(errorMessage(err, "Unable to load meal plans")));
    }, nameQuery.trim() ? 250 : 0);
    return () => window.clearTimeout(handle);
  }, [dietitianAccountId, statusFilter, filterClientId, nameQuery]);

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
      const draft = created.versions.find((row) => row.status === "DRAFT") ?? created.versions[0];
      window.location.href = `/practice/${dietitianAccountId}/meal-plans/${created.id}?versionId=${draft?.id ?? ""}`;
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
  const hasFilters = Boolean(statusFilter || filterClientId || nameQuery.trim());
  const filterDescription = useMemo(() => {
    if (!data) return "Loading…";
    const count = `${data.total} plan${data.total !== 1 ? "s" : ""}`;
    return hasFilters ? `${count} matching filters` : count;
  }, [data, hasFilters]);

  return (
    <section className="ui-stack" style={{ gap: 24 }}>
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

      <Section title="Find plans" description="Narrow by name, client, or status." tone="muted">
        <FilterBar>
          <div className="ui-filter-bar__field ui-filter-bar__field--grow">
            <p className="ui-filter-bar__label">Plan name</p>
            <SearchInput
              value={nameQuery}
              onChange={setNameQuery}
              placeholder="Search plans…"
              aria-label="Search meal plans by name"
            />
          </div>
          <div className="ui-filter-bar__field">
            <p className="ui-filter-bar__label">Client</p>
            <Select
              value={filterClientId}
              onChange={(event) => setFilterClientId(event.target.value)}
              aria-label="Filter by client"
              className="ui-filter-bar__select"
            >
              <option value="">All clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {clientLabel(client)}
                </option>
              ))}
            </Select>
          </div>
          <div className="ui-filter-bar__field">
            <p className="ui-filter-bar__label">Status</p>
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter by status"
              className="ui-filter-bar__select"
            >
              <option value="">Active & drafts</option>
              <option value="DRAFT">Draft plans</option>
              <option value="ACTIVE">Active (published)</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
          </div>
          {hasFilters ? (
            <div className="ui-filter-bar__actions">
              <button
                type="button"
                className="ui-filter-bar__clear"
                onClick={() => {
                  setNameQuery("");
                  setFilterClientId("");
                  setStatusFilter("");
                }}
              >
                Clear filters
              </button>
            </div>
          ) : null}
        </FilterBar>
      </Section>

      <Section title="All plans" description={filterDescription}>
        {items.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No meal plans match" : "No meal plans yet"}
            action={
              !hasFilters ? (
                <Button onClick={() => setShowCreate(true)}>Create first plan</Button>
              ) : undefined
            }
          >
            {hasFilters
              ? "Try a different name, client, or status."
              : "Create a draft, add foods and reusable meals to each day, then publish for the client."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Client</th>
                <th>Status</th>
                <th>Versions</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <Td label="Plan">
                    <Link href={`/practice/${dietitianAccountId}/meal-plans/${row.id}`} className="ui-link">
                      <strong>{row.name}</strong>
                    </Link>
                  </Td>
                  <Td label="Client">
                    {row.client.displayName ?? `${row.client.firstName} ${row.client.lastName}`}
                  </Td>
                  <Td label="Status">
                    <StatusBadge status={row.status} label={statusLabel(row.status)} />
                  </Td>
                  <Td label="Versions">
                    <span className="ui-muted" style={{ fontSize: 13 }}>
                      {row.draftVersion ? `Draft v${row.draftVersion}` : "No draft"}
                      {" · "}
                      {row.currentPublishedVersion ? `Published v${row.currentPublishedVersion}` : "Not published"}
                    </span>
                  </Td>
                  <Td label="Actions">
                    <div className="ui-row" style={{ gap: 8, justifyContent: "flex-end" }}>
                      <Link
                        href={`/practice/${dietitianAccountId}/meal-plans/${row.id}`}
                        className="ui-btn ui-btn--secondary ui-btn--sm"
                      >
                        Open
                      </Link>
                      {row.status !== "ARCHIVED" ? (
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={busyId === row.id}
                          onClick={() => void archivePlan(row.id, row.name)}
                        >
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </section>
  );
}
