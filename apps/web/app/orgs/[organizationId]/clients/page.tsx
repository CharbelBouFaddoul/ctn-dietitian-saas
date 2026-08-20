"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FilterBar,
  PageHeader,
  SearchInput,
  Select,
  StatusBadge,
  Table,
  Td,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { portalStatusLabel } from "../../../../lib/practice-labels";
import { canManageClients } from "../../../../lib/practice-access";
import { usePractice } from "../practice-shell";

interface ClientRow {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  email: string | null;
  status: string;
  assignedTo: { membershipId: string; email: string } | null;
  tags: Array<{ id: string; name: string }>;
  portalStatus: string | null;
  connectionStatus?: string | null;
}

interface ListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: ClientRow[];
}

interface Tag {
  id: string;
  name: string;
}

interface Member {
  id: string;
  email: string;
  role: string;
  status: string;
}

interface PracticeJoinCode {
  status: "none" | "active" | "expired";
  expiresAt: string | null;
  hint: string | null;
  code: string | null;
}

function practiceCodeStorageKey(organizationId: string) {
  return `practiceJoinCode:${organizationId}`;
}

export default function ClientsPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const practice = usePractice();
  const allowCreate = canManageClients(practice.role);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [tagId, setTagId] = useState("");
  const [assignedMemberId, setAssignedMemberId] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<PracticeJoinCode | null>(null);
  const [plainJoinCode, setPlainJoinCode] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [copied, setCopied] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (tagId) params.set("tagId", tagId);
    if (assignedMemberId) params.set("assignedMemberId", assignedMemberId);
    params.set("page", String(page));
    params.set("pageSize", "20");
    return params.toString();
  }, [q, status, tagId, assignedMemberId, page]);

  async function load() {
    setError(null);
    try {
      const [list, tagRows, memberRows, practiceCode] = await Promise.all([
        api<ListResponse>(`/api/v1/organizations/${organizationId}/clients?${query}`),
        api<Tag[]>(`/api/v1/organizations/${organizationId}/tags`),
        api<Member[]>(`/api/v1/organizations/${organizationId}/members`),
        allowCreate
          ? api<PracticeJoinCode>(`/api/v1/organizations/${organizationId}/join-code`)
          : Promise.resolve(null),
      ]);
      setData(list);
      setTags(tagRows);
      setMembers(memberRows.filter((row) => row.status === "ACTIVE"));
      if (practiceCode) {
        setJoinCode(practiceCode);
        const stored = sessionStorage.getItem(practiceCodeStorageKey(organizationId));
        const storedCode =
          stored && practiceCode.hint && stored.replace(/[^A-Za-z0-9]/g, "").slice(-4) === practiceCode.hint
            ? stored
            : null;
        setPlainJoinCode(practiceCode.code ?? storedCode);
      }
    } catch (err) {
      setError(errorMessage(err, "Unable to load clients"));
    }
  }

  useEffect(() => {
    void load();
  }, [organizationId, query, allowCreate]);

  function onFilter(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    void load();
  }

  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / 20));
  const hasFilters = Boolean(q || status || tagId || assignedMemberId);

  async function generatePracticeCode() {
    setInviteBusy(true);
    setError(null);
    try {
      const issued = await api<PracticeJoinCode>(`/api/v1/organizations/${organizationId}/join-code`, {
        method: "POST",
      });
      if (issued.code) {
        sessionStorage.setItem(practiceCodeStorageKey(organizationId), issued.code);
      }
      setJoinCode(issued);
      setPlainJoinCode(issued.code);
    } catch (err) {
      setError(errorMessage(err, "Could not generate join code"));
    } finally {
      setInviteBusy(false);
    }
  }

  async function revokePracticeCode() {
    setInviteBusy(true);
    setError(null);
    try {
      const result = await api<PracticeJoinCode>(`/api/v1/organizations/${organizationId}/join-code`, {
        method: "DELETE",
      });
      sessionStorage.removeItem(practiceCodeStorageKey(organizationId));
      setJoinCode(result);
      setPlainJoinCode(null);
    } catch (err) {
      setError(errorMessage(err, "Could not revoke join code"));
    } finally {
      setInviteBusy(false);
      setConfirmRevoke(false);
    }
  }

  async function handleCopy() {
    if (!plainJoinCode) return;
    await navigator.clipboard.writeText(plainJoinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section>
      <PageHeader
        title="Clients"
        description="People appear here after they create an account and enter your practice join code."
        actions={
          allowCreate ? (
            <Link href={`/orgs/${organizationId}/clients/new`} className="ui-btn ui-btn--secondary">
              Add chart manually
            </Link>
          ) : null
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {allowCreate ? (
        <Card title="Practice join code">
          <p className="ui-muted">
            Share this code with clients who already have an account. They enter it after signing in and appear on this
            list automatically.
          </p>

          {plainJoinCode ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "12px 0" }}>
              <code
                style={{
                  fontFamily: "monospace",
                  fontSize: "1.5rem",
                  letterSpacing: "0.15em",
                  fontWeight: 700,
                  background: "var(--color-surface-raised, #f5f5f5)",
                  padding: "8px 20px",
                  borderRadius: 8,
                  border: "1px solid var(--color-border)",
                }}
              >
                {plainJoinCode}
              </code>
            </div>
          ) : joinCode?.hint ? (
            <p className="ui-muted" style={{ margin: "12px 0" }}>
              Active code ending in <strong>{joinCode.hint}</strong>
            </p>
          ) : (
            <p className="ui-muted" style={{ margin: "12px 0" }}>
              No join code active.
            </p>
          )}

          {joinCode?.expiresAt ? (
            <p className="ui-hint">
              {joinCode.status === "expired" ? "Expired" : "Expires"}{" "}
              {new Date(joinCode.expiresAt).toLocaleString()}
            </p>
          ) : null}

          <div className="ui-row" style={{ marginTop: 12 }}>
            <Button disabled={inviteBusy} onClick={() => void generatePracticeCode()}>
              {joinCode?.status === "active" || joinCode?.status === "expired" ? "Regenerate code" : "Generate join code"}
            </Button>
            {plainJoinCode ? (
              <Button variant="secondary" onClick={() => void handleCopy()}>
                {copied ? "Copied!" : "Copy code"}
              </Button>
            ) : null}
            {joinCode?.status === "active" || joinCode?.status === "expired" ? (
              <Button variant="danger" disabled={inviteBusy} onClick={() => setConfirmRevoke(true)}>
                Revoke
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      <form onSubmit={onFilter} style={{ margin: "20px 0" }}>
        <FilterBar>
          <SearchInput
            value={q}
            onChange={(value) => { setQ(value); setPage(1); }}
            placeholder="Search by name or email…"
            aria-label="Search clients"
          />
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
          {tags.length > 0 ? (
            <Select value={tagId} onChange={(event) => { setTagId(event.target.value); setPage(1); }}>
              <option value="">All tags</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </Select>
          ) : null}
          {members.length > 0 ? (
            <Select value={assignedMemberId} onChange={(event) => { setAssignedMemberId(event.target.value); setPage(1); }}>
              <option value="">All assignees</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.email} ({humanizeLabel(member.role)})
                </option>
              ))}
            </Select>
          ) : null}
          <Button type="submit" variant="secondary" size="sm">
            Apply
          </Button>
        </FilterBar>
      </form>

      {(data?.items ?? []).length === 0 ? (
        <EmptyState
          title={hasFilters ? "No clients match these filters" : "No clients yet"}
          action={
            allowCreate && !hasFilters ? (
              <Button onClick={() => void generatePracticeCode()}>Generate a join code</Button>
            ) : undefined
          }
        >
          {hasFilters
            ? "Try adjusting your search or clearing the filters."
            : "Share your practice join code with clients. Manual charts are a secondary option."}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
              <th>Assigned to</th>
              <th>Tags</th>
              <th>Portal</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((row) => (
              <tr key={row.id}>
                <Td label="Name">
                  <Link href={`/orgs/${organizationId}/clients/${row.id}`} className="ui-link" style={{ fontWeight: 500 }}>
                    {row.displayName ?? `${row.firstName} ${row.lastName}`}
                  </Link>
                </Td>
                <Td label="Email">
                  {row.email ? (
                    <span className="ui-muted">{row.email}</span>
                  ) : (
                    <span className="ui-muted">—</span>
                  )}
                </Td>
                <Td label="Status">
                  <StatusBadge status={row.status} label={humanizeLabel(row.status)} />
                </Td>
                <Td label="Assigned to">
                  {row.assignedTo?.email ? (
                    <span className="ui-muted">{row.assignedTo.email}</span>
                  ) : (
                    <span className="ui-muted">—</span>
                  )}
                </Td>
                <Td label="Tags">
                  {row.tags.length > 0 ? (
                    <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {row.tags.map((tag) => (
                        <Badge key={tag.id} tone="neutral">
                          {tag.name}
                        </Badge>
                      ))}
                    </span>
                  ) : (
                    <span className="ui-muted">—</span>
                  )}
                </Td>
                <Td label="Portal">
                  <Link
                    href={`/orgs/${organizationId}/clients/${row.id}?tab=portal`}
                    className="ui-link"
                    style={{ fontSize: "0.875rem" }}
                  >
                    {portalStatusLabel(row.connectionStatus)}
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {(data?.total ?? 0) > 0 ? (
        <div
          className="ui-row"
          style={{ marginTop: 16, justifyContent: "space-between", alignItems: "center" }}
        >
          <span className="ui-muted" style={{ fontSize: "0.875rem" }}>
            Page {data?.page ?? 1} of {pageCount} &middot; {data?.total ?? 0} client{(data?.total ?? 0) !== 1 ? "s" : ""}
          </span>
          <div className="ui-row">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              ← Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
              Next →
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmRevoke}
        title="Revoke this join code?"
        description="People who still have the old code will not be able to join until you generate a new one."
        confirmLabel="Revoke code"
        danger
        pending={inviteBusy}
        onConfirm={() => void revokePracticeCode()}
        onCancel={() => setConfirmRevoke(false)}
      />
    </section>
  );
}
