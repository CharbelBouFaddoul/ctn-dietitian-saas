"use client";

import { FormEvent, useState } from "react";
import { Alert, Field, Input, Section } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { PROFILE_FORM_ID, settingsPayload, type DietitianSettings, type ProfileEditorMode } from "./profile-types";

export function PracticeTab({
  dietitianAccountId,
  settings,
  onSettings,
  editing,
  onSaved,
  onSaving,
}: {
  dietitianAccountId: string;
  settings: DietitianSettings;
  onSettings: (next: DietitianSettings) => void;
} & ProfileEditorMode) {
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof DietitianSettings>(key: K, value: DietitianSettings[K]) {
    onSettings({ ...settings, [key]: value });
  }

  function str(key: keyof DietitianSettings): string {
    return (settings[key] as string | null) ?? "";
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    onSaving(true);
    setError(null);
    try {
      const updated = await api<DietitianSettings>(`/api/v1/dietitian/${dietitianAccountId}/settings`, {
        method: "PATCH",
        body: JSON.stringify(settingsPayload(settings)),
      });
      onSettings(updated);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "Unable to save practice details"));
    } finally {
      onSaving(false);
    }
  }

  return (
    <form id={PROFILE_FORM_ID} onSubmit={(event) => void onSave(event)} className="ui-profile-hub__stack">
      <fieldset disabled={!editing}>
      <Section title="Clinic">
        <Field label="Clinic name">
          <Input value={str("practiceName")} onChange={(event) => set("practiceName", event.target.value || null)} />
        </Field>
        <div className="ui-profile-grid ui-profile-grid--2">
          <Field label="Email">
            <Input
              type="email"
              value={str("contactEmail")}
              onChange={(event) => set("contactEmail", event.target.value || null)}
            />
          </Field>
          <Field label="Phone">
            <Input value={str("contactPhone")} onChange={(event) => set("contactPhone", event.target.value || null)} />
          </Field>
        </div>
      </Section>
      <Section title="Address">
        <Field label="Address line 1">
          <Input value={str("addressLine1")} onChange={(event) => set("addressLine1", event.target.value || null)} />
        </Field>
        <Field label="Address line 2">
          <Input value={str("addressLine2")} onChange={(event) => set("addressLine2", event.target.value || null)} />
        </Field>
        <div className="ui-profile-grid ui-profile-grid--3">
          <Field label="City">
            <Input value={str("city")} onChange={(event) => set("city", event.target.value || null)} />
          </Field>
          <Field label="Region">
            <Input value={str("region")} onChange={(event) => set("region", event.target.value || null)} />
          </Field>
          <Field label="Postal code">
            <Input value={str("postalCode")} onChange={(event) => set("postalCode", event.target.value || null)} />
          </Field>
        </div>
        <Field label="Country">
          <Input value={str("country")} onChange={(event) => set("country", event.target.value || null)} />
        </Field>
      </Section>
      </fieldset>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </form>
  );
}
