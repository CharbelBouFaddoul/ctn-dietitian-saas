/** Stable demo identities. Development-only — never use in production. */

export const DEMO_PASSWORD_DEFAULT = "DemoPass12!";

export const DEMO_EMAILS = {
  superAdmin: "admin@demo.local",
  platformAdmin: "platform-admin@demo.local",
  alice: "dietitian.alice@demo.local",
  bob: "dietitian.bob@demo.local",
  charlie: "dietitian.charlie@demo.local",
  sharedPatient: "patient.shared@demo.local",
  patients: {
    emma: "patient.emma@demo.local",
    james: "patient.james@demo.local",
    olivia: "patient.olivia@demo.local",
    daniel: "patient.daniel@demo.local",
    noah: "patient.noah@demo.local",
    sophia: "patient.sophia@demo.local",
    liam: "patient.liam@demo.local",
    ava: "patient.ava@demo.local",
    ethan: "patient.ethan@demo.local",
    isabella: "patient.isabella@demo.local",
  },
} as const;

export const DEMO_PRACTICES = {
  alice: {
    slug: "alice-harbor-nutrition",
    displayName: "Alice Nguyen",
    practiceName: "Harbor Nutrition",
    professionalTitle: "RD, LDN",
    specialization: "Sports & metabolic health",
    planSlug: "standard" as const,
  },
  bob: {
    slug: "bob-cedar-wellness",
    displayName: "Bob Okonkwo",
    practiceName: "Cedar Wellness Clinic",
    professionalTitle: "MS, RDN",
    specialization: "Weight management",
    planSlug: "pro" as const,
  },
  charlie: {
    slug: "charlie-lumen-dietetics",
    displayName: "Charlie Silva",
    practiceName: "Lumen Dietetics",
    professionalTitle: "PhD, RDN",
    specialization: "Clinical GI nutrition",
    planSlug: "premium" as const,
  },
} as const;

export const DEMO_SETTINGS = {
  timezone: "America/New_York",
  locale: "en",
  currency: "USD",
  weightUnit: "kg" as const,
  heightUnit: "cm" as const,
  dateFormat: "YYYY_MM_DD" as const,
};

export function demoPassword(): string {
  return process.env.DEMO_PASSWORD?.trim() || DEMO_PASSWORD_DEFAULT;
}
