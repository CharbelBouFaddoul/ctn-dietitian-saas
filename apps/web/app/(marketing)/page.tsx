"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resolveSessionHome } from "../../lib/session-home";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    void resolveSessionHome().then((home) => {
      if (home.kind !== "unauthenticated") {
        router.replace(home.path);
      }
    });
  }, [router]);

  return (
    <>
      <section className="ui-mkt__hero">
        <p className="ui-eyebrow">For dietitians</p>
        <h1>Run your nutrition practice with confidence.</h1>
        <p>
          One place for client care, meal plans, tracking, messaging, and billing. Your clients get a simple portal —
          they create their own account, then join your practice with a code you share.
        </p>
        <div className="ui-row" style={{ marginTop: 24 }}>
          <Link href="/auth/register" className="ui-btn ui-btn--primary ui-btn--lg">
            Get Started
          </Link>
          <Link href="/auth/login" className="ui-btn ui-btn--secondary ui-btn--lg">
            Sign In
          </Link>
        </div>
      </section>

      <section className="ui-mkt__section">
        <h2>How it works</h2>
        <div className="ui-grid">
          <article className="ui-card">
            <h3 className="ui-card__title">Create your practice</h3>
            <p className="ui-muted">Register, verify your email, and set up your clinic in a few minutes.</p>
          </article>
          <article className="ui-card">
            <h3 className="ui-card__title">Invite with a join code</h3>
            <p className="ui-muted">
              Clients register themselves. You send a practice code. They enter it once and appear on your list.
            </p>
          </article>
          <article className="ui-card">
            <h3 className="ui-card__title">Care from one workspace</h3>
            <p className="ui-muted">Plans, tracking, messages, documents, and invoices stay together for each client.</p>
          </article>
        </div>
      </section>
    </>
  );
}
