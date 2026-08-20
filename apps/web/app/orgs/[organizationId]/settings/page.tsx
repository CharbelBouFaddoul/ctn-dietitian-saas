"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
interface Settings {
  timezone: string;
  locale: string;
  currency: string;
  weightUnit: string;
  heightUnit: string;
  dateFormat: string;
  practiceName: string | null;
  logoStorageKey: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  defaultAppointmentMinutes: number;
  reminderEmailEnabled: boolean;
  reminderHoursBefore: number;
  invoiceDefaultDueDays: number;
  invoiceFooter: string | null;
  emailFromName: string | null;
  emailReplyTo: string | null;
}

export default function PracticeSettingsPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void api<Settings>(`/api/v1/organizations/${organizationId}/settings`)
      .then(setSettings)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load settings"));
  }, [organizationId]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setError(null);
    try {
      const updated = await api<Settings>(`/api/v1/organizations/${organizationId}/settings`, {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      setSettings(updated);
      setMessage("Settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  if (!settings) {
    return <p>{error ?? "Loading settings…"}</p>;
  }

  return (
    <section style={{ maxWidth: 560 }}>
      <h1>Practice settings</h1>
      <p className="ui-muted">
        Practice details, reminders, and invoice defaults used across this clinic.
      </p>
      <form onSubmit={(event) => void onSave(event)}>
        {(
          [
            ["timezone", "Timezone"],
            ["locale", "Locale"],
            ["currency", "Currency"],
            ["weightUnit", "Weight unit"],
            ["heightUnit", "Height unit"],
            ["dateFormat", "Date format"],
            ["practiceName", "Practice name"],
            ["contactEmail", "Email"],
            ["contactPhone", "Phone"],
            ["addressLine1", "Address line 1"],
            ["addressLine2", "Address line 2"],
            ["city", "City"],
            ["region", "Region"],
            ["postalCode", "Postal code"],
            ["country", "Country"],
            ["emailFromName", "Email from name"],
            ["emailReplyTo", "Email reply-to"],
            ["invoiceFooter", "Invoice footer"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="ui-field">
            {label}
            <input
              className="ui-input"
              value={settings[key] ?? ""}
              onChange={(event) => setSettings({ ...settings, [key]: event.target.value || null })}
            />
          </label>
        ))}
        <label className="ui-field">
          Default appointment minutes
          <input
            className="ui-input"
            type="number"
            value={settings.defaultAppointmentMinutes}
            onChange={(event) =>
              setSettings({ ...settings, defaultAppointmentMinutes: Number(event.target.value) })
            }
          />
        </label>
        <label className="ui-field">
          Reminder hours before
          <input
            className="ui-input"
            type="number"
            value={settings.reminderHoursBefore}
            onChange={(event) => setSettings({ ...settings, reminderHoursBefore: Number(event.target.value) })}
          />
        </label>
        <label className="ui-field">
          Invoice default due days
          <input
            className="ui-input"
            type="number"
            value={settings.invoiceDefaultDueDays}
            onChange={(event) => setSettings({ ...settings, invoiceDefaultDueDays: Number(event.target.value) })}
          />
        </label>
        <label style={{ display: "block", marginBottom: 16 }}>
          <input
            type="checkbox"
            checked={settings.reminderEmailEnabled}
            onChange={(event) => setSettings({ ...settings, reminderEmailEnabled: event.target.checked })}
          />{" "}
          Email reminders enabled (preference only)
        </label>
        <button type="submit" className="ui-btn ui-btn--primary">
          Save settings
        </button>
      </form>
      {message ? <p>{message}</p> : null}
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
    </section>
  );
}
