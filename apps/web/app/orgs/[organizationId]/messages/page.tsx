"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";

interface InboxRow {
  id: string;
  clientId: string;
  clientName: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export default function OrgMessagesPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<InboxRow[]>(`/api/v1/organizations/${organizationId}/conversations`)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load inbox"));
  }, [organizationId]);

  return (
    <div style={{ padding: "1rem" }}>
      <h1>Messages</h1>
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
        {rows.map((row) => (
          <li key={row.id} style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 12 }}>
            <Link href={`/orgs/${organizationId}/clients/${row.clientId}?tab=messages`}>
              <strong>{row.clientName}</strong>
            </Link>
            {row.unreadCount > 0 ? <span style={{ marginLeft: 8 }}>({row.unreadCount} unread)</span> : null}
            <div style={{ color: "var(--color-muted)", fontSize: 14 }}>{row.lastMessagePreview ?? "No messages yet"}</div>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <p style={{ color: "var(--color-muted)" }}>No conversations yet.</p> : null}
    </div>
  );
}
