"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, LoadingState } from "@nutrition-saas/ui";
import { API_URL } from "../../../lib/api";

interface PublicPlanFeature {
  key: string;
  name: string;
  valueType: "BOOLEAN" | "LIMIT";
  limitValue: number | null;
}

interface PublicPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  durationDays: number;
  currency: string;
  priceCents: number | null;
  showPrice: boolean;
  features: PublicPlanFeature[];
}

const FEATURE_GROUPS: Array<{
  id: string;
  keys: string[];
  label: (features: PublicPlanFeature[]) => string | null;
}> = [
  {
    id: "clients",
    keys: ["CLIENTS", "CLIENT_LIMIT"],
    label: (features) => {
      if (!hasAny(features, ["CLIENTS", "CLIENT_LIMIT"])) return null;
      const limit = features.find((f) => f.key === "CLIENT_LIMIT");
      if (limit?.limitValue != null) {
        return `Client charts and records, up to ${limit.limitValue.toLocaleString()}`;
      }
      if (limit && limit.limitValue == null && limit.valueType === "LIMIT") {
        return "Client charts and records, unlimited";
      }
      return "Client charts and clinical records";
    },
  },
  {
    id: "nutrition",
    keys: ["MEAL_PLANS", "MEAL_LIBRARY", "FOODS"],
    label: (features) =>
      hasAny(features, ["MEAL_PLANS", "MEAL_LIBRARY", "FOODS"])
        ? "Meal planning, recipes, and food database"
        : null,
  },
  {
    id: "portal",
    keys: ["TRACKING", "HABITS", "MEAL_PLANS"],
    label: (features) =>
      hasAny(features, ["TRACKING", "HABITS", "MEAL_PLANS"])
        ? "Patient portal for plans, logging, and progress"
        : null,
  },
  {
    id: "care",
    keys: ["MESSAGING", "APPOINTMENTS", "ASSESSMENTS"],
    label: (features) =>
      hasAny(features, ["MESSAGING", "APPOINTMENTS", "ASSESSMENTS"])
        ? "Messaging, scheduling, and clinical forms"
        : null,
  },
  {
    id: "ops",
    keys: ["DASHBOARD", "INVOICES", "ANALYTICS"],
    label: (features) =>
      hasAny(features, ["DASHBOARD", "INVOICES", "ANALYTICS"])
        ? "Invoicing, dashboard, and analytics"
        : null,
  },
  {
    id: "automation",
    keys: ["AUTOMATION"],
    label: (features) => (hasAny(features, ["AUTOMATION"]) ? "Automations for reminders and follow-ups" : null),
  },
  {
    id: "ai",
    keys: ["AI"],
    label: (features) => (hasAny(features, ["AI"]) ? "AI assistance for notes, plans, and messages" : null),
  },
];

function hasAny(features: PublicPlanFeature[], keys: string[]) {
  const set = new Set(features.map((f) => f.key));
  return keys.some((key) => set.has(key));
}

function summarizePlanFeatures(features: PublicPlanFeature[]): string[] {
  const lines: string[] = [];

  for (const group of FEATURE_GROUPS) {
    const line = group.label(features);
    if (!line) continue;
    lines.push(line);
  }

  return lines;
}

function formatPrice(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function pickFeaturedId(plans: PublicPlan[]): string | null {
  if (plans.length < 2) return null;
  const bySlug = plans.find((plan) => plan.slug === "pro");
  if (bySlug) return bySlug.id;
  const withAdvanced = plans.find((plan) =>
    plan.features.some((feature) => feature.key === "AI" || feature.key === "AUTOMATION"),
  );
  return (withAdvanced ?? plans[plans.length - 1]).id;
}

export function PlansPageClient() {
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlineCheckoutEnabled, setOnlineCheckoutEnabled] = useState(false);
  const [dietitianRegistrationEnabled, setDietitianRegistrationEnabled] = useState(false);

  useEffect(() => {
    void fetch(`${API_URL}/api/v1/public/plans`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Unable to load plans");
        const data = (await res.json()) as PublicPlan[];
        setPlans(data);
        setError(null);
      })
      .catch(() => {
        setError("Unable to load plans right now. Please try again or contact us.");
        setPlans([]);
      });
    void fetch(`${API_URL}/api/v1/public/site-settings`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as {
          onlineCheckoutEnabled?: boolean;
          dietitianRegistrationEnabled?: boolean;
          registrationEnabled?: boolean;
        };
        setOnlineCheckoutEnabled(data.onlineCheckoutEnabled === true);
        setDietitianRegistrationEnabled(
          data.dietitianRegistrationEnabled === true ||
            (data.dietitianRegistrationEnabled === undefined && data.registrationEnabled === true),
        );
      })
      .catch(() => undefined);
  }, []);

  const featuredId = useMemo(() => (plans && plans.length > 0 ? pickFeaturedId(plans) : null), [plans]);
  const basePlan = useMemo(() => {
    if (!plans || !featuredId) return null;
    return plans.find((plan) => plan.id !== featuredId) ?? plans[0];
  }, [plans, featuredId]);

  return (
    <>
      <section className="ui-mkt__band ui-mkt__band--hero">
        <div className="ui-mkt__hero">
          <p className="ui-eyebrow">Plans</p>
          <h1>Standard or Pro.</h1>
          <p>
            Standard is the full clinic workspace. Pro adds automations and AI. Create an account to start a 14-day
            trial with sample clients, then continue on the plan you need.
          </p>
          <div className="ui-mkt__hero-ctas">
            {dietitianRegistrationEnabled ? (
              <Link href="/auth/dietitian/register" className="ui-btn ui-btn--primary ui-btn--lg">
                Start free trial
              </Link>
            ) : (
              <Link href="/contact" className="ui-btn ui-btn--primary ui-btn--lg">
                Contact us
              </Link>
            )}
            <Link href="/features" className="ui-btn ui-btn--secondary ui-btn--lg">
              See what’s included
            </Link>
          </div>
        </div>
      </section>

      <section className="ui-mkt__band ui-mkt__band--white">
        <div className="ui-mkt__section ui-mkt__section--wide ui-mkt__pricing-wrap">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {plans === null ? <LoadingState>Loading plans…</LoadingState> : null}
          {plans && plans.length === 0 && !error ? (
            <p className="ui-muted">No active plans are published yet. Please contact us to get started.</p>
          ) : null}
          {plans && plans.length > 0 ? (
            <>
              <div className="ui-mkt__pricing">
                {plans.map((plan) => {
                  const featured = plan.id === featuredId;
                  const allLines = summarizePlanFeatures(plan.features);
                  const baseLines = basePlan ? summarizePlanFeatures(basePlan.features) : [];
                  const extraLines = featured && basePlan ? allLines.filter((line) => !baseLines.includes(line)) : allLines;
                  const href = dietitianRegistrationEnabled
                    ? "/auth/dietitian/register"
                    : onlineCheckoutEnabled
                      ? `/checkout?plan=${encodeURIComponent(plan.slug)}`
                      : `/contact?plan=${encodeURIComponent(plan.slug)}`;
                  const cta = dietitianRegistrationEnabled
                    ? "Start free trial"
                    : onlineCheckoutEnabled
                      ? `Get ${plan.name}`
                      : `Contact us`;

                  return (
                    <article
                      key={plan.id}
                      className={`ui-mkt__pricing-card${featured ? " ui-mkt__pricing-card--featured" : ""}`}
                    >
                      <div className="ui-mkt__pricing-top">
                        <p className={`ui-mkt__pricing-flag${featured ? "" : " ui-mkt__pricing-flag--spacer"}`}>
                          Recommended
                        </p>
                        <div className="ui-mkt__pricing-title">
                          <h2>{plan.name}</h2>
                          {plan.showPrice && plan.priceCents != null ? (
                            <p className="ui-mkt__pricing-price">
                              <strong>{formatPrice(plan.priceCents, plan.currency)}</strong>
                              <span>every {plan.durationDays} days</span>
                            </p>
                          ) : (
                            <p className="ui-mkt__pricing-price">
                              <strong>Free trial</strong>
                              <span>14 days</span>
                            </p>
                          )}
                        </div>
                        <p className="ui-mkt__pricing-lead">
                          {plan.description ||
                            (featured ? "For clinics that want automations and AI." : "The complete clinic workspace.")}
                        </p>
                        <Link href={href} className={`ui-btn ui-btn--lg ${featured ? "ui-btn--primary" : "ui-btn--secondary"}`}>
                          {cta}
                        </Link>
                      </div>
                      <div className="ui-mkt__pricing-body">
                        {featured && basePlan ? (
                          <p className="ui-mkt__pricing-plus">Everything in {basePlan.name}, plus</p>
                        ) : (
                          <p className="ui-mkt__pricing-plus">Includes</p>
                        )}
                        <ul>
                          {(featured && extraLines.length > 0 ? extraLines : allLines).map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    </article>
                  );
                })}
              </div>
              <p className="ui-mkt__pricing-note">
                Create an account to start a 14-day trial with sample clients. No card required.{" "}
                <Link href="/features" className="ui-link">
                  Full feature list
                </Link>
              </p>
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}
