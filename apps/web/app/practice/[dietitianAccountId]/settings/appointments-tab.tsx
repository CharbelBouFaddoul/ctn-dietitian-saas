"use client";

import { FormEvent, useState } from "react";
import { Alert, Button, Checkbox, Field, Input, Section, Select } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { PROFILE_FORM_ID, settingsPayload, type DietitianSettings, type ProfileEditorMode } from "./profile-types";

const REMINDER_PRESETS = [
  { hours: 1, label: "1 hour before" },
  { hours: 24, label: "1 day before" },
  { hours: 72, label: "3 days before" },
];

export function AppointmentsTab({
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
  const reminders = settings.appointmentReminders?.length
    ? settings.appointmentReminders
    : [settings.reminderHoursBefore];

  function patch(next: Partial<DietitianSettings>) {
    onSettings({ ...settings, ...next });
  }

  function toggleReminder(hours: number) {
    const current = new Set(reminders);
    if (current.has(hours)) current.delete(hours);
    else current.add(hours);
    const next = [...current].sort((a, b) => a - b).slice(0, 3);
    patch({
      appointmentReminders: next.length ? next : [24],
      reminderHoursBefore: (next.length ? next : [24])[0]!,
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
      setError(errorMessage(err, "Unable to save appointment preferences"));
    } finally {
      onSaving(false);
    }
  }

  return (
    <form id={PROFILE_FORM_ID} onSubmit={(event) => void onSave(event)} className="ui-profile-hub__stack">
      <fieldset disabled={!editing}>
      <Section title="Defaults">
        <div className="ui-profile-grid ui-profile-grid--2">
          <Field label="Duration (minutes)">
            <Input
              type="number"
              min={5}
              step={5}
              value={settings.defaultAppointmentMinutes}
              onChange={(event) => patch({ defaultAppointmentMinutes: Number(event.target.value) })}
            />
          </Field>
          <Field label="New status">
            <Select
              value={settings.defaultAppointmentStatus}
              onChange={(event) => patch({ defaultAppointmentStatus: event.target.value })}
            >
              <option value="SCHEDULED">Scheduled</option>
            </Select>
          </Field>
        </div>
      </Section>
      {settings.productEmailEnabled ? (
        <Section title="Reminders">
          <Checkbox
            label="Email reminders"
            checked={settings.reminderEmailEnabled}
            onChange={(event) => patch({ reminderEmailEnabled: event.target.checked })}
          />
          <div className="ui-profile-chip-row">
            {REMINDER_PRESETS.map((row) => (
              <Button
                key={row.hours}
                type="button"
                variant={reminders.includes(row.hours) ? "primary" : "secondary"}
                disabled={!settings.reminderEmailEnabled}
                onClick={() => toggleReminder(row.hours)}
              >
                Notify {row.label}
              </Button>
            ))}
          </div>
        </Section>
      ) : null}
      </fieldset>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </form>
  );
}
