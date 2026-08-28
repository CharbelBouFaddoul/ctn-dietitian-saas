"use client";

import { FormEvent, useState } from "react";
import { Alert, Checkbox, Section } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { PROFILE_FORM_ID, settingsPayload, type DietitianSettings, type PortalPresets, type ProfileEditorMode } from "./profile-types";

const PRESET_ROWS: Array<{ key: keyof PortalPresets; label: string; hint: string }> = [
  { key: "mealPlans", label: "Meal plans", hint: "Published plan." },
  { key: "tracking", label: "Tracking", hint: "Food diary and weight." },
  { key: "messaging", label: "Messages", hint: "In-app chat." },
];

export function PortalTab({
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

  function setPreset(key: keyof PortalPresets, value: boolean) {
    onSettings({
      ...settings,
      portalPresets: { ...settings.portalPresets, [key]: value },
    });
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
      setError(errorMessage(err, "Unable to save portal presets"));
    } finally {
      onSaving(false);
    }
  }

  return (
    <form id={PROFILE_FORM_ID} onSubmit={(event) => void onSave(event)} className="ui-profile-hub__stack">
      <fieldset disabled={!editing}>
      <Section title="Access">
        <div className="ui-profile-preset-list">
          {PRESET_ROWS.map((row) => (
            <div key={row.key} className="ui-profile-preset">
              <span>
                <strong>{row.label}</strong>
                <span className="ui-muted">{row.hint}</span>
              </span>
              <Checkbox
                label="Enabled"
                checked={settings.portalPresets[row.key]}
                onChange={(event) => setPreset(row.key, event.target.checked)}
              />
            </div>
          ))}
        </div>
      </Section>
      </fieldset>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </form>
  );
}
