"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Button,
  EmptyState,
  LoadingState,
  Section,
  StatusBadge,
  Table,
  Td,
} from "@nutrition-saas/ui";
import { AdminPage } from "../../_components/admin-page";
import { roleLabel, scopedStatusLabel } from "../../../../lib/admin-labels";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";

interface UserDetail {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  platformRole: string | null;
  accountType?: "admin" | "dietitian" | "patient" | "both" | "none";
  dietitianAccount: {
    id: string;
    displayName: string;
    slug: string;
    status: string;
  } | null;
  clientAccounts?: Array<{
    id: string;
    status: string;
    practiceName: string;
    practiceId: string;
    clientName: string;
  }>;
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const data = await api<UserDetail>(`/api/v1/admin/users/${params.id}`);
      if (data.platformRole) {
        router.replace(`/admin/site-settings/admins/${data.id}`);
        return;
      }
      setUser(data);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to load account"));
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
      setError(errorMessage(err, "Unable to update account"));
    } finally {
      setBusy(false);
    }
  }

  if (!user && !error) {
    return <LoadingState>Loading account…</LoadingState>;
  }

  if (!user) {
    return (
      <AdminPage title="Account" description="Unable to load this account." error={error}>
        <Link href="/admin/users" className="ui-link">
          Back to accounts
        </Link>
      </AdminPage>
    );
  }

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const typeLabel =
    user.accountType === "patient" ? "Patient" : user.accountType === "both" ? "Dietitian & patient" : "Dietitian";

  return (
    <AdminPage
      eyebrow="People"
      title={displayName || user.email}
      description={`${user.email} · ${typeLabel}`}
      error={error}
      crumbs={[
        { href: "/admin/users", label: "Accounts" },
        { label: displayName || user.email },
      ]}
      actions={
        <Link href="/admin/users" className="ui-btn ui-btn--secondary ui-btn--sm">
          Back to accounts
        </Link>
      }
    >
      <Section title="Login status" tone="mint" description="Activate, suspend, or archive this dietitian or patient login.">
        <div className="ui-row" style={{ marginBottom: 12 }}>
          <StatusBadge status={user.status} label={scopedStatusLabel("login", user.status)} />
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

      {user.dietitianAccount ? (
        <Section title="Clinic">
          <Table>
            <thead>
              <tr>
                <th>Clinic</th>
                <th>Role</th>
                <th>Clinic status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td label="Clinic">
                  <Link href={`/admin/dietitians/${user.dietitianAccount.id}?tab=access`} className="ui-link">
                    {user.dietitianAccount.displayName}
                  </Link>
                </Td>
                <Td label="Role">{roleLabel("OWNER")}</Td>
                <Td label="Clinic status">
                  <StatusBadge
                    status={user.dietitianAccount.status}
                    label={scopedStatusLabel("clinic", user.dietitianAccount.status)}
                  />
                </Td>
              </tr>
            </tbody>
          </Table>
        </Section>
      ) : null}

      {user.clientAccounts && user.clientAccounts.length > 0 ? (
        <Section title="Patient charts">
          <Table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Clinic</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {user.clientAccounts.map((account) => (
                <tr key={account.id}>
                  <Td label="Client">{account.clientName || "—"}</Td>
                  <Td label="Clinic">
                    <Link href={`/admin/dietitians/${account.practiceId}`} className="ui-link">
                      {account.practiceName}
                    </Link>
                  </Td>
                  <Td label="Status">
                    <StatusBadge status={account.status} label={scopedStatusLabel("clinic", account.status)} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      ) : null}

      {!user.dietitianAccount && (!user.clientAccounts || user.clientAccounts.length === 0) ? (
        <Section title="Linked records">
          <EmptyState title="No clinic or patient link">
            This login is not connected to a dietitian clinic or patient chart.
          </EmptyState>
        </Section>
      ) : null}
    </AdminPage>
  );
}
