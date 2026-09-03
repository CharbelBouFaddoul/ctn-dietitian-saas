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
import { statusLabel } from "../../../lib/admin-labels";
import { api } from "../../../lib/api";
import { formatDate } from "../../../lib/format";
import { errorMessage } from "../../../lib/humanize-error";

type InboxStatus = "inbox" | "NEW" | "READ" | "ARCHIVED" | "all";

interface ContactRow {
  id: string;
  name: string;
  email: string;
  subject: string;
  preview: string;
  status: "NEW" | "READ" | "ARCHIVED";
  planName: string | null;
  createdAt: string;
}

interface ContactListResponse {
  page: number;
  pageSize: number;
  total: number;
  newCount: number;
  items: ContactRow[];
}

const PAGE_SIZE = 25;

function statusTone(status: ContactRow["status"]): "warning" | "info" | "neutral" {
  if (status === "NEW") return "warning";
  if (status === "READ") return "info";
  return "neutral";
}

export default function AdminContactPage() {
  const [data, setData] = useState<ContactListResponse | null>(null);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InboxStatus>("inbox");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const listQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    params.set("status", status);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    return params.toString();
  }, [search, status, page]);

  useEffect(() => {
    void (async () => {
      try {
        setData(await api<ContactListResponse>(`/api/v1/admin/contact-messages?${listQuery}`));
        setError(null);
      } catch (err) {
        setError(errorMessage(err, "Unable to load contact messages"));
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
      eyebrow="Website"
      title="Inbox"
      description="Messages sent from the public contact form. New ones stay at the top until you open them."
      error={error}
    >
      <Section title={data ? `${data.total} in this view` : "Inbox"}>
        {data && data.newCount > 0 ? (
          <p className="ui-muted" style={{ marginTop: 0 }}>
            {data.newCount} new {data.newCount === 1 ? "message" : "messages"} waiting.
          </p>
        ) : null}

        <AdminListToolbar onSubmit={onSearch}>
          <Field label="Search">
            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Name, email, subject, or message"
            />
          </Field>
          <Field label="Status">
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as InboxStatus);
                setPage(1);
              }}
            >
              <option value="inbox">Inbox</option>
              <option value="NEW">New</option>
              <option value="READ">Read</option>
              <option value="ARCHIVED">Archived</option>
              <option value="all">All</option>
            </Select>
          </Field>
          <Button type="submit">Search</Button>
        </AdminListToolbar>

        {rows === null && !error ? <LoadingState>Loading messages…</LoadingState> : null}
        {rows && rows.length === 0 ? (
          <EmptyState title="No messages">Contact form submissions will appear here.</EmptyState>
        ) : null}
        {rows && rows.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <th>From</th>
                <th>Subject</th>
                <th>Preview</th>
                <th>Received</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={row.status === "NEW" ? "ui-admin-inbox-row is-new" : "ui-admin-inbox-row"}>
                  <Td>
                    <Link href={`/admin/contact/${row.id}`} className="ui-link">
                      {row.name}
                    </Link>
                    <div className="ui-muted">{row.email}</div>
                  </Td>
                  <Td>
                    <Link href={`/admin/contact/${row.id}`} className="ui-link">
                      {row.subject}
                    </Link>
                    {row.planName ? <div className="ui-muted">{row.planName}</div> : null}
                  </Td>
                  <Td>
                    <span className="ui-admin-preview">{row.preview}</span>
                  </Td>
                  <Td>{formatDate(row.createdAt)}</Td>
                  <Td>
                    <StatusBadge status={row.status} label={statusLabel(row.status)} tone={statusTone(row.status)} />
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
            label="messages"
          />
        ) : null}
      </Section>
    </AdminPage>
  );
}
