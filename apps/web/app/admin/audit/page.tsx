"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "../../../lib/api";
interface AuditRow {
  id: string;
  action: string;
  result: string;
  targetType: string | null;
  createdAt: string;
  actor: { email: string } | null;
  organization: { name: string } | null;
  metadata: Record<string, unknown> | null;
}

export default function AdminAuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load(search = q) {
    try {
      const path = search ? `/api/v1/admin/audit?q=${encodeURIComponent(search)}` : "/api/v1/admin/audit";
      setRows(await api<AuditRow[]>(path));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load audit logs");
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
      <h1>Audit</h1>
      <form onSubmit={onSearch} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input className="ui-input" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search action" />
        <button type="submit" className="ui-btn ui-btn--primary">
          Search
        </button>
      </form>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
      <table className="ui-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Action</th>
            <th>Actor</th>
            <th>Organization</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.createdAt}</td>
              <td>{row.action}</td>
              <td>{row.actor?.email ?? "—"}</td>
              <td>{row.organization?.name ?? "—"}</td>
              <td>{row.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
