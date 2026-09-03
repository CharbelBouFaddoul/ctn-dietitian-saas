"use client";

import { FormEvent, useEffect, useState } from "react";
import { Alert, Button, Field, Input, LoadingState, Section } from "@nutrition-saas/ui";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";
import type { SiteSettings } from "../../../lib/marketing/site-settings";

export function ProductSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [plansPageEnabled, setPlansPageEnabled] = useState(false);
  const [onlineCheckoutEnabled, setOnlineCheckoutEnabled] = useState(false);
  const [trialSignupEnabled, setTrialSignupEnabled] = useState(true);
  const [trialDurationDays, setTrialDurationDays] = useState("14");
  const [trialPlanSlug, setTrialPlanSlug] = useState("trial");

  useEffect(() => {
    void api<SiteSettings>("/api/v1/admin/site-settings")
      .then((data) => {
        setPlansPageEnabled(data.plansPageEnabled === true);
        setOnlineCheckoutEnabled(data.onlineCheckoutEnabled === true);
        setTrialSignupEnabled(data.trialSignupEnabled !== false);
        setTrialDurationDays(String(data.trialDurationDays ?? 14));
        setTrialPlanSlug(data.trialPlanSlug || "trial");
      })
      .catch((err) => setError(errorMessage(err, "Unable to load product settings")))
      .finally(() => setLoading(false));
  }, []);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api("/api/v1/admin/site-settings", {
        method: "PATCH",
        body: JSON.stringify({
          plansPageEnabled,
          onlineCheckoutEnabled,
          trialSignupEnabled,
          trialDurationDays: Number(trialDurationDays) || 14,
          trialPlanSlug: trialPlanSlug.trim() || "trial",
        }),
      });
      setMessage("Product settings saved.");
    } catch (err) {
      setError(errorMessage(err, "Unable to save product settings"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title="Trial and public plans"
      description="These flags control signup and the public Plans page. Plan entitlements are unchanged."
    >
      {loading ? <LoadingState>Loading product settings…</LoadingState> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}
      {loading ? null : (
        <form onSubmit={(event) => void onSave(event)} className="ui-stack">
          <div className="ui-admin-product-flags">
            <label className="ui-check">
              <input
                type="checkbox"
                checked={plansPageEnabled}
                onChange={(event) => setPlansPageEnabled(event.target.checked)}
              />
              <span>Show the public Plans page</span>
            </label>
            <label className="ui-check">
              <input
                type="checkbox"
                checked={onlineCheckoutEnabled}
                onChange={(event) => setOnlineCheckoutEnabled(event.target.checked)}
              />
              <span>Online checkout is available</span>
            </label>
            <label className="ui-check">
              <input
                type="checkbox"
                checked={trialSignupEnabled}
                onChange={(event) => setTrialSignupEnabled(event.target.checked)}
              />
              <span>Give new clinic signups a trial subscription</span>
            </label>
            <Field label="Trial length (days)">
              <Input
                type="number"
                min={1}
                value={trialDurationDays}
                onChange={(event) => setTrialDurationDays(event.target.value)}
              />
            </Field>
            <Field label="Trial plan slug">
              <Input
                value={trialPlanSlug}
                onChange={(event) => setTrialPlanSlug(event.target.value)}
                placeholder="trial"
              />
            </Field>
          </div>
          <div>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save product settings"}
            </Button>
          </div>
        </form>
      )}
    </Section>
  );
}
