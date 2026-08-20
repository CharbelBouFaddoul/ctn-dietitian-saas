"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Section,
  StatusBadge,
  Table,
  Td,
} from "@nutrition-saas/ui";
import { roleLabel, statusLabel } from "../../../lib/admin-labels";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";

interface UserRow {
  id: string;
  email: string;
  status: string;
  platformRole: string | null;
}

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load(search = q) {
    try {
      const path = search ? `/api/v1/admin/users?q=${encodeURIComponent(search)}` : "/api/v1/admin/users";
      setRows(await api<UserRow[]>(path));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to load users"));
    }
  }

  useEffect(() => {
    void load("");
  }, []);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    void load(q);
  }

  return (
    <section>
      <PageHeader
        eyebrow="Platform"
        title="Users"
        description="Platform accounts and roles across the SaaS."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Section title="All users">
        <form onSubmit={onSearch} className="ui-admin-toolbar">
          <Field label="Search">
            <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Email" />
          </Field>
          <Button type="submit">Search</Button>
        </form>

        {rows === null ? <LoadingState>Loading users…</LoadingState> : null}
        {rows && rows.length === 0 ? <EmptyState title="No users found">Try another email search.</EmptyState> : null}
        {rows && rows.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Status</th>
                <th>Platform role</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td label="Email">
                    <Link href={`/admin/users/${row.id}`} className="ui-link">
                      {row.email}
                    </Link>
                  </Td>
                  <Td label="Status">
                    <StatusBadge status={row.status} label={statusLabel(row.status)} />
                  </Td>
                  <Td label="Platform role">{roleLabel(row.platformRole) || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Section>
    </section>
  );
}
