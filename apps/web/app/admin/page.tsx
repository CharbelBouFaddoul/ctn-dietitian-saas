"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, PageHeader, StatCard } from "@nutrition-saas/ui";
import { api, API_URL } from "../../lib/api";
import { errorMessage } from "../../lib/humanize-error";

interface ListResponse {
  total?: number;
  items?: unknown[];
}

export default function AdminHomePage() {
  const [orgs, setOrgs] = useState<number | null>(null);
  const [users, setUsers] = useState<number | null>(null);
  const [subs, setSubs] = useState<number | null>(null);
  const [health, setHealth] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [orgList, userList, subList] = await Promise.all([
          api<ListResponse | unknown[]>("/api/v1/admin/organizations"),
          api<ListResponse | unknown[]>("/api/v1/admin/users"),
          api<ListResponse | unknown[]>("/api/v1/admin/subscriptions"),
        ]);
        setOrgs(Array.isArray(orgList) ? orgList.length : (orgList.items?.length ?? orgList.total ?? 0));
        setUsers(Array.isArray(userList) ? userList.length : (userList.items?.length ?? userList.total ?? 0));
        setSubs(Array.isArray(subList) ? subList.length : (subList.items?.length ?? subList.total ?? 0));
      } catch (err) {
        setError(errorMessage(err, "Unable to load overview"));
      }
      try {
        const result = await fetch(`${API_URL}/health`).then((res) => res.json()) as { status?: string };
        setHealth(result.status === "ok" ? "Healthy" : "Degraded");
      } catch {
        setHealth("Unavailable");
      }
    })();
  }, []);

  return (
    <section>
      <PageHeader
        eyebrow="Platform"
        title="Overview"
        description="Organizations, members, and subscriptions across the platform."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="ui-grid">
        <StatCard label="Organizations" value={orgs ?? "—"} />
        <StatCard label="Users" value={users ?? "—"} />
        <StatCard label="Subscriptions" value={subs ?? "—"} />
        <StatCard label="System" value={health ?? "—"} />
      </div>
      <div className="ui-row" style={{ marginTop: 24 }}>
        <Link href="/admin/organizations" className="ui-btn ui-btn--secondary">
          Organizations
        </Link>
        <Link href="/admin/users" className="ui-btn ui-btn--secondary">
          Users
        </Link>
        <Link href="/admin/audit" className="ui-btn ui-btn--secondary">
          Audit
        </Link>
        <Link href="/admin/health" className="ui-btn ui-btn--secondary">
          System health
        </Link>
      </div>
    </section>
  );
}
