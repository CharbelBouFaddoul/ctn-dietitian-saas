"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { AuthShell, buttonStyle, fieldStyle, inputStyle } from "../auth/auth-shell";

interface Org {
  id: string;
  name: string;
  slug: string;
  status: string;
  role: string;
}

const defaultSettings = {
  timezone: "UTC",
  locale: "en",
  currency: "USD",
  weightUnit: "kg",
  heightUnit: "cm",
  dateFormat: "YYYY_MM_DD",
};

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const list = await api<Org[]>("/api/v1/organizations");
      setOrgs(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load organizations");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api("/api/v1/organizations", {
        method: "POST",
        body: JSON.stringify({ name, settings: defaultSettings }),
      });
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <AuthShell title="Organizations">
      <p style={{ color: "var(--color-muted)", marginTop: 0 }}>
        Phase 5 practice workspace. Sign in first. Clients are not organization members.
      </p>
      <ul>
        {orgs.map((org) => (
          <li key={org.id}>
            <Link href={`/orgs/${org.id}`} style={{ color: "var(--color-accent)" }}>
              {org.name}
            </Link>{" "}
            ({org.role}, {org.status})
          </li>
        ))}
      </ul>
      <form onSubmit={(event) => void onSubmit(event)}>
        <label style={fieldStyle}>
          New organization
          <input
            style={inputStyle}
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={2}
            required
          />
        </label>
        <button type="submit" style={buttonStyle}>
          Create organization
        </button>
      </form>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
    </AuthShell>
  );
}
