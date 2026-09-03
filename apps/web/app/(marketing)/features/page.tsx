"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LoadingState } from "@nutrition-saas/ui";
import { API_URL } from "../../../lib/api";

interface PublicFeature {
  key: string;
  name: string;
  description: string | null;
  valueType: "BOOLEAN" | "LIMIT";
}

type FeatureGroup = {
  id: string;
  title: string;
  lead: string;
  items: string[];
};

const CLINICAL_FEATURE_GROUPS: Array<{
  id: string;
  title: string;
  lead: string;
  lines: Array<{ keys: string[]; label: string }>;
}> = [
  {
    id: "clients",
    title: "Client care",
    lead: "The chart, forms, files, and printed copies.",
    lines: [
      {
        keys: ["CLIENTS"],
        label: "Client records, clinical profiles, and measurements",
      },
      { keys: ["ASSESSMENTS"], label: "Clinical questionnaires and assigned forms" },
      { keys: ["DOCUMENTS"], label: "Chart documents and shared files" },
      {
        keys: ["CLIENTS", "ASSESSMENTS", "MEAL_PLANS", "TRACKING"],
        label: "Print or download PDF for profile, forms, measurements, tracking, prescription, and meal plans",
      },
    ],
  },
  {
    id: "nutrition",
    title: "Clinical nutrition",
    lead: "Meal plans, recipes, foods, and habit protocols.",
    lines: [
      {
        keys: ["MEAL_PLANS", "MEAL_LIBRARY", "FOODS"],
        label: "Meal planning, recipes, and food database",
      },
      { keys: ["HABITS", "TRACKING"], label: "Habit protocols and tracking review" },
    ],
  },
  {
    id: "ops",
    title: "Practice operations",
    lead: "The day-to-day of the clinic, on the same record.",
    lines: [
      { keys: ["DASHBOARD", "TASKS", "ANALYTICS"], label: "Clinic overview, tasks, and analytics" },
      { keys: ["MESSAGING"], label: "Private patient messaging" },
      { keys: ["APPOINTMENTS"], label: "Scheduling and calendar" },
      { keys: ["INVOICES"], label: "Invoicing and quotations" },
    ],
  },
  {
    id: "advanced",
    title: "AI and automations",
    lead: "Available on plans that include them.",
    lines: [
      { keys: ["AI"], label: "AI assistance for notes, plans, and messages" },
      { keys: ["AUTOMATION"], label: "Care automations for reminders and follow-ups" },
    ],
  },
];

const PATIENT_FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: "plan",
    title: "Plan and tracking",
    lead: "The published plan and what the patient logs each day.",
    items: [
      "Personal home dashboard",
      "Published meal plans with one-tap logging",
      "Daily log for food, water, exercise, sleep, habits, and weight",
      "Progress and measurement charts",
    ],
  },
  {
    id: "connect",
    title: "Stay connected",
    lead: "Messages, visits, and files from the clinic.",
    items: [
      "Realtime messaging with your dietitian",
      "Appointments and visit requests",
      "Documents, forms, and invoices",
    ],
  },
  {
    id: "join",
    title: "Account and join",
    lead: "How patients connect to the clinic.",
    items: ["Self-serve join with a clinic code", "Profile, units, and multi-clinic access"],
  },
];

function groupClinicalFeatures(features: PublicFeature[]): FeatureGroup[] {
  const active = new Set(
    features.filter((feature) => feature.valueType === "BOOLEAN").map((feature) => feature.key),
  );
  const used = new Set<string>();
  const groups: FeatureGroup[] = [];

  for (const group of CLINICAL_FEATURE_GROUPS) {
    const items: string[] = [];
    for (const line of group.lines) {
      if (!line.keys.some((key) => active.has(key))) continue;
      line.keys.forEach((key) => used.add(key));
      items.push(line.label);
    }
    if (items.length > 0) {
      groups.push({ id: group.id, title: group.title, lead: group.lead, items });
    }
  }

  const leftover = features
    .filter((feature) => feature.valueType === "BOOLEAN" && !used.has(feature.key))
    .map((feature) => feature.name);
  if (leftover.length > 0) {
    groups.push({
      id: "more",
      title: "More capabilities",
      lead: "Additional clinic tools currently published.",
      items: leftover,
    });
  }

  return groups;
}

function FeatureCatalog({
  anchor,
  eyebrow,
  title,
  description,
  groups,
  variant,
  loading,
}: {
  anchor: string;
  eyebrow: string;
  title: string;
  description: string;
  groups: FeatureGroup[];
  variant: "clinic" | "portal";
  loading?: boolean;
}) {
  const visibleGroups = useMemo(() => groups.filter((group) => group.items.length > 0), [groups]);

  return (
    <section
      className="ui-mkt__band ui-mkt__band--white"
      id={anchor}
    >
      <div className="ui-mkt__section ui-mkt__section--wide">
        <div className="ui-mkt__section-head ui-mkt__section-head--wide">
          <p className="ui-eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {loading ? <LoadingState>Loading features…</LoadingState> : null}
        {!loading && visibleGroups.length === 0 ? (
          <p className="ui-muted">No clinic features are published yet.</p>
        ) : null}
        {!loading && visibleGroups.length > 0 ? (
          <ol className={`ui-mkt__catalog ui-mkt__catalog--${variant}`}>
            {visibleGroups.map((group, index) => (
              <li key={group.id} className="ui-mkt__catalog-group">
                <header>
                  <span className="ui-mkt__catalog-num">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{group.title}</h3>
                    <p>{group.lead}</p>
                  </div>
                </header>
                <ul>
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </section>
  );
}

export default function FeaturesPage() {
  const [plansHref, setPlansHref] = useState("/contact");
  const [dietitianGroups, setDietitianGroups] = useState<FeatureGroup[]>([]);
  const [dietitianLoading, setDietitianLoading] = useState(true);

  useEffect(() => {
    void fetch(`${API_URL}/api/v1/public/site-settings`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { plansPageEnabled?: boolean };
        setPlansHref(data.plansPageEnabled === true ? "/plans" : "/contact");
      })
      .catch(() => undefined);

    void fetch(`${API_URL}/api/v1/public/features`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Unable to load features");
        const data = (await res.json()) as PublicFeature[];
        setDietitianGroups(groupClinicalFeatures(data));
      })
      .catch(() => setDietitianGroups([]))
      .finally(() => setDietitianLoading(false));
  }, []);

  return (
    <>
      <section className="ui-mkt__band ui-mkt__band--hero">
        <div className="ui-mkt__hero">
          <p className="ui-eyebrow">Features</p>
          <h1>What the clinic includes.</h1>
          <p>
            A workspace for charts, nutrition, messaging, visits, and invoices, and a portal so patients can follow the
            plan. This page is the catalog. How it works shows the day-to-day process.
          </p>
          <div className="ui-mkt__hero-ctas">
            <Link href="/auth/dietitian/register" className="ui-btn ui-btn--primary ui-btn--lg">
              Start free trial
            </Link>
            <Link href={plansHref} className="ui-btn ui-btn--secondary ui-btn--lg">
              {plansHref === "/contact" ? "Contact us" : "View plans"}
            </Link>
          </div>
          <nav className="ui-mkt__index" aria-label="On this page">
            <a href="#dietitian">Clinic workspace →</a>
            <a href="#patient">Patient portal →</a>
          </nav>
        </div>
      </section>

      <FeatureCatalog
        anchor="dietitian"
        eyebrow="Dietitian"
        title="Clinic workspace"
        description="Clinical records, nutrition tools, and practice operations, grouped the way the clinic is used."
        groups={dietitianGroups}
        variant="clinic"
        loading={dietitianLoading}
      />

      <FeatureCatalog
        anchor="patient"
        eyebrow="Patient"
        title="Client portal"
        description="What patients see after they join with your clinic code."
        groups={PATIENT_FEATURE_GROUPS}
        variant="portal"
      />

      <section className="ui-mkt__band ui-mkt__band--cta">
        <div className="ui-mkt__cta-band">
          <h2>See what is on each plan.</h2>
          <p>Compare Standard and Pro, or start a 14-day trial and explore the workspace with sample charts.</p>
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
