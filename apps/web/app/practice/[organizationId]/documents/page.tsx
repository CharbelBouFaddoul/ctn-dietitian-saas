"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, Avatar, EmptyState, PageHeader, SearchInput } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";

interface ClientRow {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
}

export default function PracticeDocumentsPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ items: ClientRow[] }>(`/api/v1/organizations/${organizationId}/clients?pageSize=50`)
      .then((data) => setClients(data.items))
      .catch((err) => setError(errorMessage(err, "Unable to load clients")));
  }, [organizationId]);

  const filtered = search.trim()
    ? clients.filter((c) => {
        const name = (c.displayName ?? `${c.firstName} ${c.lastName}`).toLowerCase();
        return name.includes(search.toLowerCase());
      })
    : clients;

  return (
    <section>
      <PageHeader
        title="Documents"
        description="Documents are stored on each client chart. Open a client to upload or share files. A practice-wide inbox is not available yet."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {clients.length === 0 && !error ? (
        <EmptyState title="No client charts yet">
          Invite clients using your practice join code, then share documents from their workspace.
        </EmptyState>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Filter clients…"
              aria-label="Filter clients"
            />
          </div>
          {filtered.length === 0 ? (
            <EmptyState title="No clients match">Try a different search term.</EmptyState>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 10,
              }}
            >
              {filtered.map((client) => {
                const name = client.displayName ?? `${client.firstName} ${client.lastName}`;
                return (
                  <Link
                    key={client.id}
                    href={`/practice/${organizationId}/clients/${client.id}?tab=documents`}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 14px",
                        borderRadius: 8,
                        border: "1px solid var(--color-border)",
                        background: "var(--color-surface)",
                      }}
                    >
                      <Avatar name={name} />
                      <span style={{ fontWeight: 500, fontSize: "0.9375rem", lineHeight: 1.3 }}>
                        {name}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
