"use client";

import { FormEvent, useEffect, useState } from "react";
import { Alert, Button, Field, Input, Select, Textarea } from "@nutrition-saas/ui";
import { API_URL } from "../../../lib/api";
import { FALLBACK_SITE_SETTINGS, type SiteSettings } from "../../../lib/marketing/site-settings";

export default function ContactPage() {
  const [settings, setSettings] = useState<SiteSettings>(FALLBACK_SITE_SETTINGS);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [topic, setTopic] = useState("Getting started");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`${API_URL}/api/v1/public/site-settings`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as SiteSettings;
        setSettings({ ...FALLBACK_SITE_SETTINGS, ...data });
      })
      .catch(() => undefined);
  }, []);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const destination = settings.contactEmail;
    if (!destination) {
      setError(
        "A contact email is not configured yet. Please ask the platform owner to set it in Site settings, or try again later.",
      );
      return;
    }
    const body = [`Name: ${name}`, `Email: ${email}`, `Topic: ${topic}`, "", message].join("\n");
    const mailto = `mailto:${encodeURIComponent(destination)}?subject=${encodeURIComponent(subject || topic)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setSent(true);
  }

  return (
    <>
      <section className="ui-mkt__band ui-mkt__band--white">
        <div className="ui-mkt__hero">
          <p className="ui-eyebrow">Contact</p>
          <h1>Let’s talk about your practice.</h1>
          <p>Questions about getting started, the dietitian workspace, or the patient portal — reach out and we’ll help.</p>
        </div>
      </section>

      <section className="ui-mkt__band ui-mkt__band--white">
        <div className="ui-mkt__section" style={{ paddingTop: 0 }}>
          <div className="ui-mkt__contact-grid">
            <aside className="ui-mkt__contact-info">
              <p className="ui-eyebrow">Reach us</p>
              <h2>Contact information</h2>
              <p className="ui-mkt__contact-lede">
                Prefer email or a quick call? Use the details below — they come from platform site settings.
              </p>
              <dl>
                <div className="ui-mkt__contact-row">
                  <dt>Email</dt>
                  <dd>
                    {settings.contactEmail ? (
                      <a className="ui-link" href={`mailto:${settings.contactEmail}`}>
                        {settings.contactEmail}
                      </a>
                    ) : (
                      <span className="ui-muted">Not configured</span>
                    )}
                  </dd>
                </div>
                <div className="ui-mkt__contact-row">
                  <dt>Phone</dt>
                  <dd>{settings.contactPhone || <span className="ui-muted">Not configured</span>}</dd>
                </div>
                <div className="ui-mkt__contact-row">
                  <dt>Location</dt>
                  <dd>{settings.contactAddress || <span className="ui-muted">Not configured</span>}</dd>
                </div>
                <div className="ui-mkt__contact-row">
                  <dt>Hours</dt>
                  <dd>{settings.contactHours || <span className="ui-muted">Not configured</span>}</dd>
                </div>
              </dl>
            </aside>

            <div className="ui-mkt__contact-form">
              <p className="ui-eyebrow">Message</p>
              <h2>Send a message</h2>
              {sent ? (
                <Alert tone="success">
                  Your email client should open with the message ready to send. If nothing opened, email us directly using
                  the address on the left.
                </Alert>
              ) : (
                <form className="ui-mkt__contact-fields" onSubmit={onSubmit}>
                  <Field label="What can we help with?">
                    <Select value={topic} onChange={(event) => setTopic(event.target.value)} aria-label="Topic">
                      <option>Getting started</option>
                      <option>Sales</option>
                      <option>Technical support</option>
                      <option>Partnerships</option>
                    </Select>
                  </Field>
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
                    <Button type="submit">Send message</Button>
                    <p className="ui-muted">Opens your email client with this message ready to send.</p>
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
