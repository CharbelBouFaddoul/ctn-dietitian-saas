"use client";

import { useEffect, useState } from "react";
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

/** Collapse enabled admin features into short marketing bullets. */
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
        return `Clients & charts (up to ${limit.limitValue.toLocaleString()})`;
      }
      if (limit && limit.limitValue == null && limit.valueType === "LIMIT") {
        return "Clients & charts (unlimited)";
      }
      return "Clients & charts";
    },
  },
  {
    id: "nutrition",
    keys: ["MEAL_PLANS", "MEAL_LIBRARY", "FOODS", "HABITS"],
    label: (features) =>
      hasAny(features, ["MEAL_PLANS", "MEAL_LIBRARY", "FOODS", "HABITS"])
        ? "Meal plans, foods & habits"
        : null,
  },
  {
    id: "care",
    keys: ["MESSAGING", "APPOINTMENTS", "DOCUMENTS", "ASSESSMENTS", "TRACKING"],
    label: (features) =>
      hasAny(features, ["MESSAGING", "APPOINTMENTS", "DOCUMENTS", "ASSESSMENTS", "TRACKING"])
        ? "Messaging, appointments, tracking & documents"
        : null,
  },
  {
    id: "ops",
    keys: ["DASHBOARD", "INVOICES", "TASKS", "ANALYTICS"],
    label: (features) =>
      hasAny(features, ["DASHBOARD", "INVOICES", "TASKS", "ANALYTICS"])
        ? "Dashboard, invoices, tasks & analytics"
        : null,
  },
  {
    id: "ai",
    keys: ["AI", "AI_REQUEST_LIMIT", "AI_TOKEN_LIMIT"],
    label: (features) => {
      if (!hasAny(features, ["AI"])) return null;
      const limit = features.find((f) => f.key === "AI_REQUEST_LIMIT");
      const tokens = features.find((f) => f.key === "AI_TOKEN_LIMIT");
      const parts = [
        limit?.limitValue != null ? `${limit.limitValue.toLocaleString()} requests` : null,
        tokens?.limitValue != null ? `${tokens.limitValue.toLocaleString()} tokens` : null,
      ].filter(Boolean);
      return parts.length ? `AI assistance (${parts.join(" / ")} / period)` : "AI assistance";
    },
  },
  {
    id: "automation",
    keys: ["AUTOMATION", "AUTOMATION_RULE_LIMIT", "AUTOMATION_EXECUTION_LIMIT"],
    label: (features) => {
      if (!hasAny(features, ["AUTOMATION"])) return null;
      const rules = features.find((f) => f.key === "AUTOMATION_RULE_LIMIT");
      if (rules?.limitValue != null) {
        return `Automations (up to ${rules.limitValue.toLocaleString()} rules)`;
      }
      return "Automations";
    },
  },
];

function hasAny(features: PublicPlanFeature[], keys: string[]) {
  const set = new Set(features.map((f) => f.key));
  return keys.some((key) => set.has(key));
}

function summarizePlanFeatures(features: PublicPlanFeature[]): string[] {
  const lines: string[] = [];
  const covered = new Set<string>();

  for (const group of FEATURE_GROUPS) {
    const line = group.label(features);
    if (!line) continue;
    lines.push(line);
    for (const key of group.keys) covered.add(key);
  }

  for (const feature of features) {
    if (covered.has(feature.key)) continue;
    if (feature.valueType === "LIMIT" && feature.limitValue != null) {
      lines.push(`${feature.name}: ${feature.limitValue.toLocaleString()}`);
    } else {
      lines.push(feature.name);
    }
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

export function PlansPageClient() {
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

  return (
    <>
      <section className="ui-mkt__band ui-mkt__band--hero">
        <div className="ui-mkt__hero">
          <p className="ui-eyebrow">Plans</p>
          <h1>Choose the plan for your clinic.</h1>
          <p>
            Compare features across plans. Choose a plan to contact us — we will activate your subscription. Online
            checkout is not available yet.
          </p>
        </div>
      </section>

      <section className="ui-mkt__band ui-mkt__band--plans">
        <div className="ui-mkt__section">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {plans === null ? <LoadingState>Loading plans…</LoadingState> : null}
          {plans && plans.length === 0 && !error ? (
            <p className="ui-muted">No active plans are published yet. Please contact us to get started.</p>
          ) : null}
          {plans && plans.length > 0 ? (
            <div className="ui-mkt__plans-grid">
              {plans.map((plan) => {
                const lines = summarizePlanFeatures(plan.features);
                return (
                  <article key={plan.id} className="ui-mkt__plan-card">
                    <header className="ui-mkt__plan-card-head">
                      <h2>{plan.name}</h2>
                      {plan.showPrice && plan.priceCents != null ? (
                        <p className="ui-mkt__plan-price">
                          <strong>{formatPrice(plan.priceCents, plan.currency)}</strong>
                          <span className="ui-muted"> / {plan.durationDays} days</span>
                        </p>
                      ) : (
                        <p className="ui-mkt__plan-price ui-muted">
                          Contact for pricing · {plan.durationDays} days
                        </p>
                      )}
                    </header>
                    <ul className="ui-mkt__plan-features">
                      {lines.length === 0 ? (
                        <li className="ui-muted">Core clinic features included</li>
                      ) : (
                        lines.map((line) => (
                          <li key={line}>
                            <span className="ui-mkt__plan-check" aria-hidden="true">
                              ✓
                            </span>
                            <span>{line}</span>
                          </li>
                        ))
                      )}
                    </ul>
                    <Link href={`/contact?plan=${encodeURIComponent(plan.slug)}`} className="ui-btn ui-btn--primary">
                      Choose
                    </Link>
                  </article>
                );
              })}
            </div>
          ) : null}
          <p style={{ marginTop: 28 }}>
            Already have an account?{" "}
            <Link href="/auth/dietitian/login" className="ui-link">
              Sign in as Dietitian
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
