"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Alert,
  Button,
  Checkbox,
  Field,
  Input,
  PageHeader,
  Section,
  Select,
  Textarea,
} from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";

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
  const params = useParams<{ dietitianAccountId: string }>();
  const dietitianAccountId = params.dietitianAccountId;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api<Settings>(`/api/v1/dietitian/${dietitianAccountId}/settings`)
      .then(setSettings)
      .catch((err) => setLoadError(errorMessage(err, "Unable to load settings")));
  }, [dietitianAccountId]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await api<Settings>(`/api/v1/dietitian/${dietitianAccountId}/settings`, {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      setSettings(updated);
      setSaved(true);
    } catch (err) {
      setSaveError(errorMessage(err, "Save failed — please try again"));
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  }

  function str(key: keyof Settings): string {
    return (settings?.[key] as string | null) ?? "";
  }

  if (loadError) {
    return <Alert tone="danger">{loadError}</Alert>;
  }

  if (!settings) {
    return <p className="ui-muted">Loading settings…</p>;
  }

  return (
    <section>
      <PageHeader
        title="Practice settings"
        description="Practice details, preferences, reminders, and invoice defaults used across this clinic."
      />

      <form onSubmit={(e) => void onSave(e)}>

        {/* ── Practice information ─────────────────────────────────── */}
        <Section title="Practice information" description="Name, contact details, and address shown on invoices and communications.">
          <div style={{ display: "grid", gap: 16 }}>
            <Field label="Practice name">
              <Input value={str("practiceName")} onChange={(e) => set("practiceName", e.target.value || null)} placeholder="e.g. Green Leaf Nutrition" />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Contact email">
                <Input type="email" value={str("contactEmail")} onChange={(e) => set("contactEmail", e.target.value || null)} placeholder="hello@practice.com" />
              </Field>
              <Field label="Contact phone">
                <Input type="tel" value={str("contactPhone")} onChange={(e) => set("contactPhone", e.target.value || null)} placeholder="+1 555 000 0000" />
              </Field>
            </div>
            <Field label="Address line 1">
              <Input value={str("addressLine1")} onChange={(e) => set("addressLine1", e.target.value || null)} />
            </Field>
            <Field label="Address line 2">
              <Input value={str("addressLine2")} onChange={(e) => set("addressLine2", e.target.value || null)} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <Field label="City">
                <Input value={str("city")} onChange={(e) => set("city", e.target.value || null)} />
              </Field>
              <Field label="Region / state">
                <Input value={str("region")} onChange={(e) => set("region", e.target.value || null)} />
              </Field>
              <Field label="Postal code">
                <Input value={str("postalCode")} onChange={(e) => set("postalCode", e.target.value || null)} />
              </Field>
            </div>
            <Field label="Country">
              <Input value={str("country")} onChange={(e) => set("country", e.target.value || null)} placeholder="e.g. US" />
            </Field>
          </div>
        </Section>

        {/* ── Preferences ──────────────────────────────────────────── */}
        <Section title="Preferences" description="Units, locale, and scheduling defaults applied across the practice.">
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Timezone">
                <Input value={str("timezone")} onChange={(e) => set("timezone", e.target.value)} placeholder="America/New_York" />
              </Field>
              <Field label="Locale">
                <Input value={str("locale")} onChange={(e) => set("locale", e.target.value)} placeholder="en-US" />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Currency">
                <Input value={str("currency")} onChange={(e) => set("currency", e.target.value)} placeholder="USD" />
              </Field>
              <Field label="Date format">
                <Input value={str("dateFormat")} onChange={(e) => set("dateFormat", e.target.value)} placeholder="MM/DD/YYYY" />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Weight unit">
                <Select value={str("weightUnit")} onChange={(e) => set("weightUnit", e.target.value)}>
                  <option value="kg">kg</option>
                  <option value="lbs">lbs</option>
                </Select>
              </Field>
              <Field label="Height unit">
                <Select value={str("heightUnit")} onChange={(e) => set("heightUnit", e.target.value)}>
                  <option value="cm">cm</option>
                  <option value="ft">ft / in</option>
                </Select>
              </Field>
            </div>
            <Field label="Default appointment length (minutes)">
              <Input
                type="number"
                min={5}
                step={5}
                value={settings.defaultAppointmentMinutes}
                onChange={(e) => set("defaultAppointmentMinutes", Number(e.target.value))}
              />
            </Field>
          </div>
        </Section>

        {/* ── Reminders ────────────────────────────────────────────── */}
        <Section title="Reminders" description="Appointment reminder emails sent to clients.">
          <div style={{ display: "grid", gap: 16 }}>
            <Checkbox
              label="Email reminders enabled"
              checked={settings.reminderEmailEnabled}
              onChange={(e) => set("reminderEmailEnabled", e.target.checked)}
            />
            <Field label="Send reminder (hours before appointment)">
              <Input
                type="number"
                min={1}
                value={settings.reminderHoursBefore}
                onChange={(e) => set("reminderHoursBefore", Number(e.target.value))}
                disabled={!settings.reminderEmailEnabled}
              />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Email from name">
                <Input value={str("emailFromName")} onChange={(e) => set("emailFromName", e.target.value || null)} placeholder="Your Practice Name" />
              </Field>
              <Field label="Reply-to email">
                <Input type="email" value={str("emailReplyTo")} onChange={(e) => set("emailReplyTo", e.target.value || null)} placeholder="noreply@practice.com" />
              </Field>
            </div>
          </div>
        </Section>

        {/* ── Invoices ─────────────────────────────────────────────── */}
        <Section title="Invoices" description="Defaults applied when creating new invoices.">
          <div style={{ display: "grid", gap: 16 }}>
            <Field label="Default payment due (days after issue)">
              <Input
                type="number"
                min={0}
                value={settings.invoiceDefaultDueDays}
                onChange={(e) => set("invoiceDefaultDueDays", Number(e.target.value))}
              />
            </Field>
            <Field label="Invoice footer note">
              <Textarea
                value={str("invoiceFooter")}
                onChange={(e) => set("invoiceFooter", e.target.value || null)}
                placeholder="Thank you for your business."
                style={{ minHeight: 80 }}
              />
            </Field>
          </div>
        </Section>

        <div style={{ display: "flex", gap: 12, alignItems: "center", paddingTop: 8 }}>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
          {saved ? <span className="ui-muted" style={{ fontSize: "0.875rem" }}>Changes saved</span> : null}
        </div>

        {saveError ? (
          <div style={{ marginTop: 12 }}>
            <Alert tone="danger">{saveError}</Alert>
          </div>
        ) : null}
      </form>
    </section>
  );
}
