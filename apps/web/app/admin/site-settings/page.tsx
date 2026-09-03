"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  Field,
  Input,
  LoadingState,
  Section,
  Tabs,
  Textarea,
} from "@nutrition-saas/ui";
import { AdminPage } from "../_components/admin-page";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";
import type { SiteFooterGroup, SiteNavItem, SiteSettings, SiteSocialLink } from "../../../lib/marketing/site-settings";

const SETTINGS_TABS = [
  { id: "brand", label: "Brand" },
  { id: "access", label: "Access" },
  { id: "navigation", label: "Navigation" },
  { id: "footer", label: "Footer" },
  { id: "contact", label: "Public contact" },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

function isSettingsTab(value: string | null): value is SettingsTab {
  return SETTINGS_TABS.some((tab) => tab.id === value);
}

function resolveTab(value: string | null): SettingsTab {
  if (value === "general") return "brand";
  return isSettingsTab(value) ? value : "brand";
}

function emptyNavItem(order: number): SiteNavItem {
  return { href: "/", label: "", visible: true, order };
}

function emptyFooterGroup(): SiteFooterGroup {
  return { title: "", links: [{ href: "/", label: "" }] };
}

function emptySocialLink(): SiteSocialLink {
  return { label: "", href: "" };
}

function AdminSiteSettingsForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<SettingsTab>(resolveTab(initialTab));
  const [brandText, setBrandText] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaHref, setCtaHref] = useState("");
  const [ctaVisible, setCtaVisible] = useState(true);
  const [dietitianRegistrationEnabled, setDietitianRegistrationEnabled] = useState(false);
  const [patientRegistrationEnabled, setPatientRegistrationEnabled] = useState(false);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(false);
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(false);
  const [dietitianSignInLabel, setDietitianSignInLabel] = useState("");
  const [patientSignInLabel, setPatientSignInLabel] = useState("");
  const [footerDescription, setFooterDescription] = useState("");
  const [copyrightText, setCopyrightText] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactAddress, setContactAddress] = useState("");
  const [contactHours, setContactHours] = useState("");
  const [navItems, setNavItems] = useState<SiteNavItem[]>([]);
  const [footerGroups, setFooterGroups] = useState<SiteFooterGroup[]>([]);
  const [socialLinks, setSocialLinks] = useState<SiteSocialLink[]>([]);

  function apply(data: SiteSettings) {
    setBrandText(data.brandText);
    setCtaText(data.ctaText);
    setCtaHref(data.ctaHref);
    setCtaVisible(data.ctaVisible);
    setDietitianRegistrationEnabled(
      data.dietitianRegistrationEnabled ?? data.registrationEnabled,
    );
    setPatientRegistrationEnabled(data.patientRegistrationEnabled ?? data.registrationEnabled);
    setEmailNotificationsEnabled(data.emailNotificationsEnabled === true);
    setEmailVerificationRequired(data.emailVerificationRequired === true);
    setDietitianSignInLabel(data.dietitianSignInLabel);
    setPatientSignInLabel(data.patientSignInLabel);
    setFooterDescription(data.footerDescription);
    setCopyrightText(data.copyrightText);
    setContactEmail(data.contactEmail ?? "");
    setContactPhone(data.contactPhone ?? "");
    setContactAddress(data.contactAddress ?? "");
    setContactHours(data.contactHours ?? "");
    setNavItems(data.navItems.map((item, index) => ({ ...item, order: item.order ?? index })));
    setFooterGroups(
      data.footerGroups.map((group) => ({
        title: group.title,
        links: group.links.length > 0 ? group.links : [{ href: "/", label: "" }],
      })),
    );
    setSocialLinks(data.socialLinks.length > 0 ? data.socialLinks : []);
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

  useEffect(() => {
    if (initialTab === "admins") {
      router.replace("/admin/admins");
      return;
    }
    setTab(resolveTab(initialTab));
  }, [initialTab, router]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const cleanedNav = navItems
        .map((item, index) => ({
          href: item.href.trim(),
          label: item.label.trim(),
          visible: item.visible,
          order: index,
        }))
        .filter((item) => item.href && item.label);

      const cleanedFooter = footerGroups
        .map((group) => ({
          title: group.title.trim(),
          links: group.links
            .map((link) => ({ href: link.href.trim(), label: link.label.trim() }))
            .filter((link) => link.href && link.label),
        }))
        .filter((group) => group.title && group.links.length > 0);

      const cleanedSocial = socialLinks
        .map((link) => ({ label: link.label.trim(), href: link.href.trim() }))
        .filter((link) => link.href && link.label);

      const data = await api<SiteSettings>("/api/v1/admin/site-settings", {
        method: "PATCH",
        body: JSON.stringify({
          brandText,
          ctaText,
          ctaHref,
          ctaVisible,
          dietitianRegistrationEnabled,
          patientRegistrationEnabled,
          emailNotificationsEnabled,
          emailVerificationRequired,
          dietitianSignInLabel,
          patientSignInLabel,
          footerDescription,
          copyrightText,
          contactEmail: contactEmail.trim() ? contactEmail.trim() : null,
          contactPhone: contactPhone.trim() ? contactPhone.trim() : null,
          contactAddress: contactAddress.trim() ? contactAddress.trim() : null,
          contactHours: contactHours.trim() ? contactHours.trim() : null,
          navItems: cleanedNav,
          footerGroups: cleanedFooter,
          socialLinks: cleanedSocial,
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
    <AdminPage
      eyebrow="Website"
      title="Site"
      description="Brand, registration, navigation, and public contact details shown on the marketing site."
      error={error}
    >
      {message ? <Alert tone="success">{message}</Alert> : null}

      <Tabs items={[...SETTINGS_TABS]} value={tab} onChange={(id) => setTab(id as SettingsTab)} />

      <form onSubmit={(event) => void onSave(event)} className="ui-stack" style={{ marginTop: 16 }}>
        {tab === "brand" ? (
          <Section title="Brand" description="Public name, sign-in labels, and header CTA.">
            <div className="ui-stack" style={{ maxWidth: 520, gap: 16 }}>
              <Field label="Brand text">
                <Input value={brandText} onChange={(event) => setBrandText(event.target.value)} required />
              </Field>
              <Field label="Dietitian sign-in label">
                <Input
                  value={dietitianSignInLabel}
                  onChange={(event) => setDietitianSignInLabel(event.target.value)}
                  required
                />
              </Field>
              <Field label="Patient sign-in label">
                <Input
                  value={patientSignInLabel}
                  onChange={(event) => setPatientSignInLabel(event.target.value)}
                  required
                />
              </Field>
              <Field label="CTA text">
                <Input value={ctaText} onChange={(event) => setCtaText(event.target.value)} required />
              </Field>
              <Field label="CTA link">
                <Input value={ctaHref} onChange={(event) => setCtaHref(event.target.value)} required />
              </Field>
              <label className="ui-check">
                <input
                  type="checkbox"
                  checked={ctaVisible}
                  onChange={(event) => setCtaVisible(event.target.checked)}
                />
                <span>Show CTA button</span>
              </label>
            </div>
          </Section>
        ) : null}

        {tab === "access" ? (
          <Section title="Access" description="Who can register, and how email is handled.">
            <div className="ui-stack" style={{ maxWidth: 520, gap: 16 }}>
              <Field label="Self-serve registration">
                <div className="ui-stack" style={{ gap: 10 }}>
                  <label className="ui-check">
                    <input
                      type="checkbox"
                      checked={dietitianRegistrationEnabled}
                      onChange={(event) => setDietitianRegistrationEnabled(event.target.checked)}
                    />
                    <span>Allow dietitian (clinic) registration</span>
                  </label>
                  <label className="ui-check">
                    <input
                      type="checkbox"
                      checked={patientRegistrationEnabled}
                      onChange={(event) => setPatientRegistrationEnabled(event.target.checked)}
                    />
                    <span>Allow patient registration</span>
                  </label>
                </div>
              </Field>
              <Field label="Email verification">
                <label className="ui-check">
                  <input
                    type="checkbox"
                    checked={emailVerificationRequired}
                    onChange={(event) => setEmailVerificationRequired(event.target.checked)}
                  />
                  <span>Require email verification before sign-in</span>
                </label>
              </Field>
              <Field label="Product email notifications">
                <label className="ui-check">
                  <input
                    type="checkbox"
                    checked={emailNotificationsEnabled}
                    onChange={(event) => setEmailNotificationsEnabled(event.target.checked)}
                  />
                  <span>Send product emails (invoices, automation). Auth emails always send.</span>
                </label>
              </Field>
            </div>
          </Section>
        ) : null}

        {tab === "navigation" ? (
          <Section
            title="Navigation"
            description="Header links shown on the marketing site. Keep Pricing and Admin out of this list."
            actions={
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setNavItems((current) => [...current, emptyNavItem(current.length)])}
              >
                Add link
              </Button>
            }
          >
            {navItems.length === 0 ? <p className="ui-muted">No navigation links yet.</p> : null}
            <div className="ui-admin-editor-list">
              {navItems.map((item, index) => (
                <div key={`nav-${index}`} className="ui-admin-editor-row">
                  <Field label="Label">
                    <Input
                      value={item.label}
                      onChange={(event) =>
                        setNavItems((current) =>
                          current.map((row, i) => (i === index ? { ...row, label: event.target.value } : row)),
                        )
                      }
                      placeholder="Features"
                      required
                    />
                  </Field>
                  <Field label="Link">
                    <Input
                      value={item.href}
                      onChange={(event) =>
                        setNavItems((current) =>
                          current.map((row, i) => (i === index ? { ...row, href: event.target.value } : row)),
                        )
                      }
                      placeholder="/features"
                      required
                    />
                  </Field>
                  <label className="ui-check ui-admin-editor-check">
                    <input
                      type="checkbox"
                      checked={item.visible}
                      onChange={(event) =>
                        setNavItems((current) =>
                          current.map((row, i) => (i === index ? { ...row, visible: event.target.checked } : row)),
                        )
                      }
                    />
                    <span>Visible</span>
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setNavItems((current) => current.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        {tab === "footer" ? (
          <>
            <Section title="Footer copy">
              <div className="ui-stack" style={{ maxWidth: 520, gap: 16 }}>
                <Field label="Footer description">
                  <Textarea
                    rows={4}
                    value={footerDescription}
                    onChange={(event) => setFooterDescription(event.target.value)}
                    required
                  />
                </Field>
                <Field label="Copyright text">
                  <Input
                    value={copyrightText}
                    onChange={(event) => setCopyrightText(event.target.value)}
                    required
                  />
                </Field>
              </div>
            </Section>

            <Section
              title="Footer link groups"
              description="Columns of links in the site footer."
              actions={
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setFooterGroups((current) => [...current, emptyFooterGroup()])}
                >
                  Add group
                </Button>
              }
            >
              {footerGroups.length === 0 ? <p className="ui-muted">No footer groups yet.</p> : null}
              <div className="ui-admin-editor-list">
                {footerGroups.map((group, groupIndex) => (
                  <div key={`footer-group-${groupIndex}`} className="ui-admin-editor-group">
                    <div className="ui-admin-editor-row">
                      <Field label="Group title">
                        <Input
                          value={group.title}
                          onChange={(event) =>
                            setFooterGroups((current) =>
                              current.map((row, i) =>
                                i === groupIndex ? { ...row, title: event.target.value } : row,
                              ),
                            )
                          }
                          placeholder="Product"
                          required
                        />
                      </Field>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setFooterGroups((current) => current.filter((_, i) => i !== groupIndex))}
                      >
                        Remove group
                      </Button>
                    </div>
                    <div className="ui-admin-editor-list">
                      {group.links.map((link, linkIndex) => (
                        <div key={`footer-link-${groupIndex}-${linkIndex}`} className="ui-admin-editor-row">
                          <Field label="Label">
                            <Input
                              value={link.label}
                              onChange={(event) =>
                                setFooterGroups((current) =>
                                  current.map((row, i) =>
                                    i === groupIndex
                                      ? {
                                          ...row,
                                          links: row.links.map((item, j) =>
                                            j === linkIndex ? { ...item, label: event.target.value } : item,
                                          ),
                                        }
                                      : row,
                                  ),
                                )
                              }
                              placeholder="Features"
                              required
                            />
                          </Field>
                          <Field label="Link">
                            <Input
                              value={link.href}
                              onChange={(event) =>
                                setFooterGroups((current) =>
                                  current.map((row, i) =>
                                    i === groupIndex
                                      ? {
                                          ...row,
                                          links: row.links.map((item, j) =>
                                            j === linkIndex ? { ...item, href: event.target.value } : item,
                                          ),
                                        }
                                      : row,
                                  ),
                                )
                              }
                              placeholder="/features"
                              required
                            />
                          </Field>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setFooterGroups((current) =>
                                current.map((row, i) =>
                                  i === groupIndex
                                    ? { ...row, links: row.links.filter((_, j) => j !== linkIndex) }
                                    : row,
                                ),
                              )
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setFooterGroups((current) =>
                          current.map((row, i) =>
                            i === groupIndex ? { ...row, links: [...row.links, { href: "/", label: "" }] } : row,
                          ),
                        )
                      }
                    >
                      Add link
                    </Button>
                  </div>
                ))}
              </div>
            </Section>

            <Section
              title="Social links"
              actions={
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setSocialLinks((current) => [...current, emptySocialLink()])}
                >
                  Add link
                </Button>
              }
            >
              {socialLinks.length === 0 ? <p className="ui-muted">No social links yet.</p> : null}
              <div className="ui-admin-editor-list">
                {socialLinks.map((link, index) => (
                  <div key={`social-${index}`} className="ui-admin-editor-row">
                    <Field label="Label">
                      <Input
                        value={link.label}
                        onChange={(event) =>
                          setSocialLinks((current) =>
                            current.map((row, i) => (i === index ? { ...row, label: event.target.value } : row)),
                          )
                        }
                        placeholder="LinkedIn"
                        required
                      />
                    </Field>
                    <Field label="URL">
                      <Input
                        value={link.href}
                        onChange={(event) =>
                          setSocialLinks((current) =>
                            current.map((row, i) => (i === index ? { ...row, href: event.target.value } : row)),
                          )
                        }
                        placeholder="https://"
                        required
                      />
                    </Field>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setSocialLinks((current) => current.filter((_, i) => i !== index))}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </Section>
          </>
        ) : null}

        {tab === "contact" ? (
          <Section
            title="Public contact"
            description="Shown on the website contact page and footer. Incoming form messages go to Inbox."
          >
            <p className="ui-muted" style={{ marginTop: 0 }}>
              <Link href="/admin/contact" className="ui-link">
                Open inbox
              </Link>
            </p>
            <div className="ui-stack" style={{ maxWidth: 520, gap: 16 }}>
              <Field label="Contact email">
                <Input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} />
              </Field>
              <Field label="Contact phone">
                <Input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
              </Field>
              <Field label="Contact address">
                <Textarea
                  rows={3}
                  value={contactAddress}
                  onChange={(event) => setContactAddress(event.target.value)}
                />
              </Field>
              <Field label="Contact hours">
                <Input value={contactHours} onChange={(event) => setContactHours(event.target.value)} />
              </Field>
            </div>
          </Section>
        ) : null}

        <div className="ui-row">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </AdminPage>
  );
}

export default function AdminSiteSettingsPage() {
  return (
    <Suspense fallback={<LoadingState>Loading site settings…</LoadingState>}>
      <AdminSiteSettingsForm />
    </Suspense>
  );
}
