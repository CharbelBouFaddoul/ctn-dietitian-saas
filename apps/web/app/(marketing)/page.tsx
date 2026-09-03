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
            <span className="ui-mkt__preview-group">Overview</span>
            <span className="is-active">Dashboard</span>
            <span className="ui-mkt__preview-group">Patients</span>
            <span>Clients</span>
            <span>Habit library</span>
            <span>Messages</span>
            <span className="ui-mkt__preview-group">Nutrition</span>
            <span>Meal Plans</span>
            <span>Recipes</span>
            <span>Foods</span>
            <span className="ui-mkt__preview-group">Clinic</span>
            <span>Calendar</span>
            <span>Tasks</span>
            <span>Invoices</span>
            <span className="ui-mkt__preview-group">Insights</span>
            <span>Analytics</span>
            <span>AI</span>
            <span>Automations</span>
            <span className="ui-mkt__preview-group">System</span>
            <span>Profile</span>
          </aside>
          <div className="ui-mkt__preview-main">
            <div className="ui-mkt__preview-kpis">
              <div className="ui-mkt__preview-kpi">
                <span>Clients</span>
                <strong>28 / 40</strong>
                <em>3 new this month</em>
              </div>
              <div className="ui-mkt__preview-kpi">
                <span>Unread messages</span>
                <strong>5</strong>
                <em>4 open tasks</em>
              </div>
              <div className="ui-mkt__preview-kpi">
                <span>Outstanding</span>
                <strong>2</strong>
                <em>1 overdue</em>
              </div>
              <div className="ui-mkt__preview-kpi">
                <span>Paid this month</span>
                <strong>$1,240</strong>
                <em>Invoiced $1,860</em>
              </div>
            </div>
            <div className="ui-mkt__preview-list">
              <span className="ui-mkt__preview-list-label">Today’s appointments</span>
              <div className="ui-mkt__preview-line">
                <span>10:00 · Follow-up</span>
                <span className="ui-muted">Confirmed</span>
              </div>
              <div className="ui-mkt__preview-line">
                <span>14:30 · Initial visit</span>
                <span className="ui-muted">Confirmed</span>
              </div>
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
        const data = (await res.json()) as {
          plansPageEnabled?: boolean;
          dietitianRegistrationEnabled?: boolean;
          registrationEnabled?: boolean;
          trialSignupEnabled?: boolean;
        };
        const dietitianOn =
          data.dietitianRegistrationEnabled === true ||
          (data.dietitianRegistrationEnabled === undefined && data.registrationEnabled === true);
        if (dietitianOn) {
          setGetStartedHref("/auth/dietitian/register");
        } else {
          setGetStartedHref(data.plansPageEnabled === true ? "/plans" : "/contact");
        }
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
              <h1>One workspace for the whole clinic.</h1>
              <p>
                Most dietitians still run care across spreadsheets, chat threads, and shared folders. This platform
                keeps the record, the meal plan, patient logs, messaging, visits, and invoices together. Patients follow
                care in a simple portal.
              </p>
              <div className="ui-mkt__hero-ctas">
                <Link href={getStartedHref} className="ui-btn ui-btn--primary ui-btn--lg">
                  Start free trial
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
            <p>One platform with two clear sides of care, connected by a simple clinic join code.</p>
          </div>
          <div className="ui-mkt__split">
            <article className="ui-mkt__experience ui-mkt__experience--dietitian">
              <p className="ui-eyebrow">For dietitians</p>
              <h3>Run the clinic</h3>
              <ul>
                {dietitianHighlights.map((feature) => (
                  <li key={feature.id}>{feature.title}</li>
                ))}
                <li>Invoices, tasks, analytics, and automations</li>
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
            <h2>From the first client to the next visit.</h2>
            <p>
              Patients join with a clinic code. You publish the plan and review tracking on the same record.
            </p>
          </div>
          <div className="ui-mkt__steps">
            <article className="ui-mkt__step">
              <div className="ui-mkt__step-num">01</div>
              <h3>Add the client</h3>
              <p>Share a clinic join code. The patient creates an account and appears on your roster.</p>
            </article>
            <article className="ui-mkt__step">
              <div className="ui-mkt__step-num">02</div>
              <h3>Publish the plan</h3>
              <p>Build the meal plan on the chart. The current version is available in the patient portal.</p>
            </article>
            <article className="ui-mkt__step">
              <div className="ui-mkt__step-num">03</div>
              <h3>Review progress</h3>
              <p>Read the logs before the visit. Messages, appointments, and invoices stay on the same record.</p>
            </article>
          </div>
          <div style={{ marginTop: 28 }}>
            <Link href="/how-it-works" className="ui-link">
              See how it works →
            </Link>
          </div>
        </div>
      </section>

      <section className="ui-mkt__band ui-mkt__band--slate">
        <div className="ui-mkt__section">
          <div className="ui-mkt__section-head">
            <p className="ui-eyebrow">The problem we solve</p>
            <h2>Spreadsheets, chats, and folders are not a clinic.</h2>
            <p>We replace that patchwork so care and the practice live on the same client record.</p>
          </div>
          <ul className="ui-mkt__why-list">
            <li>
              <strong>The chart stays complete</strong>
              <span>
                Notes, measurements, meal plans, messages, documents, and invoices sit together, instead of across
                files and inboxes. Print or download PDF from the main chart sections when you need a paper copy.
              </span>
            </li>
            <li>
              <strong>You can see follow-through</strong>
              <span>
                Patients join with a clinic code and log food, habits, and progress in the portal, so you review what
                happened instead of chasing recaps.
              </span>
            </li>
            <li>
              <strong>The practice still runs</strong>
              <span>
                Calendar, tasks, analytics, and invoicing are part of the same workspace, not a separate pile of tools.
              </span>
            </li>
          </ul>
        </div>
      </section>

      <section className="ui-mkt__band ui-mkt__band--cta">
        <div className="ui-mkt__cta-band">
          <h2>Ready to leave the patchwork behind?</h2>
          <p>Start a 14-day trial, open the workspace the same day, and keep the clinic in one place.</p>
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
