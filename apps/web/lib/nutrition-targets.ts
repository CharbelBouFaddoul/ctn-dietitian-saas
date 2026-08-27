import type { MicronutrientKey } from "./micronutrients";

/** Default adult daily targets for Analysis visualization only — not a clinical profile. */
export const DAILY_MACRO_TARGETS = {
  energyKcal: 2000,
  fatG: 70,
  carbohydrateG: 260,
  proteinG: 90,
  fiberG: 28,
} as const;

export type DailyMacroTargets = {
  energyKcal: number;
  fatG: number;
  carbohydrateG: number;
  proteinG: number;
  fiberG: number;
};

export type ClientMacroTargets = {
  energyKcal?: number | null;
  fatG?: number | null;
  carbohydrateG?: number | null;
  proteinG?: number | null;
  fiberG?: number | null;
};

/** Prefer client prescription; fall back to platform defaults per field. */
export function resolveDailyMacroTargets(client?: ClientMacroTargets | null): {
  targets: DailyMacroTargets;
  fromClient: boolean;
} {
  const pick = (value: number | null | undefined, fallback: number) =>
    value != null && value > 0 ? value : fallback;
  const fromClient = Boolean(
    client &&
      [client.energyKcal, client.fatG, client.carbohydrateG, client.proteinG, client.fiberG].some(
        (v) => v != null && v > 0,
      ),
  );
  return {
    fromClient,
    targets: {
      energyKcal: pick(client?.energyKcal, DAILY_MACRO_TARGETS.energyKcal),
      fatG: pick(client?.fatG, DAILY_MACRO_TARGETS.fatG),
      carbohydrateG: pick(client?.carbohydrateG, DAILY_MACRO_TARGETS.carbohydrateG),
      proteinG: pick(client?.proteinG, DAILY_MACRO_TARGETS.proteinG),
      fiberG: pick(client?.fiberG, DAILY_MACRO_TARGETS.fiberG),
    },
  };
}

/**
 * Adult woman 19–50 (or closest published band) — one number per nutrient so the
 * 100% marker can switch by authority. Sex/age-specific clinical targets are not applied.
 * Missing keys mean that authority did not publish a single RDA/RNI/PRI/AI for that nutrient.
 *
 * These profiles are independent of the food catalog (USDA, CNF, CoFID, custom). Catalogs
 * supply nutrient amounts in foods; this picker only chooses which reference scale Analysis
 * uses for “% of target”.
 */
export type RdaProfileId = "iom" | "sacn" | "anses" | "sinu" | "nhmrc";

export type RdaProfile = {
  id: RdaProfileId;
  label: string;
  basis: string;
  micros: Partial<Record<MicronutrientKey, number>>;
  sodiumMg: number;
};

const IOM_MICROS: Partial<Record<MicronutrientKey, number>> = {
  calciumMg: 1000,
  ironMg: 18,
  magnesiumMg: 320,
  phosphorusMg: 700,
  potassiumMg: 2600,
  zincMg: 11,
  copperMg: 0.9,
  manganeseMg: 1.8,
  seleniumMcg: 55,
  fluorideMcg: 3000,
  iodineMcg: 150,
  vitaminAMcg: 700,
  vitaminCMg: 75,
  vitaminDMcg: 15,
  vitaminEMg: 15,
  vitaminKMcg: 90,
  thiaminMg: 1.1,
  riboflavinMg: 1.1,
  niacinMg: 14,
  pantothenicAcidMg: 5,
  vitaminB6Mg: 1.3,
  biotinMcg: 30,
  folateMcg: 400,
  vitaminB12Mcg: 2.4,
  cholineMg: 425,
};

/** COMA 1991 RNI + SACN vitamin D 2016. Safe-intake-only nutrients are omitted. */
const SACN_MICROS: Partial<Record<MicronutrientKey, number>> = {
  calciumMg: 700,
  ironMg: 14.8,
  magnesiumMg: 270,
  phosphorusMg: 550,
  potassiumMg: 3500,
  zincMg: 7,
  copperMg: 1.2,
  manganeseMg: 1.4,
  seleniumMcg: 60,
  iodineMcg: 140,
  vitaminAMcg: 600,
  vitaminCMg: 40,
  vitaminDMcg: 10,
  thiaminMg: 0.8,
  riboflavinMg: 1.1,
  niacinMg: 13,
  vitaminB6Mg: 1.2,
  folateMcg: 200,
  vitaminB12Mcg: 1.5,
};

/** ANSES 2021 PRI or AI, women 18+ (calcium 25+; iron light–moderate menses; zinc at 600 mg phytate). */
const ANSES_MICROS: Partial<Record<MicronutrientKey, number>> = {
  calciumMg: 950,
  ironMg: 11,
  magnesiumMg: 300,
  phosphorusMg: 550,
  potassiumMg: 3500,
  zincMg: 9.3,
  copperMg: 1.5,
  seleniumMcg: 70,
  fluorideMcg: 2900,
  iodineMcg: 150,
  vitaminAMcg: 650,
  vitaminCMg: 110,
  vitaminDMcg: 15,
  vitaminEMg: 9,
  vitaminKMcg: 79,
  thiaminMg: 0.8,
  riboflavinMg: 1.6,
  niacinMg: 14,
  pantothenicAcidMg: 5,
  vitaminB6Mg: 1.6,
  biotinMcg: 40,
  folateMcg: 330,
  vitaminB12Mcg: 4,
  cholineMg: 400,
};

/** SINU LARN V 2024 PRI or AI, women 18–64 (pre-menopause). Thiamin is 0.4 mg/1000 kcal at 2000 kcal. */
const SINU_MICROS: Partial<Record<MicronutrientKey, number>> = {
  calciumMg: 950,
  ironMg: 18,
  magnesiumMg: 350,
  phosphorusMg: 550,
  potassiumMg: 4500,
  zincMg: 9,
  copperMg: 1.3,
  manganeseMg: 2.3,
  seleniumMcg: 55,
  fluorideMcg: 3000,
  iodineMcg: 150,
  vitaminAMcg: 650,
  vitaminCMg: 85,
  vitaminDMcg: 15,
  vitaminEMg: 12,
  vitaminKMcg: 125,
  thiaminMg: 0.8,
  riboflavinMg: 1.6,
  niacinMg: 18,
  pantothenicAcidMg: 5,
  vitaminB6Mg: 1.4,
  biotinMcg: 40,
  folateMcg: 330,
  vitaminB12Mcg: 4,
};

/** NHMRC/MoH NRV 2006, women 19–30; sodium SDT 2017. */
const NHMRC_MICROS: Partial<Record<MicronutrientKey, number>> = {
  calciumMg: 1000,
  ironMg: 18,
  magnesiumMg: 310,
  phosphorusMg: 1000,
  potassiumMg: 2800,
  zincMg: 8,
  copperMg: 1.2,
  manganeseMg: 5,
  seleniumMcg: 60,
  fluorideMcg: 3000,
  iodineMcg: 150,
  vitaminAMcg: 700,
  vitaminCMg: 45,
  vitaminDMcg: 5,
  vitaminEMg: 7,
  vitaminKMcg: 60,
  thiaminMg: 1.1,
  riboflavinMg: 1.1,
  niacinMg: 14,
  pantothenicAcidMg: 4,
  vitaminB6Mg: 1.3,
  biotinMcg: 25,
  folateMcg: 400,
  vitaminB12Mcg: 2.4,
};

export const RDA_PROFILES: Record<RdaProfileId, RdaProfile> = {
  iom: {
    id: "iom",
    label: "Food and Nutrition Board / IOM",
    basis: "DRI RDA/AI, adult woman 19–50 · sodium CDRR 2019",
    micros: IOM_MICROS,
    sodiumMg: 2300,
  },
  sacn: {
    id: "sacn",
    label: "SACN / COMA (UK)",
    basis: "UK RNI, woman 19–50 · vitamin D SACN 2016 · salt 6 g",
    micros: SACN_MICROS,
    sodiumMg: 2400,
  },
  anses: {
    id: "anses",
    label: "ANSES 2021",
    basis: "French PRI/AI, woman 18+ · calcium 25+ · sodium AI",
    micros: ANSES_MICROS,
    sodiumMg: 1500,
  },
  sinu: {
    id: "sinu",
    label: "SINU 2024 (LARN)",
    basis: "Italian PRI/AI, woman 18–64 pre-menopause · potassium SDT",
    micros: SINU_MICROS,
    sodiumMg: 1500,
  },
  nhmrc: {
    id: "nhmrc",
    label: "NHMRC 2006 (2017)",
    basis: "Australia/NZ RDI/AI, woman 19–30 · sodium SDT 2017",
    micros: NHMRC_MICROS,
    sodiumMg: 2000,
  },
};

export const RDA_PROFILE_IDS = Object.keys(RDA_PROFILES) as RdaProfileId[];
export const DEFAULT_RDA_PROFILE_ID: RdaProfileId = "iom";
export const RDA_PROFILE_STORAGE_KEY = "dietitian.rdaProfile";

export function isRdaProfileId(value: string): value is RdaProfileId {
  return value in RDA_PROFILES;
}

/** @deprecated Use RDA_PROFILES.iom — kept for existing imports. */
export const DAILY_MICRO_TARGETS = IOM_MICROS;

/** @deprecated Use RDA_PROFILES.iom.sodiumMg */
export const SODIUM_TARGET_MG = RDA_PROFILES.iom.sodiumMg;

export function percentOfTarget(actual: number | null | undefined, target: number | null | undefined): number | null {
  if (actual == null || target == null || target <= 0) return null;
  return Math.round((actual / target) * 1000) / 10;
}

export function analysisMicroLabel(label: string): string {
  return label
    .replace(" (RAE)", "")
    .replace(" (B1)", "")
    .replace(" (B2)", "")
    .replace(" (B3)", "")
    .replace(" (B5)", "")
    .replace(" (B7)", "");
}
