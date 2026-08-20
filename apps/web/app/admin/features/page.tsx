"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "../../../lib/api";
interface FeatureRow {
  id: string;
  key: string;
  name: string;
  valueType: string;
  status: string;
}

export default function AdminFeaturesPage() {
  const [rows, setRows] = useState<FeatureRow[]>([]);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [valueType, setValueType] = useState<"BOOLEAN" | "LIMIT">("BOOLEAN");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setRows(await api<FeatureRow[]>("/api/v1/admin/features"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load features");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    await api("/api/v1/admin/features", {
      method: "POST",
      body: JSON.stringify({ key, name, valueType }),
    });
    setKey("");
    setName("");
    await load();
  }

  async function setStatus(id: string, status: "ACTIVE" | "INACTIVE") {
    await api(`/api/v1/admin/features/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await load();
  }

  return (
    <section>
      <h1>Features</h1>
      <p style={{ color: "var(--color-muted)" }}>
        Global catalog status is separate from organization entitlement. Disabling a feature globally still goes
        through EntitlementService and denies access.
      </p>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
      <form onSubmit={(event) => void onCreate(event)} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input className="ui-input" value={key} onChange={(event) => setKey(event.target.value)} placeholder="KEY" required />
        <input className="ui-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" required />
        <select className="ui-input" value={valueType} onChange={(event) => setValueType(event.target.value as "BOOLEAN" | "LIMIT")}>
          <option value="BOOLEAN">BOOLEAN</option>
          <option value="LIMIT">LIMIT</option>
        </select>
        <button type="submit" className="ui-btn ui-btn--primary">
          Create
        </button>
      </form>
      <table className="ui-table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Type</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.key}</td>
              <td>{row.valueType}</td>
              <td>{row.status}</td>
              <td>
                <button type="button" className="ui-btn ui-btn--primary" onClick={() => void setStatus(row.id, row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}>
                  {row.status === "ACTIVE" ? "Deactivate" : "Activate"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
