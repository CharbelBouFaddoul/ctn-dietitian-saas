export const CLIENT_PRINT_DOCS = [
  "clinical",
  "assessments",
  "measurement",
  "tracking",
  "prescription",
  "nutrition",
  "nutrition-analysis",
] as const;

export type ClientPrintDoc = (typeof CLIENT_PRINT_DOCS)[number];

export const CLIENT_PRINT_TITLES: Record<ClientPrintDoc, string> = {
  clinical: "Clinical profile",
  assessments: "Custom forms",
  measurement: "Measurements",
  tracking: "Tracking",
  prescription: "Prescription",
  nutrition: "Nutrition plan",
  "nutrition-analysis": "Nutrition analysis",
};

export function isClientPrintDoc(value: string | undefined): value is ClientPrintDoc {
  return Boolean(value && (CLIENT_PRINT_DOCS as readonly string[]).includes(value));
}
