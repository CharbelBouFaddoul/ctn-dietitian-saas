"use client";

import { FormEvent, useState } from "react";
import { Alert, Field, Input, Section, Textarea } from "@nutrition-saas/ui";
import { TemplateInsertField } from "../../../../components/template-insert-field";
import { api } from "../../../../lib/api";
import { AUTOMATION_TEMPLATE_TOKENS, toFriendlyTemplate } from "../../../../lib/automation-rule-form";
import { errorMessage } from "../../../../lib/humanize-error";
import { ToggleChip } from "./profile-select";
import { SettingsAffects, SettingsLead, SettingsNote } from "./settings-copy";
import {
  MEAL_PLAN_SHARE_SECTIONS,
  PROFILE_FORM_ID,
  settingsPayload,
  type DietitianSettings,
  type ProfileEditorMode,
} from "./profile-types";

const SHARE_TOKENS = AUTOMATION_TEMPLATE_TOKENS.filter((token) =>
  [
    "client.displayName",
    "client.firstName",
    "client.lastName",
    "dietitian.name",
    "organization.name",
    "run.date",
    "mealPlan.name",
  ].includes(token.api),
).map((token) => ({ friendly: token.friendly, label: token.label }));

export function DocumentsTab({
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
  const share = settings.mealPlanShare;

  function patchShare(next: Partial<typeof share>) {
    onSettings({ ...settings, mealPlanShare: { ...share, ...next } });
  }

  function toggleSection(id: string) {
    const current = new Set(share.includeSections);
    if (current.has(id)) current.delete(id);
    else current.add(id);
    patchShare({ includeSections: [...current] });
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
      setError(errorMessage(err, "Unable to save document preferences"));
    } finally {
      onSaving(false);
    }
  }

  return (
    <form id={PROFILE_FORM_ID} onSubmit={(event) => void onSave(event)} className="ui-profile-hub__stack">
      <SettingsLead affects={["Share meal plan", "Client notifications", "Invoices"]}>
        Templates for the message clients get when you share a plan, and defaults for every new invoice.
      </SettingsLead>
      <fieldset disabled={!editing}>
        <Section
          title={settings.productEmailEnabled ? "Shared plan notice" : "Shared plan notice (in-app)"}
          description={
            <>
              Sent when you share a meal plan from a client chart. Title and message appear in the portal
              {settings.productEmailEnabled ? " and by email" : ""}.
              <SettingsAffects items={["Share meal plan", "Client portal inbox"]} />
            </>
          }
        >
          <TemplateInsertField
            label="Title"
            value={toFriendlyTemplate(share.emailSubject)}
            onChange={(value) => patchShare({ emailSubject: value })}
            tokens={SHARE_TOKENS}
          />
          <TemplateInsertField
            label="Message"
            value={toFriendlyTemplate(share.emailBody)}
            onChange={(value) => patchShare({ emailBody: value })}
            multiline
            rows={10}
            className="ui-profile-email-body"
            tokens={SHARE_TOKENS}
          />
          <div>
            <p className="ui-label">Include in shared plan</p>
            <SettingsNote>Click a section to include it in the plan the client receives.</SettingsNote>
            <div className="ui-profile-chip-row">
              {MEAL_PLAN_SHARE_SECTIONS.map((row) => (
                <ToggleChip
                  key={row.id}
                  label={row.label}
                  on={share.includeSections.includes(row.id)}
                  onLabel="Included"
                  offLabel="Not included"
                  onClick={() => toggleSection(row.id)}
                />
              ))}
            </div>
          </div>
        </Section>
        {settings.productEmailEnabled ? (
          <Section
            title="Sender"
            description={
              <>
                From name and reply address on clinic emails.
                <SettingsAffects items={["Shared plan emails", "Appointment reminders"]} />
              </>
            }
          >
            <div className="ui-profile-grid ui-profile-grid--2">
              <Field label="From name">
                <Input
                  value={settings.emailFromName ?? ""}
                  onChange={(event) => {
                    onSettings({ ...settings, emailFromName: event.target.value || null });
                  }}
                />
              </Field>
              <Field label="Reply-to">
                <Input
                  type="email"
                  value={settings.emailReplyTo ?? ""}
                  onChange={(event) => {
                    onSettings({ ...settings, emailReplyTo: event.target.value || null });
                  }}
                />
              </Field>
            </div>
          </Section>
        ) : null}
        <Section
          title="Invoices"
          description={
            <>
              Defaults for every new invoice. You can still change a single invoice before sending.
              <SettingsAffects items={["Billing", "New invoices"]} />
            </>
          }
        >
          <div className="ui-profile-grid ui-profile-grid--2">
            <Field label="Payment due (days)">
              <Input
                type="number"
                min={0}
                value={settings.invoiceDefaultDueDays}
                onChange={(event) => {
                  onSettings({ ...settings, invoiceDefaultDueDays: Number(event.target.value) });
                }}
              />
            </Field>
            <Field label="Tax rate (%)">
              <Input
                type="number"
                min={0}
                max={100}
                step="any"
                value={settings.invoiceDefaultTaxPercent ?? 0}
                onChange={(event) => {
                  onSettings({ ...settings, invoiceDefaultTaxPercent: Number(event.target.value) });
                }}
              />
            </Field>
          </div>
          <Field label="Footer">
            <Textarea
              value={settings.invoiceFooter ?? ""}
              onChange={(event) => {
                onSettings({ ...settings, invoiceFooter: event.target.value || null });
              }}
              style={{ minHeight: 80 }}
            />
          </Field>
        </Section>
      </fieldset>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </form>
  );
}
