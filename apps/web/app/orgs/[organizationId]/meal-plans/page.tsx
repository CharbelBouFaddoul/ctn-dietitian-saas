"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
import { buttonStyle, cellStyle, fieldStyle, inputStyle, tableStyle } from "../practice-shell";

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
    void load().catch((err) => setError(err instanceof Error ? err.message : "Unable to load meal plans"));
  }, [organizationId]);

  async function create(event: FormEvent) {
    event.preventDefault();
    const created = await api<{ id: string; versions: Array<{ id: string; status: string }> }>(
      `/api/v1/organizations/${organizationId}/meal-plans`,
      { method: "POST", body: JSON.stringify({ clientId, name }) },
    );
    const draft = created.versions.find((row) => row.status === "DRAFT") ?? created.versions[0];
    window.location.href = `/orgs/${organizationId}/meal-plans/${created.id}?versionId=${draft?.id ?? ""}`;
  }

  return (
    <section>
      <h1>Meal plans</h1>
      <p style={{ color: "var(--color-muted)" }}>Draft, publish, and keep historical versions. Clients only see the current published snapshot.</p>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
      <form onSubmit={(event) => void create(event).catch((err) => setError(err instanceof Error ? err.message : "Create failed"))} style={{ display: "flex", gap: 12, alignItems: "end" }}>
        <label style={fieldStyle}>
          Name
          <input style={inputStyle} value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label style={fieldStyle}>
          Client
          <select style={inputStyle} value={clientId} onChange={(event) => setClientId(event.target.value)}>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.firstName} {client.lastName}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" style={{ ...buttonStyle, height: 38 }}>
          Create draft
        </button>
      </form>
      <table style={{ ...tableStyle, marginTop: 16 }}>
        <thead>
          <tr>
            <th style={cellStyle}>Plan</th>
            <th style={cellStyle}>Client</th>
            <th style={cellStyle}>Status</th>
            <th style={cellStyle}>Published</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((row) => (
            <tr key={row.id}>
              <td style={cellStyle}>
                <Link href={`/orgs/${organizationId}/meal-plans/${row.id}`} style={{ color: "var(--color-accent)" }}>
                  {row.name}
                </Link>
              </td>
              <td style={cellStyle}>{row.client.displayName ?? `${row.client.firstName} ${row.client.lastName}`}</td>
              <td style={cellStyle}>{row.status}</td>
              <td style={cellStyle}>{row.currentPublishedVersion ? `v${row.currentPublishedVersion}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
