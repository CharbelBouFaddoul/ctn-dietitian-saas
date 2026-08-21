"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Alert,
  Button,
  ConfirmDialog,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Section,
  StatusBadge,
} from "@nutrition-saas/ui";
import { roleLabel, statusLabel } from "../../../../../lib/admin-labels";
import { api } from "../../../../../lib/api";
import { errorMessage } from "../../../../../lib/humanize-error";

interface AdminDetail {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  platformRole: string | null;
}

export default function SiteAdminDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<AdminDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  function applyDraft(data: AdminDetail) {
    setFirstName(data.firstName ?? "");
    setLastName(data.lastName ?? "");
    setEmail(data.email);
    setPassword("");
  }

  async function load() {
    try {
      const data = await api<AdminDetail>(`/api/v1/admin/users/${params.id}`);
      if (!data.platformRole) {
        router.replace(`/admin/users/${params.id}`);
        return;
      }
      setUser(data);
      applyDraft(data);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to load admin"));
    }
  }

  useEffect(() => {
    void load();
  }, [params.id]);

  async function setStatus(status: "ACTIVE" | "SUSPENDED" | "ARCHIVED") {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api(`/api/v1/admin/users/${params.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setMessage("Account status updated.");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to update admin"));
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api(`/api/v1/admin/users/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          email: email.trim(),
          password: password.trim() || undefined,
        }),
      });
      setEditing(false);
      setPassword("");
      setMessage("Admin profile saved.");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to save admin profile"));
    } finally {
      setBusy(false);
    }
  }

  async function removeAdminAccess() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api(`/api/v1/admin/users/${params.id}/platform-role`, {
        method: "PATCH",
        body: JSON.stringify({ platformRole: null }),
      });
      setConfirmDelete(false);
      router.push("/admin/site-settings?tab=admins");
    } catch (err) {
      setError(errorMessage(err, "Unable to remove admin access"));
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  if (!user && !error) {
    return <LoadingState>Loading admin…</LoadingState>;
  }

  if (!user) {
    return (
      <section>
        <PageHeader eyebrow="Configuration" title="Admin" description="Unable to load this admin." />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Link href="/admin/site-settings?tab=admins" className="ui-link">
          Back to admins
        </Link>
      </section>
    );
  }

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ");

  return (
    <section>
      <PageHeader
        eyebrow="Configuration"
        title={displayName || user.email}
        description={`${user.email} · ${statusLabel(user.status)} · ${roleLabel(user.platformRole)}`}
        actions={
          <Link href="/admin/site-settings?tab=admins" className="ui-btn ui-btn--secondary ui-btn--sm">
            Back to admins
          </Link>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      <Section
        title="Platform admin"
        tone="mint"
        description="Platform console operators do not need a dietitian practice."
        actions={
          <div className="ui-row">
            {!editing ? (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : null}
            <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          </div>
        }
      >
        <div className="ui-row" style={{ marginBottom: 12 }}>
          <StatusBadge status={user.status} label={statusLabel(user.status)} />
          <StatusBadge status="ACTIVE" label={roleLabel(user.platformRole)} />
        </div>

        {editing ? (
          <form onSubmit={(event) => void saveProfile(event)} className="ui-stack" style={{ maxWidth: 420, marginBottom: 16 }}>
            <Field label="First name">
              <Input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
            </Field>
            <Field label="Last name">
              <Input value={lastName} onChange={(event) => setLastName(event.target.value)} />
            </Field>
            <Field label="Email">
              <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </Field>
            <Field label="New password" hint="Leave blank to keep the current password.">
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="Optional"
              />
            </Field>
            <div className="ui-row">
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  applyDraft(user);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="ui-admin-meta" style={{ marginBottom: 16 }}>
            <div className="ui-admin-meta__row">
              <dt>Name</dt>
              <dd>{displayName || "—"}</dd>
            </div>
            <div className="ui-admin-meta__row">
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div className="ui-admin-meta__row">
              <dt>Role</dt>
              <dd>Admin</dd>
            </div>
            <div className="ui-admin-meta__row">
              <dt>Password</dt>
              <dd>••••••••</dd>
            </div>
          </div>
        )}

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

      <ConfirmDialog
        open={confirmDelete}
        title="Remove platform admin?"
        description={`Delete removes platform console access for ${user.email}. The user account remains; they will no longer be able to open /admin.`}
        confirmLabel="Delete admin access"
        danger
        pending={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void removeAdminAccess()}
      />
    </section>
  );
}
