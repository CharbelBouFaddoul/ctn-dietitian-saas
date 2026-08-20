"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
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
        <input className="ui-input" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search name or slug" />
        <button type="submit" className="ui-btn ui-btn--primary">
          Search
        </button>
      </form>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
      <table className="ui-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Plan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <Link href={`/admin/organizations/${row.id}`} style={{ color: "var(--color-accent)" }}>
                  {row.name}
                </Link>
              </td>
              <td>{row.status}</td>
              <td>
                {row.subscription ? `${row.subscription.plan.name} (${row.subscription.status})` : "None"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
