import Link from "next/link";
import {
  dietitianFeatureCategories,
  patientFeatureCategories,
  type MarketingFeatureCategory,
} from "../../../lib/marketing/features-catalog";

const DIETITIAN_PREVIEW_KEYS = new Set(["Clinic & clients", "Meal planning", "Messaging", "AI"]);
const PATIENT_PREVIEW_KEYS = new Set(["My Plan", "Tracking", "Join-code onboarding"]);

function CategoryVisual({ name }: { name: string }) {
  const rows: Record<string, [string, string][]> = {
    "Clinic & clients": [
      ["Client roster", "Search · tags"],
      ["Assessments", "Templates"],
      ["Join codes", "Clinic + reconnect"],
    ],
    "Meal planning": [
      ["Draft plan", "Per client"],
      ["Publish", "Portal snapshot"],
      ["History", "Versioned"],
    ],
    Messaging: [
      ["Inbox", "Clinic"],
      ["Thread", "One per client"],
    ],
    AI: [
      ["Client summary", "Assistance"],
      ["Meal-plan help", "Optional plan"],
    ],
    "My Plan": [
      ["Day view", "Meals"],
      ["Nutrition", "Published plan"],
    ],
    Tracking: [
      ["Food log", "Search foods"],
      ["Water · sleep", "Habits"],
    ],
    "Join-code onboarding": [
      ["Create account", "Verify email"],
      ["Enter code", "Connect"],
    ],
  };
  const items = rows[name] ?? [
    [name, "In product"],
    ["Details", "See workspace"],
  ];
  return (
    <div className="ui-mkt__feature-visual" aria-hidden="true">
      {items.map(([left, right]) => (
        <div key={left} className="ui-mkt__feature-visual-row">
          <span>{left}</span>
          <span className="ui-muted">{right}</span>
        </div>
      ))}
    </div>
  );
}

function AudienceFeatures({
  title,
  eyebrow,
  description,
  categories,
  anchor,
  previewKeys,
  band,
}: {
  title: string;
  eyebrow: string;
  description: string;
  categories: MarketingFeatureCategory[];
  anchor: string;
  previewKeys: Set<string>;
  band: string;
}) {
  let flip = false;
  return (
    <section className={`ui-mkt__band ${band}`} id={anchor}>
      <div className="ui-mkt__section">
        <div className="ui-mkt__section-head">
          <p className="ui-eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {categories.map((category) => {
          const showVisual = previewKeys.has(category.name);
          const isFlip = showVisual && flip;
          if (showVisual) flip = !flip;
          return (
            <div
              key={category.name}
              className={
                showVisual
                  ? `ui-mkt__feature-block is-split${isFlip ? " is-flip" : ""}`
                  : "ui-mkt__feature-block"
              }
            >
              <div className="ui-mkt__feature-copy">
                <h3>{category.name}</h3>
                <p>{category.features[0]?.summary ?? ""}</p>
                <ul className="ui-mkt__feature-list">
                  {category.features.map((feature) => (
                    <li key={feature.id}>
                      <strong>{feature.title}</strong>
                      <span>{feature.summary}</span>
                      {feature.entitlementKey ? (
                        <span className="ui-mkt__feature-meta">
                          Available on plans that include {feature.entitlementKey}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
              {showVisual ? <CategoryVisual name={category.name} /> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function FeaturesPage() {
  return (
    <>
      <section className="ui-mkt__band ui-mkt__band--hero">
        <div className="ui-mkt__hero">
          <p className="ui-eyebrow">Features</p>
          <h1>Capabilities for clinic and portal.</h1>
          <p>
            Everything listed here exists in the product today. Dietitian tools power the clinic workspace; patient
            tools power the client portal.
          </p>
          <div className="ui-mkt__hero-ctas">
            <a href="#dietitian" className="ui-btn ui-btn--secondary ui-btn--sm">
              Dietitian platform
            </a>
            <a href="#patient" className="ui-btn ui-btn--secondary ui-btn--sm">
              Patient experience
            </a>
          </div>
        </div>
      </section>

      <AudienceFeatures
        anchor="dietitian"
        eyebrow="Dietitian platform"
        title="Everything in the clinic workspace."
        description="Client charts, meal planning, tracking review, communication, billing workflows, and clinic operations."
        categories={dietitianFeatureCategories()}
        previewKeys={DIETITIAN_PREVIEW_KEYS}
        band="ui-mkt__band--warm"
      />

      <AudienceFeatures
        anchor="patient"
        eyebrow="Patient experience"
        title="A focused portal for following care."
        description="Patients see the published plan, log daily tracking, message their dietitian, and access shared documents and invoices."
        categories={patientFeatureCategories()}
        previewKeys={PATIENT_PREVIEW_KEYS}
        band="ui-mkt__band--mint"
      />

      <section className="ui-mkt__band ui-mkt__band--cta">
        <div className="ui-mkt__cta-band">
          <h2>See how the join code connects both sides.</h2>
          <p>Patients create their own accounts. Your clinic code connects them to the right chart.</p>
          <div className="ui-mkt__hero-ctas" style={{ justifyContent: "center" }}>
            <Link href="/how-it-works" className="ui-btn ui-btn--primary ui-btn--lg">
              How it works
            </Link>
            <Link href="/auth/dietitian/login" className="ui-btn ui-btn--secondary ui-btn--lg">
              Get Started
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
