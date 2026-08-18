"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { buttonStyle, cellStyle, inputStyle, tableStyle } from "../admin-shell";

interface PlanRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  _count?: { subscriptions: number };
}

export default function AdminPlansPage() {
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setRows(await api<PlanRow[]>("/api/v1/admin/plans"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load plans");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    await api("/api/v1/admin/plans", {
      method: "POST",
      body: JSON.stringify({ name, slug }),
    });
    setName("");
    setSlug("");
    await load();
  }

  return (
    <section>
      <h1>Plans</h1>
      <p style={{ color: "var(--color-muted)" }}>
        Referenced plans cannot be deleted. Deactivate or archive instead. Existing subscriptions keep working.
      </p>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
      <form onSubmit={(event) => void onCreate(event)} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input style={inputStyle} value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" required />
        <input style={inputStyle} value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="slug" required />
        <button type="submit" style={buttonStyle}>
          Create
        </button>
      </form>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={cellStyle}>Plan</th>
            <th style={cellStyle}>Status</th>
            <th style={cellStyle}>Subscriptions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td style={cellStyle}>
                <Link href={`/admin/plans/${row.id}`} style={{ color: "var(--color-accent)" }}>
                  {row.name}
                </Link>{" "}
                ({row.slug})
              </td>
              <td style={cellStyle}>{row.status}</td>
              <td style={cellStyle}>{row._count?.subscriptions ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
