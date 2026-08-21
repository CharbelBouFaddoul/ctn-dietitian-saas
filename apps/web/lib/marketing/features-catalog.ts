export type MarketingAudience = "dietitian" | "patient";

export type MarketingEntitlementKey = "AI" | "AUTOMATION";

export interface MarketingFeature {
  id: string;
  audience: MarketingAudience;
  category: string;
  title: string;
  summary: string;
  highlight?: boolean;
  entitlementKey?: MarketingEntitlementKey;
}

/**
 * Single source of truth for marketing feature presentation.
 * Derived from real product surfaces (practice nav, client portal, known APIs).
 * Not a CMS and not an entitlement system — update here when product capabilities change.
 */
export const MARKETING_FEATURES: MarketingFeature[] = [
  // Dietitian — Clinic & clients
  {
    id: "d-clients",
    audience: "dietitian",
    category: "Clinic & clients",
    title: "Client roster & charts",
    summary: "Search, filter, and open full client charts with profile, goals, measurements, and timeline.",
    highlight: true,
  },
  {
    id: "d-assessments",
    audience: "dietitian",
    category: "Clinic & clients",
    title: "Assessments",
    summary: "Run structured nutrition assessments from templates inside each client chart.",
  },
  {
    id: "d-join-codes",
    audience: "dietitian",
    category: "Clinic & clients",
    title: "Clinic join codes",
    summary: "Share a short clinic code so patients create their own account and connect to your roster.",
    highlight: true,
  },
  {
    id: "d-tags-assign",
    audience: "dietitian",
    category: "Clinic & clients",
    title: "Tags & assignments",
    summary: "Organize clients with tags and assign them across your clinic team.",
  },

  // Meal planning
  {
    id: "d-meal-plans",
    audience: "dietitian",
    category: "Meal planning",
    title: "Draft & publish meal plans",
    summary: "Build meal plans per client, keep draft versions, and publish when ready for the portal.",
    highlight: true,
  },
  {
    id: "d-meal-history",
    audience: "dietitian",
    category: "Meal planning",
    title: "Plan history",
    summary: "Review published plan versions so care stays continuous as needs change.",
  },

  // Recipes & foods
  {
    id: "d-recipes",
    audience: "dietitian",
    category: "Recipes & foods",
    title: "Recipes",
    summary: "Create recipes with ingredients from the food database for reuse in meal plans.",
  },
  {
    id: "d-foods",
    audience: "dietitian",
    category: "Recipes & foods",
    title: "Food database",
    summary: "Search the food catalog and apply organization overrides when needed.",
  },

  // Tracking
  {
    id: "d-tracking",
    audience: "dietitian",
    category: "Tracking",
    title: "Review client tracking",
    summary: "See food, water, exercise, sleep, and habit logs your clients record in the portal.",
    highlight: true,
  },

  // Appointments
  {
    id: "d-appointments",
    audience: "dietitian",
    category: "Appointments",
    title: "Appointments",
    summary: "Schedule and manage appointments on each client chart.",
  },
  {
    id: "d-calendar",
    audience: "dietitian",
    category: "Appointments",
    title: "Practice calendar",
    summary: "View appointments and due tasks together on a clinic calendar.",
  },

  // Messaging
  {
    id: "d-messaging",
    audience: "dietitian",
    category: "Messaging",
    title: "Secure messaging",
    summary: "Message clients from your clinic inbox with a thread per client.",
    highlight: true,
  },

  // Documents
  {
    id: "d-documents",
    audience: "dietitian",
    category: "Documents",
    title: "Client documents",
    summary: "Upload and share documents on each client chart for both sides of care.",
  },

  // Invoices
  {
    id: "d-invoices",
    audience: "dietitian",
    category: "Invoices",
    title: "Invoicing",
    summary: "Create, issue, send, and mark invoices paid — without a built-in payment gateway.",
  },

  // Tasks
  {
    id: "d-tasks",
    audience: "dietitian",
    category: "Tasks",
    title: "Practice tasks",
    summary: "Track follow-ups with views for yours, due today, and overdue.",
  },

  // Analytics
  {
    id: "d-analytics",
    audience: "dietitian",
    category: "Analytics",
    title: "Practice analytics",
    summary: "Review overview metrics, financial summaries, clients needing attention, and activity.",
  },
  {
    id: "d-dashboard",
    audience: "dietitian",
    category: "Analytics",
    title: "Practice dashboard",
    summary: "See clients, tasks, invoices, upcoming appointments, and recent activity at a glance.",
  },

  // AI
  {
    id: "d-ai",
    audience: "dietitian",
    category: "AI",
    title: "AI assistance",
    summary:
      "Optional plan capability for client summaries, meal-plan help, nutrition assistance, consultation notes, and message drafts.",
    entitlementKey: "AI",
    highlight: true,
  },

  // Automations
  {
    id: "d-automations",
    audience: "dietitian",
    category: "Automations",
    title: "Workflow automations",
    summary:
      "Optional plan capability for rules on appointments, inactivity, overdue invoices, tasks, meal-plan endings, and check-ins.",
    entitlementKey: "AUTOMATION",
  },

  // Settings
  {
    id: "d-settings",
    audience: "dietitian",
    category: "Settings",
    title: "Clinic settings",
    summary: "Configure timezone, units, practice contact details, appointment defaults, and invoice defaults.",
  },

  // Patient — My Plan
  {
    id: "p-plan",
    audience: "patient",
    category: "My Plan",
    title: "Published meal plan",
    summary: "View the meal plan your dietitian published, with days, meals, and nutrition details.",
    highlight: true,
  },

  // Tracking
  {
    id: "p-food",
    audience: "patient",
    category: "Tracking",
    title: "Food logging",
    summary: "Log meals by searching foods and recording quantity and unit.",
    highlight: true,
  },
  {
    id: "p-water",
    audience: "patient",
    category: "Tracking",
    title: "Water tracking",
    summary: "Record daily water intake alongside your plan.",
  },
  {
    id: "p-exercise",
    audience: "patient",
    category: "Tracking",
    title: "Exercise tracking",
    summary: "Log exercise sessions so your dietitian can review activity.",
  },
  {
    id: "p-sleep",
    audience: "patient",
    category: "Tracking",
    title: "Sleep tracking",
    summary: "Capture sleep entries as part of your daily check-in.",
  },
  {
    id: "p-habits",
    audience: "patient",
    category: "Tracking",
    title: "Habit tracking",
    summary: "Track habits your care plan focuses on.",
  },

  // Progress
  {
    id: "p-progress",
    audience: "patient",
    category: "Progress",
    title: "Today’s progress",
    summary: "See a clear summary of today’s intake and tracking on your progress page.",
  },

  // Messages
  {
    id: "p-messages",
    audience: "patient",
    category: "Messages",
    title: "Message your dietitian",
    summary: "Stay in a one-to-one conversation with your dietitian from the portal.",
    highlight: true,
  },

  // Documents
  {
    id: "p-documents",
    audience: "patient",
    category: "Documents",
    title: "Documents",
    summary: "View shared files and upload documents your dietitian can review.",
  },

  // Invoices
  {
    id: "p-invoices",
    audience: "patient",
    category: "Invoices",
    title: "View invoices",
    summary: "See invoices issued by your clinic (view-only; online payment is not built in).",
  },

  // Profile
  {
    id: "p-profile",
    audience: "patient",
    category: "Profile",
    title: "Profile",
    summary: "View your account name and the clinic you are connected to.",
  },

  // Join-code onboarding
  {
    id: "p-join",
    audience: "patient",
    category: "Join-code onboarding",
    title: "Join with a clinic code",
    summary: "Create your own account, then enter the short code from your dietitian to connect.",
    highlight: true,
  },
];

export interface MarketingFeatureCategory {
  name: string;
  features: MarketingFeature[];
}

const DIETITIAN_CATEGORY_ORDER = [
  "Clinic & clients",
  "Meal planning",
  "Recipes & foods",
  "Tracking",
  "Appointments",
  "Messaging",
  "Documents",
  "Invoices",
  "Tasks",
  "Analytics",
  "AI",
  "Automations",
  "Settings",
] as const;

const PATIENT_CATEGORY_ORDER = [
  "My Plan",
  "Tracking",
  "Progress",
  "Messages",
  "Documents",
  "Invoices",
  "Profile",
  "Join-code onboarding",
] as const;

function groupByCategory(audience: MarketingAudience, order: readonly string[]): MarketingFeatureCategory[] {
  const items = MARKETING_FEATURES.filter((f) => f.audience === audience);
  return order
    .map((name) => ({
      name,
      features: items.filter((f) => f.category === name),
    }))
    .filter((group) => group.features.length > 0);
}

export function dietitianFeatureCategories(): MarketingFeatureCategory[] {
  return groupByCategory("dietitian", DIETITIAN_CATEGORY_ORDER);
}

export function patientFeatureCategories(): MarketingFeatureCategory[] {
  return groupByCategory("patient", PATIENT_CATEGORY_ORDER);
}

export function highlightedFeatures(audience: MarketingAudience): MarketingFeature[] {
  return MARKETING_FEATURES.filter((f) => f.audience === audience && f.highlight);
}
