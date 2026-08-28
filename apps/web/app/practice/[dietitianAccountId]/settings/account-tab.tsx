"use client";

import { FormEvent, useState } from "react";
import { Alert, Button, Field, Input, PasswordInput, Section } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { PROFILE_FORM_ID, type ProfileEditorMode } from "./profile-types";

export function AccountTab({
  email,
  editing,
  onSaved,
  onSaving,
}: {
  email: string | null;
} & ProfileEditorMode) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  async function onChangePassword(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    onSaving(true);
    setError(null);
    setSaved(null);
    try {
      await api("/api/v1/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setSaved("Password updated");
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "Unable to change password"));
    } finally {
      onSaving(false);
    }
  }

  async function onRevokeOthers() {
    if (!editing) return;
    setRevoking(true);
    setError(null);
    setSaved(null);
    try {
      await api("/api/v1/auth/sessions/revoke-others", { method: "POST" });
      setSaved("Other sessions signed out");
    } catch (err) {
      setError(errorMessage(err, "Unable to sign out other sessions"));
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="ui-profile-hub__stack">
      <Section title="Sign-in" description="Change email on Your profile.">
        <Field label="Email">
          <Input className="ui-profile-readonly" value={email ?? ""} readOnly disabled />
        </Field>
        {editing ? (
          <form id={PROFILE_FORM_ID} onSubmit={(event) => void onChangePassword(event)} className="ui-profile-hub__stack">
            <Field label="Current password">
              <PasswordInput
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="New password">
              <PasswordInput
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
          </form>
        ) : null}
      </Section>
      {editing ? (
        <Section title="Sessions">
          <Button type="button" variant="secondary" disabled={revoking} onClick={() => void onRevokeOthers()}>
            {revoking ? "Signing out…" : "Sign out other sessions"}
          </Button>
        </Section>
      ) : null}
      {saved ? <p className="ui-muted">{saved}</p> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
