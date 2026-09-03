"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Field, Input, LoadingState, Textarea } from "@nutrition-saas/ui";
import { API_URL } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";
import { FALLBACK_SITE_SETTINGS, type SiteSettings } from "../../../lib/marketing/site-settings";

interface PublicPlan {
  name: string;
  slug: string;
}

function humanizePlanSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function DetailValue({ value, href }: { value: string | null; href?: string }) {
  if (!value) return <span className="ui-mkt__contact-empty">Not configured</span>;
  if (href) {
    return (
      <a className="ui-link" href={href}>
        {value}
      </a>
    );
  }
  return value;
}

export default function ContactPage() {
  return (
    <Suspense fallback={<LoadingState>Loading contact…</LoadingState>}>
      <ContactPageContent />
    </Suspense>
  );
}

function ContactPageContent() {
  const searchParams = useSearchParams();
  const planSlug = (searchParams.get("plan") || "").trim();
  const [settings, setSettings] = useState<SiteSettings>(FALLBACK_SITE_SETTINGS);
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);
  const plansPageEnabled = settings.plansPageEnabled === true;

  useEffect(() => {
    void fetch(`${API_URL}/api/v1/public/site-settings`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as SiteSettings;
        setSettings({ ...FALLBACK_SITE_SETTINGS, ...data });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!plansPageEnabled) {
      setPlans([]);
      return;
    }
    void fetch(`${API_URL}/api/v1/public/plans`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as PublicPlan[];
        setPlans(data);
      })
      .catch(() => undefined);
  }, [plansPageEnabled]);

  useEffect(() => {
    if (prefilled) return;
    const slug = planSlug;
    if (!slug) return;
    const matched = plans.find((plan) => plan.slug === slug);
    const planName = matched?.name ?? humanizePlanSlug(slug);
    setSubject(`Interested in the ${planName} plan`);
    setMessage(
      `Hi,\n\nI'm interested in the ${planName} plan for my nutrition clinic. Please contact me to discuss getting set up.\n\nThanks.`,
    );
    setPrefilled(true);
  }, [planSlug, plans, prefilled]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSending(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/public/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
          ...(planSlug ? { planSlug } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string | string[] };
      if (!response.ok) {
        const raw = Array.isArray(payload.message) ? payload.message.join(", ") : payload.message;
        throw new Error(raw || "Unable to send message");
      }
      setSent(true);
    } catch (err) {
      setError(errorMessage(err, "Unable to send message. Please try again."));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <section className="ui-mkt__band ui-mkt__band--warm">
        <div className="ui-mkt__hero ui-mkt__hero--contact">
          <p className="ui-eyebrow">Contact</p>
          <h1>Let’s talk about your clinic.</h1>
          <p>Questions about getting started, a plan, or the patient portal. We reply by email.</p>
        </div>
      </section>

      <section className="ui-mkt__band ui-mkt__band--warm">
        <div className="ui-mkt__section ui-mkt__contact">
          <div className="ui-mkt__contact-sheet">
            <aside className="ui-mkt__contact-info">
              <p className="ui-eyebrow">Reach us</p>
              <h2>Contact information</h2>
              <p className="ui-mkt__contact-lede">Prefer email or a call? Use the details below, or send a message.</p>
              <dl>
                <div className="ui-mkt__contact-row">
                  <dt>Email</dt>
                  <dd>
                    <DetailValue
                      value={settings.contactEmail}
                      href={settings.contactEmail ? `mailto:${settings.contactEmail}` : undefined}
                    />
                  </dd>
                </div>
                <div className="ui-mkt__contact-row">
                  <dt>Phone</dt>
                  <dd>
                    <DetailValue
                      value={settings.contactPhone}
                      href={settings.contactPhone ? `tel:${settings.contactPhone.replace(/\s+/g, "")}` : undefined}
                    />
                  </dd>
                </div>
                <div className="ui-mkt__contact-row">
                  <dt>Location</dt>
                  <dd>
                    <DetailValue value={settings.contactAddress} />
                  </dd>
                </div>
                <div className="ui-mkt__contact-row">
                  <dt>Hours</dt>
                  <dd>
                    <DetailValue value={settings.contactHours} />
                  </dd>
                </div>
              </dl>
            </aside>

            <div className="ui-mkt__contact-form">
              <p className="ui-eyebrow">Message</p>
              <h2>Send a message</h2>
              {sent ? (
                <Alert tone="success">We received your message. We will reply by email.</Alert>
              ) : (
                <form className="ui-mkt__contact-fields" onSubmit={onSubmit}>
                  <div className="ui-mkt__contact-row-fields">
                    <Field label="Name">
                      <Input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" />
                    </Field>
                    <Field label="Email">
                      <Input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                        autoComplete="email"
                      />
                    </Field>
                  </div>
                  <Field label="Subject">
                    <Input value={subject} onChange={(event) => setSubject(event.target.value)} required />
                  </Field>
                  <Field label="Message">
                    <Textarea value={message} onChange={(event) => setMessage(event.target.value)} required rows={6} />
                  </Field>
                  {error ? <Alert tone="danger">{error}</Alert> : null}
                  <div className="ui-mkt__contact-actions">
                    <Button type="submit" disabled={sending}>
                      {sending ? "Sending..." : "Send message"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
