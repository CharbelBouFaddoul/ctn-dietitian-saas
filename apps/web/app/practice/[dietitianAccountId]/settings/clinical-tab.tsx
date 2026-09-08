"use client";

import { FormEvent, useState } from "react";
import { Alert, Button, Checkbox, Field, Input, Section, Select } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { MEASUREMENT_GROUPS, STORED_MEASUREMENT_METRICS } from "../../../../lib/measurements";
import { sanitizeNutritionMethod } from "../../../../lib/faculty-nutrition";
import { ClinicNutritionMethodSwitch } from "../../../../components/clinic-nutrition-method-switch";
import { RemovableTag, ToggleChip } from "./profile-select";
import { SettingsAffects, SettingsLead, SettingsNote } from "./settings-copy";
import {
  PROFILE_FORM_ID,
  settingsPayload,
  type DietitianSettings,
  type PortalPresets,
  type ProfileEditorMode,
} from "./profile-types";

const REMINDER_PRESETS = [
  { hours: 1, label: "1 hour before" },
  { hours: 24, label: "1 day before" },
  { hours: 72, label: "3 days before" },
];

const PORTAL_PRESETS: Array<{ key: keyof PortalPresets; label: string; hint: string }> = [
  { key: "mealPlans", label: "Meal plans", hint: "Published plans on the patient portal." },
  { key: "tracking", label: "Tracking", hint: "Food diary and weight logs." },
  { key: "messaging", label: "Messages", hint: "In-app chat with you." },
];

export function ClinicalTab({
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
  const [labelDraft, setLabelDraft] = useState("");
  const enabled = new Set(settings.enabledMeasurements ?? STORED_MEASUREMENT_METRICS.map((row) => row.id));
  const reminders = settings.appointmentReminders?.length
    ? settings.appointmentReminders
    : [settings.reminderHoursBefore];

  function patch(next: Partial<DietitianSettings>) {
    onSettings({ ...settings, ...next });
  }

  function toggleMetric(id: string) {
    const next = new Set(enabled);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    patch({ enabledMeasurements: [...next] });
  }

  function addLabel() {
    const value = labelDraft.trim();
    if (!value) return;
    const labels = settings.mealPlanShare.mealLabels;
    if (labels.includes(value)) return;
    patch({
      mealPlanShare: { ...settings.mealPlanShare, mealLabels: [...labels, value].slice(0, 12) },
    });
    setLabelDraft("");
  }

  function removeLabel(label: string) {
    patch({
      mealPlanShare: {
        ...settings.mealPlanShare,
        mealLabels: settings.mealPlanShare.mealLabels.filter((item) => item !== label),
      },
    });
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

  function setPreset(key: keyof PortalPresets, value: boolean) {
    patch({ portalPresets: { ...settings.portalPresets, [key]: value } });
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
      setError(errorMessage(err, "Unable to save care defaults"));
    } finally {
      onSaving(false);
    }
  }

  return (
    <form id={PROFILE_FORM_ID} onSubmit={(event) => void onSave(event)} className="ui-profile-hub__stack">
      <SettingsLead
        affects={[
          "Client chart header",
          "Prescription",
          "Measurement",
          "Nutrition Analysis",
          "Meal plans",
          "Calendar",
          "Client portal",
        ]}
      >
        Defaults for every client chart. The calculation method applies as soon as you switch it. Meal names,
        measurements, appointments, and portal access wait for Save.
      </SettingsLead>
      <Section
        title="Nutrition method"
        description={
          <>
            How energy and macros are calculated on every chart. Applies immediately — no Edit needed.
            <SettingsAffects
              items={["Client chart header", "Prescription", "Measurement", "Nutrition Analysis", "Print"]}
            />
          </>
        }
      >
        <ClinicNutritionMethodSwitch
          dietitianAccountId={dietitianAccountId}
          value={sanitizeNutritionMethod(settings.defaultNutritionMethod)}
          allowManage
          variant="settings"
          onChange={(method) => patch({ defaultNutritionMethod: method })}
          onError={(message) => setError(message)}
        />
      </Section>
      <fieldset disabled={!editing}>
        <Section
          title="Measurements"
          description={
            <>
              Which fields can be logged on the Measurement tab, and whether fat mass and lean mass are deduced.
              <SettingsAffects items={["Measurement tab on every chart"]} />
            </>
          }
        >
          <Field label="Deduce measurements">
            <Select
              value={settings.deduceMeasurements === false ? "off" : "on"}
              onChange={(event) => patch({ deduceMeasurements: event.target.value === "on" })}
            >
              <option value="on">Deduce fat mass, lean mass, and percentages</option>
              <option value="off">Do not deduce</option>
            </Select>
          </Field>
          <SettingsNote>In Edit, click a measurement to show or hide it. Shown means it can be logged.</SettingsNote>
          {MEASUREMENT_GROUPS.map((group) => (
            <div key={group.id} className="ui-profile-measure-group">
              <p className="ui-label">{group.label}</p>
              <div className="ui-profile-chip-row">
                {group.metrics
                  .filter((metric) => metric.stored)
                  .map((metric) => (
                    <ToggleChip
                      key={metric.id}
                      label={metric.label}
                      on={enabled.has(metric.id)}
                      onLabel="Shown"
                      offLabel="Hidden"
                      onClick={() => toggleMetric(metric.id)}
                    />
                  ))}
              </div>
            </div>
          ))}
        </Section>
        <Section
          title="Meal sections"
          description={
            <>
              Section names on meal plans you write and share.
              <SettingsAffects items={["Meal plan workspace", "Shared meal plans"]} />
            </>
          }
        >
          <SettingsNote>In Edit, click × to remove a name or add a new one.</SettingsNote>
          <div className="ui-profile-chip-row">
            {settings.mealPlanShare.mealLabels.map((label) => (
              <RemovableTag key={label} label={label} onRemove={() => removeLabel(label)} />
            ))}
          </div>
          <div className="ui-profile-inline">
            <Input
              value={labelDraft}
              onChange={(event) => setLabelDraft(event.target.value)}
              placeholder="Add a section name"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addLabel();
                }
              }}
            />
          </div>
        </Section>
        <Section
          title="Appointments"
          description={
            <>
              Length and reminders for new bookings.
              <SettingsAffects items={["Calendar", "New appointments"]} />
            </>
          }
        >
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
          {settings.productEmailEnabled ? (
            <div className="ui-profile-hub__subblock">
              <p className="ui-label">Reminders</p>
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
            </div>
          ) : null}
        </Section>
        <Section
          title="Client portal"
          description={
            <>
              What a newly invited patient can see. You can still change access on that client’s Settings tab.
              <SettingsAffects items={["New portal accounts"]} />
            </>
          }
        >
          <div className="ui-profile-preset-list">
            {PORTAL_PRESETS.map((row) => (
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
