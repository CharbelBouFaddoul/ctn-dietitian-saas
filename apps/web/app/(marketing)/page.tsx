"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_URL } from "../../lib/api";
import { highlightedFeatures } from "../../lib/marketing/features-catalog";

function ProductPreview() {
  return (
    <div className="ui-mkt__preview-stage" aria-hidden="true">
      <div className="ui-mkt__preview">
        <div className="ui-mkt__preview-bar">
          <span>Clinic workspace</span>
          <span className="ui-muted">Today</span>
        </div>
        <div className="ui-mkt__preview-body">
          <aside className="ui-mkt__preview-side">
            <span className="is-active">Dashboard</span>
            <span>Clients</span>
            <span>Messages</span>
            <span>Meal Plans</span>
            <span>Meal library</span>
            <span>Foods</span>
            <span>Calendar</span>
            <span>Tasks</span>
            <span>Invoices</span>
            <span>Analytics</span>
            <span>Settings</span>
          </aside>
          <div className="ui-mkt__preview-main">
            <div className="ui-mkt__preview-line">
              <span>Active clients</span>
              <span className="ui-muted">42</span>
            </div>
            <div className="ui-mkt__preview-line">
              <span>Today’s appointments</span>
              <span className="ui-muted">3 scheduled</span>
            </div>
            <div>
              <div className="ui-mkt__preview-line">
                <span>Tasks due</span>
                <span className="ui-muted">2 overdue</span>
              </div>
              <div className="ui-mkt__preview-meter">
                <span />
              </div>
            </div>
            <div className="ui-mkt__preview-line">
              <span>Recent messages</span>
              <span className="ui-muted">4 unread</span>
            </div>
            <div className="ui-mkt__preview-line">
              <span>Invoices</span>
              <span className="ui-muted">Open · paid</span>
            </div>
          </div>
        </div>
      </div>
      <div className="ui-mkt__preview-float">
        <strong>Clinic join code</strong>
        Patients create their account, then connect with your code.
      </div>
    </div>
  );
}

export default function HomePage() {
  const [getStartedHref, setGetStartedHref] = useState("/contact");
  const dietitianHighlights = highlightedFeatures("dietitian").slice(0, 4);
  const patientHighlights = highlightedFeatures("patient").slice(0, 4);

  useEffect(() => {
    void fetch(`${API_URL}/api/v1/public/site-settings`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { plansPageEnabled?: boolean };
        setGetStartedHref(data.plansPageEnabled === true ? "/plans" : "/contact");
      })
      .catch(() => undefined);
  }, []);

  return (
    <>
      <section className="ui-mkt__band ui-mkt__band--hero">
        <div className="ui-mkt__hero">
          <div className="ui-mkt__hero-grid">
            <div>
              <p className="ui-eyebrow">Nutrition clinic platform</p>
              <h1>Everything you need to run a modern nutrition clinic.</h1>
              <p>
                Manage clients, meal plans, tracking, appointments, messaging, documents, invoices, and analytics in one
                workspace — while patients use a focused portal to follow their plan and stay connected.
              </p>
              <div className="ui-mkt__hero-ctas">
                <Link href={getStartedHref} className="ui-btn ui-btn--primary ui-btn--lg">
                  Get Started
                </Link>
                <Link href="/auth/dietitian/login" className="ui-btn ui-btn--secondary ui-btn--lg">
                  Sign in as Dietitian
                </Link>
              </div>
            </div>
            <ProductPreview />
          </div>
        </div>
      </section>

      <section className="ui-mkt__band ui-mkt__band--mint">
        <div className="ui-mkt__section">
          <div className="ui-mkt__section-head">
            <p className="ui-eyebrow">Two experiences</p>
            <h2>Built for dietitians and the patients they support.</h2>
            <p>One platform, two clear sides of care — connected by a simple clinic join code.</p>
          </div>
          <div className="ui-mkt__split">
            <article className="ui-mkt__experience ui-mkt__experience--dietitian">
              <p className="ui-eyebrow">For dietitians</p>
              <h3>Run the clinic</h3>
              <ul>
                {dietitianHighlights.map((feature) => (
                  <li key={feature.id}>{feature.title}</li>
                ))}
                <li>Invoices, tasks, analytics, and optional AI &amp; automations</li>
              </ul>
              <div className="ui-mkt__experience-cta">
                <Link href="/features#dietitian" className="ui-link">
                  Explore the dietitian experience →
                </Link>
              </div>
            </article>
            <article className="ui-mkt__experience ui-mkt__experience--patient">
              <p className="ui-eyebrow">For patients</p>
              <h3>Follow the plan</h3>
              <ul>
                {patientHighlights.map((feature) => (
                  <li key={feature.id}>{feature.title}</li>
                ))}
              </ul>
              <div className="ui-mkt__experience-cta">
                <Link href="/auth/client/login" className="ui-link">
                  Patient sign in →
                </Link>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="ui-mkt__band ui-mkt__band--warm">
        <div className="ui-mkt__section">
          <div className="ui-mkt__section-head">
            <p className="ui-eyebrow">How it works</p>
            <h2>From clinic setup to shared care.</h2>
            <p>Patients create their own account. You share a short clinic code. They connect once — then care stays in sync.</p>
          </div>
          <div className="ui-mkt__steps">
            <article className="ui-mkt__step">
              <div className="ui-mkt__step-num">01</div>
              <h3>Choose a plan</h3>
              <p>Pick a plan that fits your clinic, contact us to get set up, then open your workspace.</p>
            </article>
            <article className="ui-mkt__step">
              <div className="ui-mkt__step-num">02</div>
              <h3>Share a join code</h3>
              <p>Generate a clinic code and send it to your client — no complicated invitation links required.</p>
            </article>
            <article className="ui-mkt__step">
              <div className="ui-mkt__step-num">03</div>
              <h3>Care together</h3>
              <p>Publish meal plans, review tracking, message, share documents, and manage the journey in one place.</p>
            </article>
          </div>
          <div style={{ marginTop: 28 }}>
            <Link href="/how-it-works" className="ui-link">
              See the full workflow →
            </Link>
          </div>
        </div>
      </section>

      <section className="ui-mkt__band ui-mkt__band--slate">
        <div className="ui-mkt__section">
          <div className="ui-mkt__section-head">
            <p className="ui-eyebrow">Why one platform</p>
            <h2>Replace spreadsheets, chat threads, and scattered files.</h2>
          </div>
          <ul className="ui-mkt__why-list">
            <li>
              <strong>Client care stays together</strong>
              <span>Charts, plans, tracking, messages, documents, and invoices live on the same client record.</span>
            </li>
            <li>
              <strong>Patients join themselves</strong>
              <span>They register, enter your clinic code, and appear on your roster — without password handoffs.</span>
            </li>
            <li>
              <strong>Clinic operations included</strong>
              <span>Calendar, tasks, analytics, and optional automations when your plan includes them.</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="ui-mkt__band ui-mkt__band--cta">
        <div className="ui-mkt__cta-band">
          <h2>Ready to modernize your nutrition clinic?</h2>
          <p>Dietitians run the workspace. Patients use the portal. One connected platform for both.</p>
          <div className="ui-mkt__hero-ctas" style={{ justifyContent: "center" }}>
            <Link href={getStartedHref} className="ui-btn ui-btn--primary ui-btn--lg">
              Get Started
            </Link>
            <Link href="/auth/dietitian/login" className="ui-btn ui-btn--secondary ui-btn--lg">
              Sign in as Dietitian
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
