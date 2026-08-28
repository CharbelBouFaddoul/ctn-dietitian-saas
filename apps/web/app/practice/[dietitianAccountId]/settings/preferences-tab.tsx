"use client";

import { FormEvent, useState } from "react";
import { Alert, Field, Section, Select } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import {
  CURRENCY_OPTIONS,
  DATE_FORMAT_OPTIONS,
  LOCALE_OPTIONS,
  PROFILE_FORM_ID,
  TIMEZONE_OPTIONS,
  settingsPayload,
  type DietitianSettings,
  type ProfileEditorMode,
} from "./profile-types";

export function PreferencesTab({
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
  const timezones = TIMEZONE_OPTIONS.includes(settings.timezone)
    ? TIMEZONE_OPTIONS
    : [settings.timezone, ...TIMEZONE_OPTIONS];
  const locales = LOCALE_OPTIONS.some((row) => row.value === settings.locale)
    ? LOCALE_OPTIONS
    : [{ value: settings.locale, label: settings.locale }, ...LOCALE_OPTIONS];

  function set<K extends keyof DietitianSettings>(key: K, value: DietitianSettings[K]) {
    onSettings({ ...settings, [key]: value });
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
      setError(errorMessage(err, "Unable to save preferences"));
    } finally {
      onSaving(false);
    }
  }

  return (
    <form id={PROFILE_FORM_ID} onSubmit={(event) => void onSave(event)} className="ui-profile-hub__stack">
      <fieldset disabled={!editing}>
      <Section title="Locale">
        <div className="ui-profile-grid ui-profile-grid--2">
          <Field label="Timezone">
            <Select value={settings.timezone} onChange={(event) => set("timezone", event.target.value)}>
              {timezones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Language">
            <Select value={settings.locale} onChange={(event) => set("locale", event.target.value)}>
              {locales.map((row) => (
                <option key={row.value} value={row.value}>
                  {row.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date format">
            <Select value={settings.dateFormat} onChange={(event) => set("dateFormat", event.target.value)}>
              {DATE_FORMAT_OPTIONS.map((row) => (
                <option key={row.value} value={row.value}>
                  {row.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Currency">
            <Select value={settings.currency} onChange={(event) => set("currency", event.target.value)}>
              {CURRENCY_OPTIONS.map((row) => (
                <option key={row} value={row}>
                  {row}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Section>
      <Section title="Units">
        <div className="ui-profile-grid ui-profile-grid--3">
          <Field label="Weight">
            <Select value={settings.weightUnit} onChange={(event) => set("weightUnit", event.target.value)}>
              <option value="kg">Kilogram (kg)</option>
              <option value="lb">Pound (lb)</option>
            </Select>
          </Field>
          <Field label="Height">
            <Select value={settings.heightUnit} onChange={(event) => set("heightUnit", event.target.value)}>
              <option value="cm">Centimeters (cm)</option>
              <option value="in">Inches (in)</option>
            </Select>
          </Field>
          <Field label="Energy">
            <Select value={settings.energyUnit} onChange={(event) => set("energyUnit", event.target.value)}>
              <option value="kcal">Kilocalorie (kcal)</option>
              <option value="kj">Kilojoule (kJ)</option>
            </Select>
          </Field>
        </div>
      </Section>
      </fieldset>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </form>
  );
}
