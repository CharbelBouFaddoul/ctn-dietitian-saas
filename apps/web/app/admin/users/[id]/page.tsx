"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
import { buttonStyle, cellStyle, tableStyle } from "../../admin-shell";

interface UserDetail {
  id: string;
  email: string;
  status: string;
  platformRole: string | null;
  memberships: Array<{
    id: string;
    organizationId: string;
    organizationName: string;
    role: string;
    status: string;
  }>;
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setUser(await api<UserDetail>(`/api/v1/admin/users/${params.id}`));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load user");
    }
  }

  useEffect(() => {
    void load();
  }, [params.id]);

  async function setStatus(status: "ACTIVE" | "SUSPENDED" | "ARCHIVED") {
    await api(`/api/v1/admin/users/${params.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await load();
  }

  if (!user) {
    return <p>{error ?? "Loading…"}</p>;
  }

  return (
    <section>
      <h1>{user.email}</h1>
      <p>
        {user.status} · platform role {user.platformRole ?? "none"}
      </p>
      <p style={{ color: "var(--color-muted)" }}>
        Organization roles are not editable here. Membership stays organization-scoped.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" style={buttonStyle} onClick={() => void setStatus("ACTIVE")}>
          Activate
        </button>
        <button type="button" style={buttonStyle} onClick={() => void setStatus("SUSPENDED")}>
          Suspend
        </button>
        <button type="button" style={buttonStyle} onClick={() => void setStatus("ARCHIVED")}>
          Archive
        </button>
      </div>
      <h2>Organizations</h2>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={cellStyle}>Organization</th>
            <th style={cellStyle}>Role</th>
            <th style={cellStyle}>Membership</th>
          </tr>
        </thead>
        <tbody>
          {user.memberships.map((membership) => (
            <tr key={membership.id}>
              <td style={cellStyle}>{membership.organizationName}</td>
              <td style={cellStyle}>{membership.role}</td>
              <td style={cellStyle}>{membership.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
