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
  // Dietitian — Overview
  {
    id: "d-dashboard",
    audience: "dietitian",
    category: "Overview",
    title: "Practice dashboard",
    summary: "Clients, tasks, appointments, invoices, messages, and clients needing attention at a glance.",
    highlight: true,
  },

  // Clinic & clients
  {
    id: "d-clients",
    audience: "dietitian",
    category: "Clinic & clients",
    title: "Client roster & charts",
    summary:
      "Search, filter, tag, create, and archive clients with full charts for identity, goals, tags, and care history.",
    highlight: true,
  },
  {
    id: "d-clinical-profile",
    audience: "dietitian",
    category: "Clinic & clients",
    title: "Clinical profile & chart notes",
    summary:
      "Default clinical questions for every patient (visit, lifestyle, health history, eating patterns, nutrition, pregnancy) plus dated clinical, meal, and eating-habit notes beside goals and documents.",
    highlight: true,
  },
  {
    id: "d-measurements",
    audience: "dietitian",
    category: "Clinic & clients",
    title: "Measurement tracking",
    summary: "Track weight, height, BMI, waist, hips, body composition, skinfolds, labs, and trends over time.",
  },
  {
    id: "d-timeline",
    audience: "dietitian",
    category: "Clinic & clients",
    title: "Care timeline",
    summary: "Follow the client care timeline across visits, plans, and key updates.",
  },
  {
    id: "d-assessments",
    audience: "dietitian",
    category: "Clinic & clients",
    title: "Custom forms",
    summary:
      "Build questionnaires, assign them to patients, and review in-progress or submitted answers — kept separate from the default clinical profile.",
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
    id: "d-portal",
    audience: "dietitian",
    category: "Clinic & clients",
    title: "Portal invites & status",
    summary: "Manage portal connection status, invites, and disconnect handling.",
  },
  {
    id: "d-tags",
    audience: "dietitian",
    category: "Clinic & clients",
    title: "Tags & organization",
    summary: "Organize clients with tags and filters so your roster stays easy to navigate.",
  },
  {
    id: "d-documents",
    audience: "dietitian",
    category: "Clinic & clients",
    title: "Documents share or internal",
    summary:
      "Upload client files (including PDF, Word, and TXT on the clinical chart) and share with the patient or keep them internal.",
  },

  // Meal planning
  {
    id: "d-meal-plans",
    audience: "dietitian",
    category: "Meal planning",
    title: "Multi-week meal plans",
    summary: "Build multi-day and multi-week meal plans, keep drafts, and publish to the patient portal.",
    highlight: true,
  },
  {
    id: "d-meal-history",
    audience: "dietitian",
    category: "Meal planning",
    title: "Plan history",
    summary: "Review published plan versions so care stays continuous as needs change.",
  },
  {
    id: "d-nutrition",
    audience: "dietitian",
    category: "Meal planning",
    title: "Auto nutrition totals",
    summary: "Automatic nutrition calculations across meals, recipes, and plans.",
  },

  // Nutrition libraries
  {
    id: "d-recipes",
    audience: "dietitian",
    category: "Nutrition libraries",
    title: "Meal & recipe library",
    summary: "Create reusable meals and recipes with ingredients from the food database for meal plans.",
  },
  {
    id: "d-foods",
    audience: "dietitian",
    category: "Nutrition libraries",
    title: "Food catalog & custom foods",
    summary: "Search the food catalog and add custom foods for your practice.",
  },
  {
    id: "d-habits",
    audience: "dietitian",
    category: "Nutrition libraries",
    title: "Habit library",
    summary: "Maintain habits you assign for portal tracking and care focus.",
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
    title: "Schedule & reschedule",
    summary: "Schedule, cancel, and reschedule appointments, including patient portal requests.",
  },
  {
    id: "d-calendar",
    audience: "dietitian",
    category: "Appointments",
    title: "Day, week & month calendar",
    summary: "View appointments and due tasks on a day, week, or month clinic calendar.",
  },

  // Messaging
  {
    id: "d-messaging",
    audience: "dietitian",
    category: "Messaging",
    title: "Realtime messaging",
    summary: "Secure 1:1 realtime messaging with patients from your clinic inbox.",
    highlight: true,
  },
  {
    id: "d-notifications",
    audience: "dietitian",
    category: "Messaging",
    title: "In-app notifications",
    summary: "In-app notifications with unread badges so nothing important is missed.",
  },

  // Invoices
  {
    id: "d-invoices",
    audience: "dietitian",
    category: "Invoices",
    title: "Invoices & printable PDF",
    summary: "Draft, issue, send, mark paid, overdue, or cancel — plus printable invoice PDFs. No built-in payment gateway.",
  },

  // Tasks
  {
    id: "d-tasks",
    audience: "dietitian",
    category: "Tasks",
    title: "Tasks with priorities",
    summary: "Clinic task list with priorities, due dates, and views for yours, due today, and overdue.",
  },

  // Analytics
  {
    id: "d-analytics",
    audience: "dietitian",
    category: "Analytics",
    title: "Practice analytics",
    summary: "Track period rates, revenue trends, invoice mix, and client tracking activity with vs-prior-period deltas.",
  },

  // AI — catalog feature is seeded INACTIVE (hidden on /features until re-enabled).
  {
    id: "d-ai",
    audience: "dietitian",
    category: "AI",
    title: "AI assistance",
    summary:
      "Optional plan capability for client summaries, meal-plan help, nutrition assistance, consultation notes, and message drafts.",
    entitlementKey: "AI",
    highlight: false,
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
    summary: "Practice profile, timezone, locale, currency, units, appointment defaults, and invoice defaults.",
  },

  // Patient — Home
  {
    id: "p-home",
    audience: "patient",
    category: "Home",
    title: "Personal dashboard",
    summary: "Next appointment, today’s tracking, meal plan snapshot, messages, and notifications.",
    highlight: true,
  },

  // My Plan
  {
    id: "p-plan",
    audience: "patient",
    category: "My Plan",
    title: "Meal plan & one-tap log",
    summary: "View published plans by week and day, see nutrition totals, and one-tap log planned meals.",
    highlight: true,
  },

  // Tracking
  {
    id: "p-food",
    audience: "patient",
    category: "Tracking",
    title: "Daily food log",
    summary: "Log food from the catalog and clinic foods with portions and meals; browse any past date.",
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
  {
    id: "p-weight",
    audience: "patient",
    category: "Tracking",
    title: "Quick weight log",
    summary: "Log weight quickly as part of daily tracking.",
  },

  // Progress
  {
    id: "p-progress",
    audience: "patient",
    category: "Progress",
    title: "Progress & measurement charts",
    summary: "Today’s tracking overview plus measurement charts for weight, BMI, body composition, skinfolds, and labs.",
  },

  // Assessments
  {
    id: "p-assessments",
    audience: "patient",
    category: "Assessments",
    title: "Complete & submit forms",
    summary: "Complete custom forms assigned by your dietitian; save progress and submit when ready — separate from clinic chart notes.",
  },

  // Messages
  {
    id: "p-messages",
    audience: "patient",
    category: "Messages",
    title: "Realtime chat",
    summary: "Chat with your dietitian in realtime from the portal.",
    highlight: true,
  },

  // Appointments
  {
    id: "p-appointments",
    audience: "patient",
    category: "Appointments",
    title: "Appointments & requests",
    summary: "View upcoming and past appointments; request reschedule or cancellation.",
  },

  // Documents
  {
    id: "p-documents",
    audience: "patient",
    category: "Documents",
    title: "View, upload & manage files",
    summary: "View clinic-shared files; upload, download, and delete your own uploads.",
  },

  // Billing
  {
    id: "p-invoices",
    audience: "patient",
    category: "Billing",
    title: "Invoices & printable PDF",
    summary: "View invoices issued by your clinic and open printable PDFs. Online payment is not built in.",
  },

  // Profile
  {
    id: "p-profile",
    audience: "patient",
    category: "Profile",
    title: "Profile, notes & multi-clinic",
    summary:
      "Edit personal details, view clinic notes for allergies and lifestyle context, connect to multiple clinics, switch between them, or leave a clinic.",
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
  "Overview",
  "Clinic & clients",
  "Meal planning",
  "Nutrition libraries",
  "Tracking",
  "Appointments",
  "Messaging",
  "Invoices",
  "Tasks",
  "Analytics",
  "AI",
  "Automations",
  "Settings",
] as const;

const PATIENT_CATEGORY_ORDER = [
  "Home",
  "My Plan",
  "Tracking",
  "Progress",
  "Assessments",
  "Messages",
  "Appointments",
  "Documents",
  "Billing",
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
