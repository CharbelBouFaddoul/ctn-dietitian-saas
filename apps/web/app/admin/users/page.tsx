"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
import { AdminPagination } from "../_components/admin-pagination";
import { scopedStatusLabel } from "../../../lib/admin-labels";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";

interface UserRow {
  id: string;
  email: string;
  status: string;
  accountType: "dietitian" | "patient" | "both" | "admin" | "none";
  displayName: string | null;
}

interface UsersListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: UserRow[];
}

const PAGE_SIZE = 25;

function accountTypeLabel(value: UserRow["accountType"]): string {
  if (value === "dietitian") return "Dietitian";
  if (value === "patient") return "Patient";
  if (value === "both") return "Dietitian & patient";
  return "—";
}

export default function AdminUsersPage() {
  const [data, setData] = useState<UsersListResponse | null>(null);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | "dietitian" | "patient">("all");
  const [status, setStatus] = useState<"" | "PENDING" | "ACTIVE" | "SUSPENDED" | "ARCHIVED">("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const listQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("scope", "app");
    if (search) params.set("q", search);
    if (type !== "all") params.set("type", type);
    if (status) params.set("status", status);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    return params.toString();
  }, [search, type, status, page]);

  useEffect(() => {
    void (async () => {
      try {
        setData(await api<UsersListResponse>(`/api/v1/admin/users?${listQuery}`));
        setError(null);
      } catch (err) {
        setError(errorMessage(err, "Unable to load accounts"));
      }
    })();
  }, [listQuery]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(q.trim());
  }

  const rows = data?.items ?? null;

  return (
    <AdminPage
      eyebrow="People"
      title="Accounts"
      description="Dietitian and patient logins. Platform operators are under Admins."
      error={error}
      actions={
        <Link href="/admin/users/new" className="ui-btn ui-btn--primary ui-btn--sm">
          Add patient
        </Link>
      }
    >
      <Section title="All accounts">
        <AdminListToolbar onSubmit={onSearch}>
          <Field label="Search">
            <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Email" />
          </Field>
          <Field label="Type">
            <Select
              value={type}
              onChange={(event) => {
                setType(event.target.value as "all" | "dietitian" | "patient");
                setPage(1);
              }}
            >
              <option value="all">All types</option>
              <option value="dietitian">Dietitian</option>
              <option value="patient">Patient</option>
            </Select>
          </Field>
          <Field label="Login status">
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as typeof status);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="PENDING">Pending</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
          </Field>
          <Button type="submit">Search</Button>
        </AdminListToolbar>

        {rows === null && !error ? <LoadingState>Loading accounts…</LoadingState> : null}
        {rows && rows.length === 0 ? (
          <EmptyState title="No accounts found">Try another search or filter.</EmptyState>
        ) : null}
        {rows && rows.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Type</th>
                <th>Login status</th>
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
                  <Td>{row.displayName || "—"}</Td>
                  <Td>{accountTypeLabel(row.accountType)}</Td>
                  <Td>
                    <StatusBadge status={row.status} label={scopedStatusLabel("login", row.status)} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}

        {data ? (
          <AdminPagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPageChange={setPage}
            label="accounts"
          />
        ) : null}
      </Section>
    </AdminPage>
  );
}
