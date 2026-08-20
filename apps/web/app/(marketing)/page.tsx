"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { highlightedFeatures } from "../../lib/marketing/features-catalog";
import { resolveSessionHome } from "../../lib/session-home";

function ProductPreview() {
  return (
    <div className="ui-mkt__preview-stage" aria-hidden="true">
      <div className="ui-mkt__preview">
        <div className="ui-mkt__preview-bar">
          <span>Practice workspace</span>
          <span className="ui-muted">Today</span>
        </div>
        <div className="ui-mkt__preview-body">
          <aside className="ui-mkt__preview-side">
            <span className="is-active">Clients</span>
            <span>Meal plans</span>
            <span>Calendar</span>
            <span>Messages</span>
            <span>Tasks</span>
            <span>Analytics</span>
          </aside>
          <div className="ui-mkt__preview-main">
            <div className="ui-mkt__preview-line">
              <span>Client chart</span>
              <span className="ui-muted">Goals · measurements</span>
            </div>
            <div className="ui-mkt__preview-line">
              <span>Published meal plan</span>
              <span className="ui-muted">Draft → portal</span>
            </div>
            <div>
              <div className="ui-mkt__preview-line">
                <span>Tracking review</span>
                <span className="ui-muted">Food · water · habits</span>
              </div>
              <div className="ui-mkt__preview-meter">
                <span />
              </div>
            </div>
            <div className="ui-mkt__preview-line">
              <span>Messages</span>
              <span className="ui-muted">One thread per client</span>
            </div>
            <div className="ui-mkt__preview-line">
              <span>Appointments</span>
              <span className="ui-muted">Calendar + tasks</span>
            </div>
          </div>
        </div>
      </div>
      <div className="ui-mkt__preview-float">
        <strong>Practice join code</strong>
        Patients create their account, then connect with your code.
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const dietitianHighlights = highlightedFeatures("dietitian").slice(0, 4);
  const patientHighlights = highlightedFeatures("patient").slice(0, 4);

  useEffect(() => {
    void resolveSessionHome().then((home) => {
      if (home.kind !== "unauthenticated") {
        router.replace(home.path);
      }
    });
  }, [router]);

  return (
    <>
      <section className="ui-mkt__band ui-mkt__band--hero">
        <div className="ui-mkt__hero">
          <div className="ui-mkt__hero-grid">
            <div>
              <p className="ui-eyebrow">Nutrition practice platform</p>
              <h1>Everything you need to run a modern nutrition practice.</h1>
              <p>
                Manage clients, meal plans, tracking, appointments, messaging, documents, invoices, and analytics in one
                workspace — while patients use a focused portal to follow their plan and stay connected.
              </p>
              <div className="ui-mkt__hero-ctas">
                <Link href="/auth/dietitian/register" className="ui-btn ui-btn--primary ui-btn--lg">
                  Start your practice
                </Link>
                <Link href="/auth/client/login" className="ui-btn ui-btn--secondary ui-btn--lg">
                  Sign in as Patient
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
            <p>One platform, two clear sides of care — connected by a simple practice join code.</p>
          </div>
          <div className="ui-mkt__split">
            <article className="ui-mkt__experience ui-mkt__experience--dietitian">
              <p className="ui-eyebrow">For dietitians</p>
              <h3>Run the practice</h3>
              <ul>
                {dietitianHighlights.map((feature) => (
                  <li key={feature.id}>{feature.title}</li>
                ))}
                <li>Invoices, tasks, analytics, and optional AI &amp; automations</li>
              </ul>
              <div style={{ marginTop: "0.75rem" }}>
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
              <div style={{ marginTop: "0.75rem" }}>
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
            <h2>From practice setup to shared care.</h2>
            <p>Patients create their own account. You share a short practice code. They connect once — then care stays in sync.</p>
          </div>
          <div className="ui-mkt__steps">
            <article className="ui-mkt__step">
              <div className="ui-mkt__step-num">01</div>
              <h3>Create your practice</h3>
              <p>Register as a dietitian, verify your email, and open your practice workspace.</p>
            </article>
            <article className="ui-mkt__step">
              <div className="ui-mkt__step-num">02</div>
              <h3>Share a join code</h3>
              <p>Generate a practice code and send it to your client — no complicated invitation links required.</p>
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
              <span>They register, enter your practice code, and appear on your roster — without password handoffs.</span>
            </li>
            <li>
              <strong>Practice operations included</strong>
              <span>Calendar, tasks, analytics, and optional AI assistance and automations when your plan includes them.</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="ui-mkt__band ui-mkt__band--cta">
        <div className="ui-mkt__cta-band">
          <h2>Ready to modernize your nutrition practice?</h2>
          <p>Dietitians run the workspace. Patients use the portal. One connected platform for both.</p>
          <div className="ui-mkt__hero-ctas" style={{ justifyContent: "center" }}>
            <Link href="/auth/dietitian/register" className="ui-btn ui-btn--primary ui-btn--lg">
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
