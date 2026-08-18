"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { buttonStyle, cellStyle, inputStyle, tableStyle } from "../admin-shell";

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
        <input style={inputStyle} value={key} onChange={(event) => setKey(event.target.value)} placeholder="KEY" required />
        <input style={inputStyle} value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" required />
        <select style={inputStyle} value={valueType} onChange={(event) => setValueType(event.target.value as "BOOLEAN" | "LIMIT")}>
          <option value="BOOLEAN">BOOLEAN</option>
          <option value="LIMIT">LIMIT</option>
        </select>
        <button type="submit" style={buttonStyle}>
          Create
        </button>
      </form>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={cellStyle}>Key</th>
            <th style={cellStyle}>Type</th>
            <th style={cellStyle}>Status</th>
            <th style={cellStyle}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td style={cellStyle}>{row.key}</td>
              <td style={cellStyle}>{row.valueType}</td>
              <td style={cellStyle}>{row.status}</td>
              <td style={cellStyle}>
                <button type="button" style={buttonStyle} onClick={() => void setStatus(row.id, row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}>
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
