"use client";

import { FormEvent, useState } from "react";
import { Alert, Field, Input, Section, Select } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { MEASUREMENT_GROUPS, STORED_MEASUREMENT_METRICS } from "../../../../lib/measurements";
import { PROFILE_FORM_ID, settingsPayload, type DietitianSettings, type ProfileEditorMode } from "./profile-types";

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
      setError(errorMessage(err, "Unable to save clinical defaults"));
    } finally {
      onSaving(false);
    }
  }

  return (
    <form id={PROFILE_FORM_ID} onSubmit={(event) => void onSave(event)} className="ui-profile-hub__stack">
      <fieldset disabled={!editing}>
      <Section title="Meal sections">
        <div className="ui-profile-chip-row">
          {settings.mealPlanShare.mealLabels.map((label) => (
            <button key={label} type="button" className="ui-profile-chip is-on" onClick={() => removeLabel(label)}>
              {label}
            </button>
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
      <Section title="Measurements">
        <Field label="Deduce measurements">
          <Select
            value={settings.deduceMeasurements === false ? "off" : "on"}
            onChange={(event) => patch({ deduceMeasurements: event.target.value === "on" })}
          >
            <option value="on">Deduce fat mass, lean mass, and percentages</option>
            <option value="off">Do not deduce</option>
          </Select>
        </Field>
        {MEASUREMENT_GROUPS.map((group) => (
          <div key={group.id} className="ui-profile-measure-group">
            <p className="ui-label">{group.label}</p>
            <div className="ui-profile-chip-row">
              {group.metrics
                .filter((metric) => metric.stored)
                .map((metric) => (
                  <button
                    key={metric.id}
                    type="button"
                    className={`ui-profile-chip${enabled.has(metric.id) ? " is-on" : ""}`}
                    onClick={() => toggleMetric(metric.id)}
                  >
                    {metric.label}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </Section>
      </fieldset>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </form>
  );
}
