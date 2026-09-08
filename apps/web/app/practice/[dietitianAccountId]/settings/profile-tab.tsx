"use client";

import { FormEvent, useState } from "react";
import { Alert, AppearanceToggle, Button, Field, Input, PasswordInput, Section } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { SettingsAffects, SettingsLead, SettingsNote } from "./settings-copy";
import {
  PROFILE_FORM_ID,
  PROFILE_PASSWORD_FORM_ID,
  type DietitianProfile,
  type ProfileEditorMode,
} from "./profile-types";

export function ProfileTab({
  dietitianAccountId,
  profile,
  onProfile,
  editing,
  onSaved,
  onSaving,
}: {
  dietitianAccountId: string;
  profile: DietitianProfile;
  onProfile: (next: DietitianProfile) => void;
} & ProfileEditorMode) {
  const [error, setError] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState(profile.email ?? "");
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const emailChanged = (profile.email ?? "").trim().toLowerCase() !== loginEmail.trim().toLowerCase();

  function set<K extends keyof DietitianProfile>(key: K, value: DietitianProfile[K]) {
    onProfile({ ...profile, [key]: value });
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    if (emailChanged && !emailPassword) {
      setError("Enter your current password to change your login email.");
      return;
    }
    onSaving(true);
    setError(null);
    try {
      let nextEmail = profile.email;
      if (emailChanged) {
        const changed = await api<{ email: string }>("/api/v1/auth/change-email", {
          method: "POST",
          body: JSON.stringify({ email: profile.email, currentPassword: emailPassword }),
        });
        nextEmail = changed.email;
        setLoginEmail(changed.email);
        setEmailPassword("");
      }
      const updated = await api<DietitianProfile>(`/api/v1/dietitian/${dietitianAccountId}`, {
        method: "PATCH",
        body: JSON.stringify({
          firstName: profile.firstName,
          lastName: profile.lastName,
          phone: profile.phone,
          professionalTitle: profile.professionalTitle,
          specialization: profile.specialization,
          country: profile.country,
          licenseNumber: profile.licenseNumber,
        }),
      });
      onProfile({ ...profile, ...updated, email: nextEmail });
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "Unable to save profile"));
    } finally {
      onSaving(false);
    }
  }

  async function onChangePassword(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setPasswordSaving(true);
    setError(null);
    setAccountMessage(null);
    try {
      await api("/api/v1/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setAccountMessage("Password updated.");
    } catch (err) {
      setError(errorMessage(err, "Unable to change password"));
    } finally {
      setPasswordSaving(false);
    }
  }

  async function onRevokeOthers() {
    if (!editing) return;
    setRevoking(true);
    setError(null);
    setAccountMessage(null);
    try {
      await api("/api/v1/auth/sessions/revoke-others", { method: "POST" });
      setAccountMessage("Other sessions signed out.");
    } catch (err) {
      setError(errorMessage(err, "Unable to sign out other sessions"));
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="ui-profile-hub__stack">
      <SettingsLead
        affects={["Client portal", "Shared meal plans", "Messages", "Printed charts", "This browser"]}
      >
        Your name, title, and sign-in. Clients see this identity on the portal, shared plans, and messages.
        Theme stays on this device only.
      </SettingsLead>
      <form id={PROFILE_FORM_ID} onSubmit={(event) => void onSave(event)}>
        <fieldset disabled={!editing}>
          <Section
            title="Identity"
            description={
              <>
                How you appear to clients and on printed documents.
                <SettingsAffects items={["Client portal", "Shared meal plans", "Messages", "Printed charts"]} />
              </>
            }
          >
            <div className="ui-profile-grid ui-profile-grid--2">
              <Field label="First name">
                <Input value={profile.firstName ?? ""} onChange={(event) => set("firstName", event.target.value)} />
              </Field>
              <Field label="Last name">
                <Input value={profile.lastName ?? ""} onChange={(event) => set("lastName", event.target.value)} />
              </Field>
              <Field label="Title">
                <Input
                  value={profile.professionalTitle ?? ""}
                  onChange={(event) => set("professionalTitle", event.target.value)}
                  placeholder="Nutritionist"
                />
              </Field>
              <Field label="Specialization">
                <Input
                  value={profile.specialization ?? ""}
                  onChange={(event) => set("specialization", event.target.value)}
                  placeholder="Sports nutrition"
                />
              </Field>
              <Field label="License number">
                <Input
                  value={profile.licenseNumber ?? ""}
                  onChange={(event) => set("licenseNumber", event.target.value)}
                />
              </Field>
              <Field label="Country">
                <Input value={profile.country ?? ""} onChange={(event) => set("country", event.target.value)} />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={profile.email ?? ""}
                  onChange={(event) => set("email", event.target.value)}
                  autoComplete="email"
                  required
                />
              </Field>
              <Field label="Phone">
                <Input value={profile.phone ?? ""} onChange={(event) => set("phone", event.target.value)} />
              </Field>
            </div>
            {emailChanged && editing ? (
              <Field label="Current password">
                <PasswordInput
                  value={emailPassword}
                  onChange={(event) => setEmailPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
                <SettingsNote>Required to change the email you use to sign in.</SettingsNote>
              </Field>
            ) : null}
          </Section>
        </fieldset>
      </form>
      <Section
        title="Appearance"
        description={
          <>
            Light, dark, or match this device. Applies immediately — no Save needed.
            <SettingsAffects items={["This browser only"]} />
          </>
        }
      >
        <AppearanceToggle />
      </Section>
      <Section
        title="Sign-in"
        description={
          <>
            Password changes save on their own, separately from your name.
            <SettingsAffects items={["Your login"]} />
          </>
        }
      >
        <Field label="Email">
          <Input className="ui-profile-readonly" value={profile.email ?? ""} readOnly disabled />
        </Field>
        {editing ? (
          <form id={PROFILE_PASSWORD_FORM_ID} onSubmit={(event) => void onChangePassword(event)}>
            <div className="ui-profile-grid ui-profile-grid--2">
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
            </div>
            <div className="ui-profile-hub__actions">
              <Button type="submit" variant="secondary" disabled={passwordSaving || !currentPassword || !newPassword}>
                {passwordSaving ? "Updating…" : "Update password"}
              </Button>
              <Button type="button" variant="ghost" disabled={revoking} onClick={() => void onRevokeOthers()}>
                {revoking ? "Signing out…" : "Sign out other sessions"}
              </Button>
            </div>
          </form>
        ) : (
          <SettingsNote>Use Edit to change your password or sign out other devices.</SettingsNote>
        )}
        {accountMessage ? <p className="ui-muted">{accountMessage}</p> : null}
      </Section>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
