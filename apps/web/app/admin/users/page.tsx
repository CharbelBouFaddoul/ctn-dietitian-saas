"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { buttonStyle, cellStyle, inputStyle, tableStyle } from "../admin-shell";

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
        <input style={inputStyle} value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search email" />
        <button type="submit" style={buttonStyle}>
          Search
        </button>
      </form>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={cellStyle}>Email</th>
            <th style={cellStyle}>Status</th>
            <th style={cellStyle}>Platform role</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td style={cellStyle}>
                <Link href={`/admin/users/${row.id}`} style={{ color: "var(--color-accent)" }}>
                  {row.email}
                </Link>
              </td>
              <td style={cellStyle}>{row.status}</td>
              <td style={cellStyle}>{row.platformRole ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
