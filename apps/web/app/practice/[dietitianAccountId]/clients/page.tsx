"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
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
import { ClinicTagsManager } from "../../../../components/clinic-tags-manager";
import { usePractice } from "../practice-shell";

interface ClientRow {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  email: string | null;
  status: string;
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

interface PracticeJoinCode {
  status: "none" | "active" | "expired";
  expiresAt: string | null;
  hint: string | null;
  code: string | null;
}

function practiceCodeStorageKey(dietitianAccountId: string) {
  return `practiceJoinCode:${dietitianAccountId}`;
}

export default function ClientsPage() {
  const params = useParams<{ dietitianAccountId: string }>();
  const dietitianAccountId = params.dietitianAccountId;
  const practice = usePractice();
  const allowCreate = canManageClients(practice.role);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [tagId, setTagId] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<PracticeJoinCode | null>(null);
  const [plainJoinCode, setPlainJoinCode] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [copied, setCopied] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (tagId) params.set("tagId", tagId);
    params.set("page", String(page));
    params.set("pageSize", "20");
    return params.toString();
  }, [q, status, tagId, page]);

  async function load() {
    setError(null);
    try {
      const [list, tagRows, practiceCode] = await Promise.all([
        api<ListResponse>(`/api/v1/dietitian/${dietitianAccountId}/clients?${query}`),
        api<Tag[]>(`/api/v1/dietitian/${dietitianAccountId}/tags`),
        allowCreate
          ? api<PracticeJoinCode>(`/api/v1/dietitian/${dietitianAccountId}/join-code`)
          : Promise.resolve(null),
      ]);
      setData(list);
      setTags(tagRows);
      if (practiceCode) {
        setJoinCode(practiceCode);
        const stored = sessionStorage.getItem(practiceCodeStorageKey(dietitianAccountId));
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
  }, [dietitianAccountId, query, allowCreate]);

  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / 20));
  const hasFilters = Boolean(q || status || tagId);
  const joinActive = joinCode?.status === "active" || Boolean(plainJoinCode) || Boolean(joinCode?.hint);

  async function generatePracticeCode() {
    setInviteBusy(true);
    setError(null);
    try {
      const issued = await api<PracticeJoinCode>(`/api/v1/dietitian/${dietitianAccountId}/join-code`, {
        method: "POST",
      });
      if (issued.code) {
        sessionStorage.setItem(practiceCodeStorageKey(dietitianAccountId), issued.code);
      }
      setJoinCode(issued);
      setPlainJoinCode(issued.code);
      setJoinOpen(true);
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
      const result = await api<PracticeJoinCode>(`/api/v1/dietitian/${dietitianAccountId}/join-code`, {
        method: "DELETE",
      });
      sessionStorage.removeItem(practiceCodeStorageKey(dietitianAccountId));
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

  function clearFilters() {
    setQ("");
    setStatus("");
    setTagId("");
    setPage(1);
  }

  return (
    <section className="ui-clients">
      <PageHeader
        title="Clients"
        description="People appear here after they create an account and enter your clinic join code."
        actions={
          <div className="ui-clients__header-actions">
            {allowCreate ? (
              <div className="ui-clients__join">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  aria-expanded={joinOpen}
                  onClick={() => {
                    setTagsOpen(false);
                    setJoinOpen((open) => !open);
                  }}
                >
                  {joinActive ? "Join code" : "Clinic join code"}
                  {joinActive && joinCode?.hint ? (
                    <span className="ui-clients__join-chip">··{joinCode.hint}</span>
                  ) : null}
                </Button>
                {joinOpen ? (
                  <div className="ui-clients__join-panel" role="dialog" aria-label="Clinic join code">
                    <button
                      type="button"
                      className="ui-clients__join-close"
                      aria-label="Close"
                      onClick={() => setJoinOpen(false)}
                    >
                      ×
                    </button>
                    <p className="ui-clients__join-copy">
                      Share this code so patients can connect after they sign in.
                    </p>
                    {plainJoinCode ? (
                      <code className="ui-clients__join-code">{plainJoinCode}</code>
                    ) : joinCode?.hint ? (
                      <p className="ui-muted" style={{ margin: 0 }}>
                        Active code ending in <strong>{joinCode.hint}</strong>
                      </p>
                    ) : (
                      <p className="ui-muted" style={{ margin: 0 }}>
                        No join code active yet.
                      </p>
                    )}
                    {joinCode?.expiresAt ? (
                      <p className="ui-clients__join-meta">
                        {joinCode.status === "expired" ? "Expired" : "Expires"}{" "}
                        {new Date(joinCode.expiresAt).toLocaleString()}
                      </p>
                    ) : null}
                    <div className="ui-clients__join-actions">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={inviteBusy}
                        onClick={() => void generatePracticeCode()}
                      >
                        {joinActive ? "Regenerate" : "Generate"}
                      </Button>
                      {plainJoinCode ? (
                        <Button type="button" size="sm" variant="secondary" onClick={() => void handleCopy()}>
                          {copied ? "Copied" : "Copy"}
                        </Button>
                      ) : null}
                      {joinActive ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={inviteBusy}
                          onClick={() => setConfirmRevoke(true)}
                        >
                          Revoke
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {allowCreate ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-expanded={tagsOpen}
                onClick={() => {
                  setJoinOpen(false);
                  setTagsOpen((open) => !open);
                }}
              >
                Manage tags
              </Button>
            ) : null}
            {allowCreate ? (
              <Link href={`/practice/${dietitianAccountId}/clients/new`} className="ui-btn ui-btn--secondary ui-btn--sm">
                Create manual client
              </Link>
            ) : null}
          </div>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {tagsOpen && allowCreate ? (
        <div className="ui-clients__tags-panel">
          <div className="ui-clients__tags-panel-head">
            <div>
              <h2 className="ui-clients__tags-panel-title">Clinic tags</h2>
              <p className="ui-muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                Create labels you can assign to clients. Edit or remove anytime.
              </p>
            </div>
            <button
              type="button"
              className="ui-clients__join-close"
              aria-label="Close"
              onClick={() => setTagsOpen(false)}
            >
              ×
            </button>
          </div>
          <ClinicTagsManager
            dietitianAccountId={dietitianAccountId}
            tags={tags}
            onChange={(next) => {
              setTags(next);
              if (tagId && !next.some((tag) => tag.id === tagId)) {
                setTagId("");
                setPage(1);
              }
              void load();
            }}
          />
        </div>
      ) : null}

      <div className="ui-clients__toolbar">
        <div className="ui-clients__search">
          <SearchInput
            value={q}
            onChange={(value) => {
              setQ(value);
              setPage(1);
            }}
            placeholder="Search name or email…"
            aria-label="Search clients"
          />
        </div>
        <div className="ui-clients__filters">
          <Select
            value={status}
            aria-label="Status"
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
          {tags.length > 0 ? (
            <Select
              value={tagId}
              aria-label="Tag"
              onChange={(event) => {
                setTagId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All tags</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </Select>
          ) : null}
          {hasFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          ) : null}
        </div>
        <p className="ui-clients__count">
          {data ? `${data.total} client${data.total === 1 ? "" : "s"}` : "—"}
        </p>
      </div>

      {(data?.items ?? []).length === 0 ? (
        <EmptyState
          title={hasFilters ? "No clients match these filters" : "No clients yet"}
          action={
            allowCreate && !hasFilters ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setJoinOpen(true);
                  void generatePracticeCode();
                }}
              >
                Generate a join code
              </Button>
            ) : undefined
          }
        >
          {hasFilters
            ? "Try adjusting your search or clearing the filters."
            : "Share your clinic join code with clients. Manual charts are a secondary option."}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
              <th>Tags</th>
              <th>Portal</th>
              <th style={{ width: "1%" }} />
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((row) => (
              <tr key={row.id}>
                <Td label="Name">
                  <Link
                    href={`/practice/${dietitianAccountId}/clients/${row.id}`}
                    className="ui-link"
                    style={{ fontWeight: 500 }}
                  >
                    {row.displayName ?? `${row.firstName} ${row.lastName}`}
                  </Link>
                </Td>
                <Td label="Email">
                  {row.email ? <span className="ui-muted">{row.email}</span> : <span className="ui-muted">—</span>}
                </Td>
                <Td label="Status">
                  <StatusBadge status={row.status} label={humanizeLabel(row.status)} />
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
                    href={`/practice/${dietitianAccountId}/clients/${row.id}?tab=portal`}
                    className="ui-link"
                    style={{ fontSize: "0.875rem" }}
                  >
                    {portalStatusLabel(row.connectionStatus)}
                  </Link>
                </Td>
                <Td label="Actions">
                  <Link
                    href={`/practice/${dietitianAccountId}/clients/${row.id}`}
                    className="ui-btn ui-btn--ghost ui-btn--sm"
                  >
                    View
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {(data?.total ?? 0) > 0 ? (
        <div className="ui-clients__pager">
          <span className="ui-muted" style={{ fontSize: "0.875rem" }}>
            Page {data?.page ?? 1} of {pageCount}
          </span>
          <div className="ui-row">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmRevoke}
        title="Revoke this join code?"
        description="People who still have the old code will not be able to join until you generate a new one."
        confirmLabel="Revoke code"
        pending={inviteBusy}
        onConfirm={() => void revokePracticeCode()}
        onCancel={() => setConfirmRevoke(false)}
      />
    </section>
  );
}
