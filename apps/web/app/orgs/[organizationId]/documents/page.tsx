"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, EmptyState, PageHeader } from "@nutrition-saas/ui";
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ items: ClientRow[] }>(`/api/v1/organizations/${organizationId}/clients?pageSize=50`)
      .then((data) => setClients(data.items))
      .catch((err) => setError(errorMessage(err, "Unable to load clients")));
  }, [organizationId]);

  return (
    <section>
      <PageHeader
        title="Documents"
        description="Documents are stored on each client chart. Open a client to upload or share files. A practice-wide inbox is not available yet."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {clients.length === 0 ? (
        <EmptyState title="No client charts yet">Invite clients, then share documents from their workspace.</EmptyState>
      ) : (
        <ul>
          {clients.map((client) => (
            <li key={client.id}>
              <Link href={`/orgs/${organizationId}/clients/${client.id}?tab=documents`} className="ui-link">
                {client.displayName ?? `${client.firstName} ${client.lastName}`}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
