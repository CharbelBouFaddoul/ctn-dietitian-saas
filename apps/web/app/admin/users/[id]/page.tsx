"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  Button,
  EmptyState,
  LoadingState,
  PageHeader,
  Section,
  StatusBadge,
  Table,
  Td,
} from "@nutrition-saas/ui";
import { roleLabel, statusLabel } from "../../../../lib/admin-labels";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";

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
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setUser(await api<UserDetail>(`/api/v1/admin/users/${params.id}`));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to load user"));
    }
  }

  useEffect(() => {
    void load();
  }, [params.id]);

  async function setStatus(status: "ACTIVE" | "SUSPENDED" | "ARCHIVED") {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/admin/users/${params.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to update user"));
    } finally {
      setBusy(false);
    }
  }

  if (!user && !error) {
    return <LoadingState>Loading user…</LoadingState>;
  }

  if (!user) {
    return (
      <section>
        <PageHeader title="User" description="Unable to load this user." />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Link href="/admin/users" className="ui-link">
          Back to users
        </Link>
      </section>
    );
  }

  return (
    <section>
      <PageHeader
        eyebrow="Platform"
        title={user.email}
        description={`${statusLabel(user.status)} · ${roleLabel(user.platformRole) || "No platform role"}`}
        actions={
          <Link href="/admin/users" className="ui-btn ui-btn--secondary ui-btn--sm">
            Back
          </Link>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Section title="Account status" tone="mint" description="Organization roles are not editable here. Membership stays organization-scoped.">
        <div className="ui-row" style={{ marginBottom: 12 }}>
          <StatusBadge status={user.status} label={statusLabel(user.status)} />
          {user.platformRole ? <StatusBadge status="ACTIVE" label={roleLabel(user.platformRole)} /> : null}
        </div>
        <div className="ui-admin-actions">
          <Button disabled={busy} onClick={() => void setStatus("ACTIVE")}>
            Activate
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void setStatus("SUSPENDED")}>
            Suspend
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void setStatus("ARCHIVED")}>
            Archive
          </Button>
        </div>
      </Section>

      <Section title="Organizations">
        {user.memberships.length === 0 ? (
          <EmptyState title="No memberships">This user is not in any organization yet.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Organization</th>
                <th>Role</th>
                <th>Membership</th>
              </tr>
            </thead>
            <tbody>
              {user.memberships.map((membership) => (
                <tr key={membership.id}>
                  <Td label="Organization">
                    <Link href={`/admin/organizations/${membership.organizationId}`} className="ui-link">
                      {membership.organizationName}
                    </Link>
                  </Td>
                  <Td label="Role">{roleLabel(membership.role)}</Td>
                  <Td label="Membership">
                    <StatusBadge status={membership.status} label={statusLabel(membership.status)} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </section>
  );
}
