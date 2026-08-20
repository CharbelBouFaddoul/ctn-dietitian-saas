"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
interface UserRow {
  id: string;
  email: string;
  status: string;
  platformRole: string | null;
}

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load(search = q) {
    try {
      const path = search ? `/api/v1/admin/users?q=${encodeURIComponent(search)}` : "/api/v1/admin/users";
      setRows(await api<UserRow[]>(path));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load users");
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
      <h1>Users</h1>
      <form onSubmit={onSearch} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input className="ui-input" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search email" />
        <button type="submit" className="ui-btn ui-btn--primary">
          Search
        </button>
      </form>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
      <table className="ui-table">
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
              <td>
                <Link href={`/admin/users/${row.id}`} style={{ color: "var(--color-accent)" }}>
                  {row.email}
                </Link>
              </td>
              <td>{row.status}</td>
              <td>{row.platformRole ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
