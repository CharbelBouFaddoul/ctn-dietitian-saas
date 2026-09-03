"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  Button,
  EmptyState,
  Field,
  Input,
  LoadingState,
  Section,
  Select,
  StatusBadge,
  Table,
  Td,
} from "@nutrition-saas/ui";
import { AdminListToolbar } from "../_components/admin-list-toolbar";
import { AdminPage } from "../_components/admin-page";
import { scopedStatusLabel } from "../../../lib/admin-labels";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";

interface DietitianRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  ownerEmail: string | null;
  patientCount?: number;
  subscription: { status: string; plan: { name: string; slug: string } } | null;
}

export default function AdminDietitiansPage() {
  const [rows, setRows] = useState<DietitianRow[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load(search = q) {
    try {
      const path = search ? `/api/v1/admin/dietitians?q=${encodeURIComponent(search)}` : "/api/v1/admin/dietitians";
      setRows(await api<DietitianRow[]>(path));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to load clinics"));
    }
  }

  useEffect(() => {
    void load("");
  }, []);

  const visible = rows?.filter((row) => !status || row.status === status) ?? null;

  function onSearch(event: FormEvent) {
    event.preventDefault();
    void load(q);
  }

  return (
    <AdminPage
      eyebrow="People"
      title="Clinics"
      description="Each clinic is a practice: owner login, subscription, and entitlements live here."
      error={error}
      actions={
        <Link href="/admin/dietitians/new" className="ui-btn ui-btn--primary ui-btn--sm">
          Add clinic
        </Link>
      }
    >
      <Section title="All clinics">
        <AdminListToolbar onSubmit={onSearch}>
          <Field label="Search">
            <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Name, slug, or owner email" />
          </Field>
          <Field label="Clinic status">
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
          </Field>
          <Button type="submit">Search</Button>
        </AdminListToolbar>

        {rows === null ? <LoadingState>Loading clinics…</LoadingState> : null}
        {visible && visible.length === 0 ? (
          <EmptyState title="No clinics found">Try a different search or status.</EmptyState>
        ) : null}
        {visible && visible.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <th>Clinic</th>
                <th>Owner</th>
                <th>Patients</th>
                <th>Clinic status</th>
                <th>Plan</th>
                <th>Subscription</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <Td label="Clinic">
                    <Link href={`/admin/dietitians/${row.id}`} className="ui-link">
                      {row.name}
                    </Link>
                    <div className="ui-muted" style={{ fontSize: 12 }}>
                      {row.slug}
                    </div>
                  </Td>
                  <Td label="Owner">{row.ownerEmail || "—"}</Td>
                  <Td label="Patients">
                    <Link href={`/admin/dietitians/${row.id}?tab=patients`} className="ui-link">
                      {row.patientCount ?? 0}
                    </Link>
                  </Td>
                  <Td label="Clinic status">
                    <StatusBadge status={row.status} label={scopedStatusLabel("clinic", row.status)} />
                  </Td>
                  <Td label="Plan">{row.subscription?.plan.name ?? "None"}</Td>
                  <Td label="Subscription">
                    {row.subscription ? (
                      <StatusBadge
                        status={row.subscription.status}
                        label={scopedStatusLabel("subscription", row.subscription.status)}
                      />
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Section>
    </AdminPage>
  );
}
