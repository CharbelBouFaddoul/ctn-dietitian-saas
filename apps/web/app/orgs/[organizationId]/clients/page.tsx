"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
import { buttonStyle, cellStyle, fieldStyle, inputStyle, tableStyle } from "../practice-shell";

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

export default function ClientsPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [tagId, setTagId] = useState("");
  const [assignedMemberId, setAssignedMemberId] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      const [list, tagRows, memberRows] = await Promise.all([
        api<ListResponse>(`/api/v1/organizations/${organizationId}/clients?${query}`),
        api<Tag[]>(`/api/v1/organizations/${organizationId}/tags`),
        api<Member[]>(`/api/v1/organizations/${organizationId}/members`),
      ]);
      setData(list);
      setTags(tagRows);
      setMembers(memberRows.filter((row) => row.status === "ACTIVE"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load clients");
    }
  }

  useEffect(() => {
    void load();
  }, [organizationId, query]);

  function onFilter(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    void load();
  }

  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / 20));

  return (
    <section>
      <h1>Clients</h1>
      <p>
        <Link href={`/orgs/${organizationId}/clients/new`} style={{ color: "var(--color-accent)" }}>
          New client
        </Link>
      </p>
      <form onSubmit={onFilter} style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <label style={fieldStyle}>
          Search
          <input style={inputStyle} value={q} onChange={(event) => setQ(event.target.value)} />
        </label>
        <label style={fieldStyle}>
          Status
          <select style={inputStyle} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </label>
        <label style={fieldStyle}>
          Tag
          <select style={inputStyle} value={tagId} onChange={(event) => setTagId(event.target.value)}>
            <option value="">All</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          Assigned
          <select
            style={inputStyle}
            value={assignedMemberId}
            onChange={(event) => setAssignedMemberId(event.target.value)}
          >
            <option value="">All</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.email} ({member.role})
              </option>
            ))}
          </select>
        </label>
        <button type="submit" style={buttonStyle}>
          Apply filters
        </button>
      </form>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={cellStyle}>Name</th>
            <th style={cellStyle}>Status</th>
            <th style={cellStyle}>Assigned</th>
            <th style={cellStyle}>Tags</th>
            <th style={cellStyle}>Portal</th>
          </tr>
        </thead>
        <tbody>
          {(data?.items ?? []).map((row) => (
            <tr key={row.id}>
              <td style={cellStyle}>
                <Link href={`/orgs/${organizationId}/clients/${row.id}`} style={{ color: "var(--color-accent)" }}>
                  {row.displayName ?? `${row.firstName} ${row.lastName}`}
                </Link>
              </td>
              <td style={cellStyle}>{row.status}</td>
              <td style={cellStyle}>{row.assignedTo?.email ?? "—"}</td>
              <td style={cellStyle}>{row.tags.map((tag) => tag.name).join(", ") || "—"}</td>
              <td style={cellStyle}>{row.portalStatus ?? "none"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(data?.items ?? []).length === 0 ? <p>No clients match these filters.</p> : null}
      <p>
        Page {data?.page ?? 1} of {pageCount} ({data?.total ?? 0} total)
        <button type="button" style={{ ...buttonStyle, marginLeft: 12 }} disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <button
          type="button"
          style={{ ...buttonStyle, marginLeft: 8 }}
          disabled={page >= pageCount}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </p>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
    </section>
  );
}
