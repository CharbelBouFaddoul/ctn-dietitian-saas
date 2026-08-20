"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Textarea,
} from "@nutrition-saas/ui";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";
import type { SiteFooterGroup, SiteNavItem, SiteSettings, SiteSocialLink } from "../../../lib/marketing/site-settings";

function toJsonPretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export default function AdminSiteSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [brandText, setBrandText] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaHref, setCtaHref] = useState("");
  const [ctaVisible, setCtaVisible] = useState(true);
  const [dietitianSignInLabel, setDietitianSignInLabel] = useState("");
  const [patientSignInLabel, setPatientSignInLabel] = useState("");
  const [footerDescription, setFooterDescription] = useState("");
  const [copyrightText, setCopyrightText] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactAddress, setContactAddress] = useState("");
  const [contactHours, setContactHours] = useState("");
  const [navJson, setNavJson] = useState("[]");
  const [footerJson, setFooterJson] = useState("[]");
  const [socialJson, setSocialJson] = useState("[]");

  function apply(data: SiteSettings) {
    setBrandText(data.brandText);
    setCtaText(data.ctaText);
    setCtaHref(data.ctaHref);
    setCtaVisible(data.ctaVisible);
    setDietitianSignInLabel(data.dietitianSignInLabel);
    setPatientSignInLabel(data.patientSignInLabel);
    setFooterDescription(data.footerDescription);
    setCopyrightText(data.copyrightText);
    setContactEmail(data.contactEmail ?? "");
    setContactPhone(data.contactPhone ?? "");
    setContactAddress(data.contactAddress ?? "");
    setContactHours(data.contactHours ?? "");
    setNavJson(toJsonPretty(data.navItems));
    setFooterJson(toJsonPretty(data.footerGroups));
    setSocialJson(toJsonPretty(data.socialLinks));
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api<SiteSettings>("/api/v1/admin/site-settings");
      apply(data);
    } catch (err) {
      setError(errorMessage(err, "Unable to load site settings"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      let navItems: SiteNavItem[];
      let footerGroups: SiteFooterGroup[];
      let socialLinks: SiteSocialLink[];
      try {
        navItems = JSON.parse(navJson) as SiteNavItem[];
        footerGroups = JSON.parse(footerJson) as SiteFooterGroup[];
        socialLinks = JSON.parse(socialJson) as SiteSocialLink[];
      } catch {
        throw new Error("Nav, footer groups, or social links JSON is invalid.");
      }

      const data = await api<SiteSettings>("/api/v1/admin/site-settings", {
        method: "PATCH",
        body: JSON.stringify({
          brandText,
          ctaText,
          ctaHref,
          ctaVisible,
          dietitianSignInLabel,
          patientSignInLabel,
          footerDescription,
          copyrightText,
          contactEmail: contactEmail.trim() ? contactEmail.trim() : null,
          contactPhone: contactPhone.trim() ? contactPhone.trim() : null,
          contactAddress: contactAddress.trim() ? contactAddress.trim() : null,
          contactHours: contactHours.trim() ? contactHours.trim() : null,
          navItems,
          footerGroups,
          socialLinks,
        }),
      });
      apply(data);
      setMessage("Site settings saved. Public header, footer, and contact will use these values.");
    } catch (err) {
      setError(errorMessage(err, "Unable to save site settings"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingState>Loading site settings…</LoadingState>;
  }

  return (
    <section>
      <PageHeader
        eyebrow="Platform"
        title="Site settings"
        description="Configure public website brand, navigation, CTAs, footer, and contact details. This is marketing chrome — not product entitlements."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      <form onSubmit={(event) => void onSave(event)} className="ui-stack" style={{ maxWidth: 760 }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Brand</h2>
        <Field label="Brand text">
          <Input value={brandText} onChange={(event) => setBrandText(event.target.value)} required />
        </Field>

        <h2 style={{ margin: "1rem 0 0", fontSize: "1.1rem" }}>Header</h2>
        <Field label="Dietitian sign-in label">
          <Input value={dietitianSignInLabel} onChange={(event) => setDietitianSignInLabel(event.target.value)} required />
        </Field>
        <Field label="Patient sign-in label">
          <Input value={patientSignInLabel} onChange={(event) => setPatientSignInLabel(event.target.value)} required />
        </Field>
        <Field label="CTA text">
          <Input value={ctaText} onChange={(event) => setCtaText(event.target.value)} required />
        </Field>
        <Field label="CTA href">
          <Input value={ctaHref} onChange={(event) => setCtaHref(event.target.value)} required />
        </Field>
        <label className="ui-check">
          <input type="checkbox" checked={ctaVisible} onChange={(event) => setCtaVisible(event.target.checked)} />
          <span>CTA visible</span>
        </label>
        <Field
          label="Navigation items (JSON)"
          hint='Array of { "href", "label", "visible", "order" }. Do not include Pricing or Admin.'
        >
          <Textarea rows={10} value={navJson} onChange={(event) => setNavJson(event.target.value)} required />
        </Field>

        <h2 style={{ margin: "1rem 0 0", fontSize: "1.1rem" }}>Footer</h2>
        <Field label="Footer description">
          <Textarea rows={4} value={footerDescription} onChange={(event) => setFooterDescription(event.target.value)} required />
        </Field>
        <Field label="Footer groups (JSON)" hint='Array of { "title", "links": [{ "href", "label" }] }.'>
          <Textarea rows={12} value={footerJson} onChange={(event) => setFooterJson(event.target.value)} required />
        </Field>
        <Field label="Social links (JSON)" hint='Array of { "label", "href" }.'>
          <Textarea rows={5} value={socialJson} onChange={(event) => setSocialJson(event.target.value)} required />
        </Field>
        <Field label="Copyright text">
          <Input value={copyrightText} onChange={(event) => setCopyrightText(event.target.value)} required />
        </Field>

        <h2 style={{ margin: "1rem 0 0", fontSize: "1.1rem" }}>Contact</h2>
        <Field label="Contact email">
          <Input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} />
        </Field>
        <Field label="Contact phone">
          <Input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
        </Field>
        <Field label="Contact address">
          <Textarea rows={3} value={contactAddress} onChange={(event) => setContactAddress(event.target.value)} />
        </Field>
        <Field label="Contact hours">
          <Input value={contactHours} onChange={(event) => setContactHours(event.target.value)} />
        </Field>

        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save site settings"}
        </Button>
      </form>
    </section>
  );
}
