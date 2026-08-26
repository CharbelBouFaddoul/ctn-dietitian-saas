"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LoadingState } from "@nutrition-saas/ui";
import { API_URL } from "../../../lib/api";
import { MARKETING_FEATURES } from "../../../lib/marketing/features-catalog";

/** Maps marketing feature ids to admin catalog keys (when applicable). */
const CATALOG_KEY_BY_FEATURE_ID: Record<string, string> = {
  "d-dashboard": "DASHBOARD",
  "d-clients": "CLIENTS",
  "d-assessments": "ASSESSMENTS",
  "d-documents": "DOCUMENTS",
  "d-meal-plans": "MEAL_PLANS",
  "d-recipes": "MEAL_LIBRARY",
  "d-foods": "FOODS",
  "d-habits": "HABITS",
  "d-tracking": "TRACKING",
  "d-appointments": "APPOINTMENTS",
  "d-calendar": "APPOINTMENTS",
  "d-messaging": "MESSAGING",
  "d-invoices": "INVOICES",
  "d-tasks": "TASKS",
  "d-analytics": "ANALYTICS",
  "d-ai": "AI",
  "d-automations": "AUTOMATION",
};

type FeatureGroup = {
  id: string;
  title: string;
  featureIds: string[];
};

const DIETITIAN_GROUPS: FeatureGroup[] = [
  {
    id: "clients",
    title: "Clients & care",
    featureIds: [
      "d-clients",
      "d-measurements",
      "d-timeline",
      "d-join-codes",
      "d-portal",
      "d-assessments",
      "d-documents",
      "d-tags",
    ],
  },
  {
    id: "nutrition",
    title: "Nutrition tools",
    featureIds: [
      "d-meal-plans",
      "d-meal-history",
      "d-nutrition",
      "d-recipes",
      "d-foods",
      "d-habits",
      "d-tracking",
    ],
  },
  {
    id: "ops",
    title: "Clinic operations",
    featureIds: [
      "d-dashboard",
      "d-messaging",
      "d-notifications",
      "d-appointments",
      "d-calendar",
      "d-invoices",
      "d-tasks",
      "d-analytics",
      "d-settings",
    ],
  },
  {
    id: "advanced",
    title: "AI & automations",
    featureIds: ["d-ai", "d-automations"],
  },
];

const PATIENT_GROUPS: FeatureGroup[] = [
  {
    id: "plan",
    title: "Plan & tracking",
    featureIds: [
      "p-home",
      "p-plan",
      "p-food",
      "p-water",
      "p-exercise",
      "p-sleep",
      "p-habits",
      "p-weight",
      "p-progress",
    ],
  },
  {
    id: "connect",
    title: "Stay connected",
    featureIds: ["p-messages", "p-appointments", "p-documents", "p-assessments", "p-invoices"],
  },
  {
    id: "join",
    title: "Account & join",
    featureIds: ["p-join", "p-profile"],
  },
];

function isFeatureVisible(featureId: string, activeKeys: Set<string> | null) {
  const catalogKey = CATALOG_KEY_BY_FEATURE_ID[featureId];
  if (!catalogKey) return true;
  // Until catalog loads, keep items visible to avoid layout flash hiding everything.
  if (!activeKeys) return true;
  return activeKeys.has(catalogKey);
}

function resolveGroupItems(group: FeatureGroup, activeKeys: Set<string> | null) {
  const byId = new Map(MARKETING_FEATURES.map((f) => [f.id, f]));
  const items: string[] = [];
  for (const id of group.featureIds) {
    if (!isFeatureVisible(id, activeKeys)) continue;
    const feature = byId.get(id);
    if (!feature) continue;
    items.push(feature.entitlementKey ? `${feature.title} (plan add-on)` : feature.title);
  }
  return items;
}

function FeatureGroupGrid({
  anchor,
  eyebrow,
  title,
  description,
  groups,
  activeKeys,
}: {
  anchor: string;
  eyebrow: string;
  title: string;
  description: string;
  groups: FeatureGroup[];
  activeKeys: Set<string> | null;
}) {
  const visibleGroups = useMemo(
    () =>
      groups
        .map((group) => ({ ...group, items: resolveGroupItems(group, activeKeys) }))
        .filter((group) => group.items.length > 0),
    [groups, activeKeys],
  );

  if (visibleGroups.length === 0) {
    return null;
  }

  return (
    <section className="ui-mkt__band ui-mkt__band--plans" id={anchor}>
      <div className="ui-mkt__section">
        <div className="ui-mkt__section-head">
          <p className="ui-eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="ui-mkt__plans-grid ui-mkt__feature-cards">
          {visibleGroups.map((group) => (
            <article key={group.id} className="ui-mkt__plan-card">
              <header className="ui-mkt__plan-card-head ui-mkt__feature-card-head">
                <h2>{group.title}</h2>
              </header>
              <ul className="ui-mkt__plan-features">
                {group.items.map((item) => (
                  <li key={item}>
                    <span className="ui-mkt__plan-check" aria-hidden="true">
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function FeaturesPage() {
  const [activeKeys, setActiveKeys] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [plansHref, setPlansHref] = useState("/plans");

  useEffect(() => {
    void fetch(`${API_URL}/api/v1/public/features`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Unable to load features");
        const keys = (await res.json()) as string[];
        setActiveKeys(new Set(keys));
      })
      .catch(() => {
        setActiveKeys(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void fetch(`${API_URL}/api/v1/public/site-settings`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { plansPageEnabled?: boolean };
        setPlansHref(data.plansPageEnabled === false ? "/contact" : "/plans");
      })
      .catch(() => undefined);
  }, []);

  return (
    <>
      <section className="ui-mkt__band ui-mkt__band--hero">
        <div className="ui-mkt__hero">
          <p className="ui-eyebrow">Features</p>
          <h1>Capabilities for clinic and portal.</h1>
          <p>Grouped the same way as plans — short checklists you can scan in seconds.</p>
          <div className="ui-mkt__hero-ctas">
            <a href="#dietitian" className="ui-btn ui-btn--secondary ui-btn--sm">
              Dietitian
            </a>
            <a href="#patient" className="ui-btn ui-btn--secondary ui-btn--sm">
              Patient
            </a>
            <Link href={plansHref} className="ui-btn ui-btn--primary ui-btn--sm">
              {plansHref === "/contact" ? "Contact us" : "View plans"}
            </Link>
          </div>
        </div>
      </section>

      {loading ? (
        <section className="ui-mkt__band ui-mkt__band--plans">
          <div className="ui-mkt__section">
            <LoadingState>Loading features…</LoadingState>
          </div>
        </section>
      ) : (
        <>
          <FeatureGroupGrid
            anchor="dietitian"
            eyebrow="Dietitian"
            title="Clinic workspace"
            description="Everything you use to run care and clinic operations."
            groups={DIETITIAN_GROUPS}
            activeKeys={activeKeys}
          />

          <FeatureGroupGrid
            anchor="patient"
            eyebrow="Patient"
            title="Client portal"
            description="What patients see after they join with your clinic code."
            groups={PATIENT_GROUPS}
            activeKeys={activeKeys}
          />
        </>
      )}

      <section className="ui-mkt__band ui-mkt__band--cta">
        <div className="ui-mkt__cta-band">
          <h2>Ready to pick a plan?</h2>
          <p>Compare what’s included, then contact us to get your clinic set up.</p>
          <div className="ui-mkt__hero-ctas" style={{ justifyContent: "center" }}>
            <Link href={plansHref} className="ui-btn ui-btn--primary ui-btn--lg">
              {plansHref === "/contact" ? "Contact us" : "View plans"}
            </Link>
            <Link href="/how-it-works" className="ui-btn ui-btn--secondary ui-btn--lg">
              How it works
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
