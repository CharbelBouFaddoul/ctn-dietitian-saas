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
  Select,
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

interface PlanRow {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [planId, setPlanId] = useState("");
  const [provisionBusy, setProvisionBusy] = useState(false);

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
    void api<PlanRow[]>("/api/v1/admin/plans")
      .then((list) => setPlans(list.filter((plan) => plan.status === "ACTIVE")))
      .catch(() => setPlans([]));
  }, []);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    void load(q);
  }

  async function onProvision(event: FormEvent) {
    event.preventDefault();
    setProvisionBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api("/api/v1/admin/dietitians", {
        method: "POST",
        body: JSON.stringify({
          email,
          displayName,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          planId: planId || undefined,
        }),
      });
      setMessage(`Provisioned ${email}. Activation email sent.`);
      setEmail("");
      setDisplayName("");
      setFirstName("");
      setLastName("");
      setPlanId("");
      await load(q);
    } catch (err) {
      setError(errorMessage(err, "Unable to provision dietitian"));
    } finally {
      setProvisionBusy(false);
    }
  }

  return (
    <section>
      <PageHeader
        eyebrow="Platform"
        title="Users"
        description="Platform accounts and roles across the SaaS."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      <Section title="Provision dietitian">
        <form onSubmit={(event) => void onProvision(event)} className="ui-stack" style={{ maxWidth: 480 }}>
          <Field label="Email">
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </Field>
          <Field label="Practice name">
            <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
          </Field>
          <Field label="First name">
            <Input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
          </Field>
          <Field label="Last name">
            <Input value={lastName} onChange={(event) => setLastName(event.target.value)} />
          </Field>
          <Field label="Plan (optional)">
            <Select value={planId} onChange={(event) => setPlanId(event.target.value)}>
              <option value="">No subscription yet</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={provisionBusy}>
            {provisionBusy ? "Provisioning…" : "Provision dietitian"}
          </Button>
        </form>
      </Section>

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
                  <Td>
                    <Link href={`/admin/users/${row.id}`} className="ui-link">
                      {row.email}
                    </Link>
                  </Td>
                  <Td>
                    <StatusBadge status={row.status} label={statusLabel(row.status)} />
                  </Td>
                  <Td>{roleLabel(row.platformRole)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Section>
    </section>
  );
}
