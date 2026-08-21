"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
  LoadingState,
  Section,
  StatusBadge,
  Table,
  Td,
} from "@nutrition-saas/ui";
import { roleLabel, statusLabel } from "../../../lib/admin-labels";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";

interface AdminRow {
  id: string;
  email: string;
  status: string;
  platformRole: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

interface UsersListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: AdminRow[];
}

export function SiteSettingsAdminsTab() {
  const [rows, setRows] = useState<AdminRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [grantEmail, setGrantEmail] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api<UsersListResponse>(
        "/api/v1/admin/users?scope=platform&pageSize=100&page=1",
      );
      setRows(data.items);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to load platform admins"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function removeAccess(userId: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api(`/api/v1/admin/users/${userId}/platform-role`, {
        method: "PATCH",
        body: JSON.stringify({ platformRole: null }),
      });
      setMessage("Platform admin access removed.");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to remove admin access"));
    } finally {
      setBusy(false);
    }
  }

  async function onGrant(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const email = grantEmail.trim();
      const found = await api<UsersListResponse>(
        `/api/v1/admin/users?scope=all&q=${encodeURIComponent(email)}&pageSize=20&page=1`,
      );
      const match = found.items.find((row) => row.email.toLowerCase() === email.toLowerCase());
      if (!match) {
        throw new Error("No user found with that email. Create the account first, then grant admin access.");
      }
      await api(`/api/v1/admin/users/${match.id}/platform-role`, {
        method: "PATCH",
        body: JSON.stringify({ platformRole: "ADMIN" }),
      });
      setGrantEmail("");
      setMessage(`Granted admin access to ${match.email}.`);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to grant admin access"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ui-stack">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      <Section
        title="Platform admins"
        description="Users with access to the platform console. There is a single admin type."
      >
        {rows === null ? <LoadingState>Loading admins…</LoadingState> : null}
        {rows && rows.length === 0 ? (
          <EmptyState title="No platform admins">Grant access to an existing user below.</EmptyState>
        ) : null}
        {rows && rows.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td>
                    <Link href={`/admin/site-settings/admins/${row.id}`} className="ui-link">
                      {row.email}
                    </Link>
                  </Td>
                  <Td>{roleLabel(row.platformRole) || "Admin"}</Td>
                  <Td>
                    <StatusBadge status={row.status} label={statusLabel(row.status)} />
                  </Td>
                  <Td>
                    <div className="ui-row" style={{ flexWrap: "wrap", gap: 6 }}>
                      <Link
                        href={`/admin/site-settings/admins/${row.id}`}
                        className="ui-btn ui-btn--secondary ui-btn--sm"
                      >
                        Edit
                      </Link>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy}
                        onClick={() => void removeAccess(row.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Section>

      <Section title="Grant admin access" description="Look up an existing user by email and grant platform admin access.">
        <form onSubmit={(event) => void onGrant(event)} className="ui-stack" style={{ maxWidth: 480 }}>
          <Field label="User email">
            <Input
              type="email"
              value={grantEmail}
              onChange={(event) => setGrantEmail(event.target.value)}
              placeholder="admin@example.com"
              required
            />
          </Field>
          <Button type="submit" disabled={busy || !grantEmail.trim()}>
            {busy ? "Saving…" : "Grant admin access"}
          </Button>
        </form>
      </Section>
    </div>
  );
}
