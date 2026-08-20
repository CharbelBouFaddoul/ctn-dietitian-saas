"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
  Table,
  Td,
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
}

interface ClientRow {
  id: string;
  firstName: string;
  lastName: string;
}

export default function MealPlansPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const [data, setData] = useState<ListResponse | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [plans, clientList] = await Promise.all([
      api<ListResponse>(`/api/v1/organizations/${organizationId}/meal-plans`),
      api<{ items: ClientRow[] }>(`/api/v1/organizations/${organizationId}/clients?pageSize=50`),
    ]);
    setData(plans);
    setClients(clientList.items);
    if (!clientId && clientList.items[0]) setClientId(clientList.items[0].id);
  }

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load meal plans")));
  }, [organizationId]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ id: string; versions: Array<{ id: string; status: string }> }>(
        `/api/v1/organizations/${organizationId}/meal-plans`,
        { method: "POST", body: JSON.stringify({ clientId, name }) },
      );
      const draft = created.versions.find((row) => row.status === "DRAFT") ?? created.versions[0];
      window.location.href = `/practice/${organizationId}/meal-plans/${created.id}?versionId=${draft?.id ?? ""}`;
    } catch (err) {
      setError(errorMessage(err, "Could not create meal plan"));
      setBusy(false);
    }
  }

  const items = data?.items ?? [];

  return (
    <section>
      <PageHeader
        title="Meal Plans"
        description="Draft, publish, and keep historical versions. Clients only see the current published snapshot."
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Section title="Create a meal plan">
        <form onSubmit={(event) => void create(event)} className="ui-inline-form">
          <Field label="Plan name">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              placeholder="e.g. Week 1 weight-loss plan"
            />
          </Field>
          <Field label="Client">
            <Select value={clientId} onChange={(event) => setClientId(event.target.value)}>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.firstName} {client.lastName}
                </option>
              ))}
            </Select>
          </Field>
          <div className="ui-inline-form__action">
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create draft"}
            </Button>
          </div>
        </form>
      </Section>

      {items.length === 0 ? (
        <EmptyState title="No meal plans yet">
          Create a draft above to get started. Plans support versioning — clients only see published snapshots.
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Plan</th>
              <th>Client</th>
              <th>Status</th>
              <th>Published</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <Td label="Plan">
                  <Link href={`/practice/${organizationId}/meal-plans/${row.id}`} className="ui-link">
                    {row.name}
                  </Link>
                </Td>
                <Td label="Client">
                  {row.client.displayName ?? `${row.client.firstName} ${row.client.lastName}`}
                </Td>
                <Td label="Status">
                  <StatusBadge status={row.status} label={statusLabel(row.status)} />
                </Td>
                <Td label="Published">
                  {row.currentPublishedVersion ? `v${row.currentPublishedVersion}` : "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}
