"use client";

import { FormEvent, useState } from "react";
import { Alert, Field, Input, PasswordInput, Section } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { PROFILE_FORM_ID, type DietitianProfile, type ProfileEditorMode } from "./profile-types";

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
  const [currentPassword, setCurrentPassword] = useState("");
  const emailChanged = (profile.email ?? "").trim().toLowerCase() !== loginEmail.trim().toLowerCase();

  function set<K extends keyof DietitianProfile>(key: K, value: DietitianProfile[K]) {
    onProfile({ ...profile, [key]: value });
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    if (emailChanged && !currentPassword) {
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
          body: JSON.stringify({ email: profile.email, currentPassword }),
        });
        nextEmail = changed.email;
        setLoginEmail(changed.email);
        setCurrentPassword("");
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

  return (
    <form id={PROFILE_FORM_ID} onSubmit={(event) => void onSave(event)} className="ui-profile-hub__stack">
      <fieldset disabled={!editing}>
      <Section title="Identity" description="Clients see name, title, and specialization.">
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
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
            <p className="ui-muted" style={{ margin: "0.35rem 0 0" }}>
              Required to change sign-in email.
            </p>
          </Field>
        ) : null}
      </Section>
      </fieldset>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </form>
  );
}
