"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { buttonStyle, cellStyle, inputStyle, tableStyle } from "../admin-shell";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  subscription: { status: string; plan: { name: string; slug: string } } | null;
}

export default function AdminOrganizationsPage() {
  const [rows, setRows] = useState<OrgRow[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load(search = q) {
    try {
      const path = search ? `/api/v1/admin/organizations?q=${encodeURIComponent(search)}` : "/api/v1/admin/organizations";
      setRows(await api<OrgRow[]>(path));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load organizations");
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
      <h1>Organizations</h1>
      <form onSubmit={onSearch} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input style={inputStyle} value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search name or slug" />
        <button type="submit" style={buttonStyle}>
          Search
        </button>
      </form>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={cellStyle}>Name</th>
            <th style={cellStyle}>Status</th>
            <th style={cellStyle}>Plan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td style={cellStyle}>
                <Link href={`/admin/organizations/${row.id}`} style={{ color: "var(--color-accent)" }}>
                  {row.name}
                </Link>
              </td>
              <td style={cellStyle}>{row.status}</td>
              <td style={cellStyle}>
                {row.subscription ? `${row.subscription.plan.name} (${row.subscription.status})` : "None"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
