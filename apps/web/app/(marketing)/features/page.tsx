"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { API_URL } from "../../../lib/api";
import { MARKETING_FEATURES } from "../../../lib/marketing/features-catalog";

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
      "d-clinical-profile",
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

function resolveGroupItems(group: FeatureGroup) {
  const byId = new Map(MARKETING_FEATURES.map((f) => [f.id, f]));
  const items: string[] = [];
  for (const id of group.featureIds) {
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
}: {
  anchor: string;
  eyebrow: string;
  title: string;
  description: string;
  groups: FeatureGroup[];
}) {
  const visibleGroups = useMemo(
    () =>
      groups
        .map((group) => ({ ...group, items: resolveGroupItems(group) }))
        .filter((group) => group.items.length > 0),
    [groups],
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
  const [plansHref, setPlansHref] = useState("/contact");

  useEffect(() => {
    void fetch(`${API_URL}/api/v1/public/site-settings`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { plansPageEnabled?: boolean };
        setPlansHref(data.plansPageEnabled === true ? "/plans" : "/contact");
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

      <FeatureGroupGrid
        anchor="dietitian"
        eyebrow="Dietitian"
        title="Clinic workspace"
        description="Everything you use to run care and clinic operations."
        groups={DIETITIAN_GROUPS}
      />

      <FeatureGroupGrid
        anchor="patient"
        eyebrow="Patient"
        title="Client portal"
        description="What patients see after they join with your clinic code."
        groups={PATIENT_GROUPS}
      />

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
