import type { Food, Prisma, PrismaClient } from "@prisma/client";

type Nut = {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
};

export type HarborPantry = {
  chicken: Food;
  rice: Food;
  oats: Food;
  yogurt: Food;
  apple: Food;
  egg: Food;
  broccoli: Food;
  almonds: Food;
  salmon: Food;
  oil: Food;
  smoothie: Food;
  electrolyte: Food;
  hummus: Food;
  fattoush: Food;
  falafel: Food;
  tabbouleh: Food;
  shawarma: Food;
  baklava: Food;
};

type MealSlot = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";

function nut(partial: Partial<Nut> = {}): Nut {
  return {
    energyKcal: partial.energyKcal ?? 0,
    proteinG: partial.proteinG ?? 0,
    carbohydrateG: partial.carbohydrateG ?? 0,
    fatG: partial.fatG ?? 0,
    fiberG: partial.fiberG ?? 0,
    sugarG: partial.sugarG ?? null,
    sodiumMg: partial.sodiumMg ?? null,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function scaleFoodNutrition(food: Food, quantity: number): Nut {
  const ref = num(food.referenceQuantity) || 100;
  const s = quantity / ref;
  const scale = (value: unknown): number | null => {
    const n = num(value);
    return n == null ? null : round1(n * s);
  };
  const proteinG = scale(food.proteinG);
  const carbohydrateG = scale(food.carbohydrateG);
  const fatG = scale(food.fatG);
  const labeled = scale(food.energyKcal);
  // Foundation/SR rows often omit energy_kcal while macros exist — use Atwater so demos aren't 0 kcal.
  const atwater =
    proteinG != null && carbohydrateG != null && fatG != null
      ? round1(proteinG * 4 + carbohydrateG * 4 + fatG * 9)
      : null;
  return nut({
    energyKcal: labeled ?? atwater ?? 0,
    proteinG: proteinG ?? 0,
    carbohydrateG: carbohydrateG ?? 0,
    fatG: fatG ?? 0,
    fiberG: scale(food.fiberG),
    sugarG: scale(food.sugarG),
    sodiumMg: scale(food.sodiumMg),
  });
}

function foodLogSnapshot(food: Food, quantity: number, unit: string): Prisma.InputJsonValue {
  const nutrition = scaleFoodNutrition(food, quantity);
  return {
    schemaVersion: 1,
    foodId: food.id,
    foodName: food.name,
    quantity,
    unit,
    referenceQuantity: num(food.referenceQuantity) ?? 100,
    referenceUnit: food.referenceUnit,
    nutrition,
    presented: nutrition,
    capturedAt: new Date().toISOString(),
  };
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - (n * 24 + 3) * 60 * 60 * 1000);
}

function dateOnlyLocal(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** Local wall-clock instant `daysBack` days ago (so meal times look real on the recording machine). */
function atDaysAgo(daysBack: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const JUNK_NAME = [
  "Rejected",
  "labeled energy",
  "fiber not reported",
  "flour",
  "juice",
  "cookies",
  "powder",
  "mix, dry",
  "oat milk",
];

async function findCatalogFood(
  prisma: PrismaClient,
  patterns: string[],
  fallback: Food,
): Promise<Food> {
  for (const pattern of patterns) {
    const food = await prisma.food.findFirst({
      where: {
        dietitianAccountId: null,
        status: "ACTIVE",
        name: { contains: pattern, mode: "insensitive" },
        NOT: {
          OR: JUNK_NAME.map((fragment) => ({
            name: { contains: fragment, mode: "insensitive" as const },
          })),
        },
      },
      orderBy: { name: "asc" },
    });
    if (food) return food;
  }
  return fallback;
}

/** Menus are written as eaten/cooked grams. USDA dry rice/oats need a smaller logged weight. */
function asLoggedQuantity(food: Food, asEatenG: number): number {
  const n = food.name.toLowerCase();
  if (n.includes("rice") && n.includes("raw")) return Math.max(40, Math.round(asEatenG * 0.35));
  if (n.includes("oats") && !n.includes("cooked")) return Math.max(35, Math.round(asEatenG * 0.28));
  if (n.includes("egg, whole, dried") || n.includes("egg, white, dried")) {
    return Math.max(20, Math.round(asEatenG * 0.25));
  }
  return asEatenG;
}

export async function applyAliceHarborSettings(
  prisma: PrismaClient,
  dietitianAccountId: string,
): Promise<void> {
  await prisma.dietitianSettings.update({
    where: { dietitianAccountId },
    data: {
      timezone: "America/Los_Angeles",
      locale: "en",
      currency: "USD",
      practiceName: "Harbor Nutrition",
      contactEmail: "hello@harbor-nutrition.demo",
      contactPhone: "+1 415 555 0100",
      addressLine1: "428 Market Street",
      addressLine2: "Suite 310",
      city: "San Francisco",
      region: "CA",
      postalCode: "94105",
      country: "United States",
      emailFromName: "Harbor Nutrition",
      emailReplyTo: "alice.nguyen@harbor-nutrition.demo",
      invoiceFooter:
        "Harbor Nutrition · Alice Nguyen, RD, LDN · 428 Market Street, Suite 310, San Francisco, CA 94105. Payment due in 14 days. Thank you for training with us.",
      invoiceDefaultDueDays: 14,
      invoiceDefaultTaxPercent: 8.625,
      defaultAppointmentMinutes: 45,
    },
  });
}

export async function pickHarborPantry(
  prisma: PrismaClient,
  fallback: Food,
  smoothie: Food,
  electrolyte: Food,
  oil: Food,
): Promise<HarborPantry> {
  const [chicken, rice, oats, yogurt, apple, egg, broccoli, almonds, salmon, hummus, fattoush, falafel, tabbouleh, shawarma, baklava] =
    await Promise.all([
      findCatalogFood(
        prisma,
        [
          "Chicken, broiler or fryers, breast, skinless, boneless, meat only, cooked",
          "Chicken, broiler or fryers, breast",
          "Chicken, broiler",
        ],
        fallback,
      ),
      findCatalogFood(prisma, ["Rice, white, long grain, unenriched, raw", "Rice, white, long grain", "Riz a dajaj"], fallback),
      findCatalogFood(prisma, ["Oats, whole grain, rolled, old fashioned", "Oats, whole grain, rolled", "Oats, rolled"], fallback),
      findCatalogFood(prisma, ["Yogurt, Greek, plain, nonfat", "Yogurt, Greek"], fallback),
      findCatalogFood(prisma, ["Apples, honeycrisp", "Apples, gala", "Apples, fuji", "Apples,"], fallback),
      findCatalogFood(prisma, ["Eggs, Grade A, Large, egg whole", "Eggs, Grade A, Large", "Egg, whole, cooked"], fallback),
      findCatalogFood(prisma, ["Broccoli, raw", "Broccoli"], fallback),
      findCatalogFood(prisma, ["Nuts, almonds, dry roasted", "Almonds, raw", "Almonds"], fallback),
      findCatalogFood(prisma, ["Fish, salmon, Atlantic, farm raised", "Fish, salmon", "Salmon"], fallback),
      findCatalogFood(prisma, ["Hommos bi tahini", "hummus"], fallback),
      findCatalogFood(prisma, ["Fattoush"], fallback),
      findCatalogFood(prisma, ["Falafel"], fallback),
      findCatalogFood(prisma, ["Tabboula", "tabbouleh"], fallback),
      findCatalogFood(prisma, ["Shawarma dajaj", "shawarma"], fallback),
      findCatalogFood(prisma, ["Baklava, mixed", "Baklava"], fallback),
    ]);
  return {
    chicken,
    rice,
    oats,
    yogurt,
    apple,
    egg,
    broccoli,
    almonds,
    salmon,
    oil,
    smoothie,
    electrolyte,
    hummus,
    fattoush,
    falafel,
    tabbouleh,
    shawarma,
    baklava,
  };
}

/** Catalog rows often omit fiber (and sometimes energy). One unknown nutrient blanks the whole day’s analysis. */
export async function completeHarborPantryNutrition(
  prisma: PrismaClient,
  dietitianAccountId: string,
  createdById: string,
  pantry: HarborPantry,
): Promise<void> {
  const seen = new Set<string>();
  for (const food of Object.values(pantry)) {
    if (seen.has(food.id)) continue;
    seen.add(food.id);
    const protein = num(food.proteinG);
    const carb = num(food.carbohydrateG);
    const fat = num(food.fatG);
    const labeled = num(food.energyKcal);
    const energy =
      labeled ??
      (protein != null && carb != null && fat != null ? round1(protein * 4 + carb * 4 + fat * 9) : null);
    const fiber = num(food.fiberG) ?? 0;
    if (labeled != null && food.fiberG != null) continue;
    await prisma.foodOverride.upsert({
      where: { dietitianAccountId_foodId: { dietitianAccountId, foodId: food.id } },
      update: {
        status: "ACTIVE",
        ...(labeled == null && energy != null ? { energyKcal: energy } : {}),
        ...(food.fiberG == null ? { fiberG: fiber } : {}),
      },
      create: {
        dietitianAccountId,
        foodId: food.id,
        status: "ACTIVE",
        createdById,
        ...(labeled == null && energy != null ? { energyKcal: energy } : {}),
        ...(food.fiberG == null ? { fiberG: fiber } : {}),
      },
    });
  }
}

export function emmaDateOfBirth(): Date {
  return new Date(Date.UTC(1992, 5, 18));
}

export function emmaClinicalData(): Prisma.InputJsonValue {
  const begin = new Date();
  begin.setDate(begin.getDate() - 40);
  const finish = new Date();
  finish.setDate(finish.getDate() + 21);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    visit: {
      reason: "Race fueling and recovery for a spring marathon (Boston qualifier attempt)",
      expectations: "Stable energy on long runs, no GI distress, and a leaner race weight without losing power",
      clinicalAims: "sports",
      clinicalAimsNotes: "Carb timing, mid-run fueling, and recovery protein",
      other: "Prefers evening check-ins after training. Partner cooks dinner 2–3 nights/week.",
    },
    lifestyle: {
      bowelHabits: "regular",
      bowelHabitsNotes: "Usually morning; race-week nerves can speed things up",
      sleepQuality: "fair",
      sleepQualityNotes: "6.5–7.5h most nights; 5:15 wake on long-run Sundays",
      smoking: "never",
      smokingNotes: "",
      alcohol: "occasional",
      alcoholNotes: "A glass of wine every other weekend; skipped during peak weeks",
      maritalStatus: "partnered",
      maritalStatusNotes: "Lives with partner Sam",
      physicalActivity: "vigorous",
      physicalActivityNotes: "Marathon block: long run Sunday, tempo Tuesday, strength Wednesday, easy Thursday, medium Saturday",
      background: "Ran XC in college; first marathon was Chicago 2024 (3:41). Targeting sub-3:30.",
      other: "Hybrid product-design job; desk-heavy Tue–Thu afternoons",
    },
    health: {
      conditions: "",
      conditionsNotes: "No chronic diagnoses. History of medial tibial stress, cleared 2023.",
      medication: "Vitamin D 2000 IU daily; iron bisglycinate 25 mg 3×/week",
      personalHistory: "Shin splints 2023, resolved with load management. Last ferritin 48 ng/mL (Jan).",
      familyHistory: "Mother type 2 diabetes (diagnosed 54). Father hypertension.",
      other: "Seasonal allergic rhinitis March–May; antihistamine as needed, not daily.",
    },
    eating: {
      usualWakeTime: "05:45",
      usualBedTime: "22:15",
      dietTypes: "",
      dietTypesNotes: "High carbohydrate around long runs; otherwise balanced omnivore",
      preferredFoods: "Oats, banana, rice bowls, Greek yogurt, roasted chicken, salmon, apples",
      dislikedFoods: "Heavy cream sauces before runs; very spicy food the night before a long run",
      allergies: "",
      allergiesNotes: "Seasonal pollen only — not food",
      intolerances: "",
      intolerancesNotes: "None known. Watches fiber the day before 30k+",
    },
    nutrition: {
      deficiencies: "",
      deficienciesNotes: "Ferritin monitored annually; last check low-normal",
      waterIntake: "about_2_3l",
      other: "Electrolytes on runs over 90 minutes. Target 2650 kcal on quality days.",
      targets: {
        energyKcal: 2650,
        fatG: 75,
        carbohydrateG: 360,
        proteinG: 110,
        fiberG: 30,
      },
    },
    identity: {
      occupation: "Product designer",
      workplace: "Northbeam Studio",
      processNumber: "HN-1042",
      healthNumber: "CA-EMR-44821",
      nationalNumber: "",
      vatNumber: "",
      country: "United States",
      zipCode: "94110",
      address: "2148 Valencia Street, Apt 4B, San Francisco, CA",
    },
    prescription: {
      weightGoalKg: 58,
      bodyFatFormula: "jackson_pollock_7",
      bodyFatConversion: "",
      bodyFatCurrentPct: 28.4,
      bodyFatGoalPct: 24,
      bmrFormula: "mifflin",
      palCurrentKey: "vigorous",
      palGoalKey: "vigorous",
      palCurrentValue: 1.725,
      activities: [
        { key: "running", met: 9.8, minutes: 280 },
        { key: "strength", met: 6, minutes: 80 },
      ],
      energyGoalKcal: 2650,
      macro: { fatPct: 25, carbPct: 55, proteinPct: 20 },
      proteinPerKg: 1.6,
      rdaAuthority: "usda",
      fiberSource: "io",
      fiberGoalG: 30,
      energyFormula: "tdee",
      beginDate: iso(begin),
      forecastFinishDate: iso(finish),
    },
  };
}

export const EMMA_CHART_NOTES: Array<{
  kind: "CLINICAL" | "MEAL" | "EATING_HABIT" | "PREGNANCY";
  body: string;
  mealSlot?: string;
  daysAgo: number;
}> = [
  {
    kind: "CLINICAL",
    body: "Intake: 34y product designer, marathon block (peak 32k last weekend). Goal race weight 58 kg from 62.4. Sleep 6.5h, ferritin 48. Plan: 2650 kcal quality days, 110g protein, carb-load protocol from 10 days out. Agreed on Sunday evening check-ins.",
    daysAgo: 40,
  },
  {
    kind: "CLINICAL",
    body: "Week 2 review. Weight 61.8. Long-run fueling still only 1 gel — bump to 40–60g carb/hour after 75 minutes. Added Harbor electrolyte mix. No GI complaints.",
    daysAgo: 28,
  },
  {
    kind: "MEAL",
    body: "Sunday long-run breakfast trial: oats + Greek yogurt + apple. Held well through 28k. Keep fiber moderate (skip extra broccoli) the night before.",
    mealSlot: "BREAKFAST",
    daysAgo: 21,
  },
  {
    kind: "EATING_HABIT",
    body: "Two desk-heavy Thursdays she skipped the afternoon snack and bonked on the evening shakeout. Put a yogurt + almonds reminder at 16:00 on calendar.",
    daysAgo: 16,
  },
  {
    kind: "CLINICAL",
    body: "Mid-block anthropometrics: waist 72 cm, hips 98, body fat 28.4%. Strength 2×/week is sticking. Sleep still short after Tuesday tempo — protect 22:00 lights-out.",
    daysAgo: 14,
  },
  {
    kind: "MEAL",
    body: "Saturday dinner out: chicken shawarma + fattoush, small baklava. Fine for a medium-run weekend. Next time skip baklava if Sunday is 30k.",
    mealSlot: "DINNER",
    daysAgo: 9,
  },
  {
    kind: "CLINICAL",
    body: "Discussed carb loading plan for race weekend; keep fiber moderate the day before. Race-morning rehearsal: smoothie base + oats 3 hours out, sip electrolyte.",
    daysAgo: 5,
  },
  {
    kind: "MEAL",
    body: "Oats + yogurt + apple; tolerated well on long-run morning. HR drifted less than last month’s 30k.",
    mealSlot: "BREAKFAST",
    daysAgo: 3,
  },
  {
    kind: "EATING_HABIT",
    body: "Still tends to under-fuel mid-afternoon on desk days — afternoon snack before any evening session is non-negotiable this taper.",
    daysAgo: 2,
  },
  {
    kind: "CLINICAL",
    body: "Taper week plan published. Weight 59.9. Sleep 7h last two nights. GI calm. Next visit: race-week grocery list and day-before meal.",
    daysAgo: 1,
  },
];

type FoodLine = {
  food: Food;
  quantity: number;
  unit: "g" | "ml";
  meal: MealSlot;
  hour: number;
  minute: number;
  notes?: string;
};

function menuForDay(daysBack: number, pantry: HarborPantry): FoodLine[] {
  const when = atDaysAgo(daysBack, 12);
  const weekday = when.getDay();
  const lines: FoodLine[] = [];
  const add = (
    meal: MealSlot,
    hour: number,
    minute: number,
    food: Food,
    quantity: number,
    unit: "g" | "ml" = "g",
    notes?: string,
  ) => {
    lines.push({ food, quantity, unit, meal, hour, minute, notes });
  };

  // Sunday long run — biggest carb day
  if (weekday === 0) {
    add("BREAKFAST", 5, 40, pantry.oats, 240, "g", "3h before long run");
    add("BREAKFAST", 5, 42, pantry.yogurt, 180, "g");
    add("BREAKFAST", 5, 44, pantry.apple, 140, "g");
    add("BREAKFAST", 5, 46, pantry.smoothie, 60, "g", "Harbor smoothie in the oats");
    add("SNACK", 9, 30, pantry.electrolyte, 400, "ml", "Mid-run bottle");
    add("LUNCH", 12, 15, pantry.chicken, 160, "g", "Recovery plate");
    add("LUNCH", 12, 16, pantry.rice, 220, "g");
    add("LUNCH", 12, 17, pantry.broccoli, 80, "g");
    add("LUNCH", 12, 18, pantry.oil, 8, "g");
    add("SNACK", 16, 0, pantry.yogurt, 200, "g");
    add("SNACK", 16, 2, pantry.almonds, 20, "g");
    add("DINNER", 18, 45, pantry.salmon, 150, "g");
    add("DINNER", 18, 46, pantry.rice, 180, "g");
    add("DINNER", 18, 47, pantry.broccoli, 100, "g");
    return lines;
  }

  // Monday recovery
  if (weekday === 1) {
    add("BREAKFAST", 7, 20, pantry.yogurt, 200, "g");
    add("BREAKFAST", 7, 22, pantry.oats, 140, "g");
    add("BREAKFAST", 7, 24, pantry.apple, 120, "g");
    add("LUNCH", 12, 40, pantry.hummus, 90, "g");
    add("LUNCH", 12, 41, pantry.fattoush, 180, "g");
    add("LUNCH", 12, 42, pantry.chicken, 80, "g", "Leftover chicken on the salad");
    add("SNACK", 15, 30, pantry.almonds, 25, "g");
    add("DINNER", 19, 10, pantry.salmon, 140, "g");
    add("DINNER", 19, 11, pantry.rice, 140, "g");
    add("DINNER", 19, 12, pantry.broccoli, 150, "g");
    add("DINNER", 19, 13, pantry.oil, 6, "g");
    return lines;
  }

  // Tuesday tempo
  if (weekday === 2) {
    add("BREAKFAST", 6, 30, pantry.oats, 200, "g");
    add("BREAKFAST", 6, 32, pantry.yogurt, 150, "g");
    add("BREAKFAST", 6, 34, pantry.apple, 100, "g");
    add("LUNCH", 12, 20, pantry.chicken, 150, "g");
    add("LUNCH", 12, 21, pantry.rice, 180, "g");
    add("LUNCH", 12, 22, pantry.broccoli, 120, "g");
    add("LUNCH", 12, 23, pantry.oil, 8, "g");
    add("SNACK", 16, 10, pantry.smoothie, 70, "g", "Pre-tempo");
    add("SNACK", 16, 12, pantry.almonds, 15, "g");
    add("DINNER", 19, 30, pantry.egg, 120, "g", "Veggie scramble + rice");
    add("DINNER", 19, 31, pantry.rice, 160, "g");
    add("DINNER", 19, 32, pantry.broccoli, 100, "g");
    add("DINNER", 19, 33, pantry.oil, 8, "g");
    return lines;
  }

  // Wednesday strength — higher protein
  if (weekday === 3) {
    add("BREAKFAST", 7, 0, pantry.egg, 140, "g");
    add("BREAKFAST", 7, 2, pantry.yogurt, 170, "g");
    add("BREAKFAST", 7, 4, pantry.apple, 110, "g");
    add("LUNCH", 12, 35, pantry.salmon, 150, "g");
    add("LUNCH", 12, 36, pantry.rice, 150, "g");
    add("LUNCH", 12, 37, pantry.broccoli, 130, "g");
    add("LUNCH", 12, 38, pantry.oil, 7, "g");
    add("SNACK", 16, 20, pantry.yogurt, 180, "g");
    add("SNACK", 16, 22, pantry.almonds, 25, "g");
    add("DINNER", 19, 15, pantry.chicken, 170, "g");
    add("DINNER", 19, 16, pantry.rice, 160, "g");
    add("DINNER", 19, 17, pantry.tabbouleh, 120, "g");
    return lines;
  }

  // Thursday easy / desk day — one week is the under-fueled story
  if (weekday === 4) {
    const messy = daysBack % 14 >= 7;
    if (messy) {
      add("BREAKFAST", 7, 45, pantry.smoothie, 55, "g", "Rushed — only the smoothie");
      add("LUNCH", 13, 10, pantry.apple, 160, "g", "Ate at the desk, skipped the rice bowl");
      add("LUNCH", 13, 12, pantry.yogurt, 120, "g");
      add("SNACK", 17, 40, pantry.almonds, 30, "g", "Caught up after 4pm dip");
      add("DINNER", 20, 5, pantry.chicken, 180, "g", "Large plate to make up lunch");
      add("DINNER", 20, 6, pantry.rice, 220, "g");
      add("DINNER", 20, 7, pantry.broccoli, 80, "g");
      add("DINNER", 20, 8, pantry.oil, 10, "g");
      return lines;
    }
    add("BREAKFAST", 7, 10, pantry.oats, 180, "g");
    add("BREAKFAST", 7, 12, pantry.yogurt, 160, "g");
    add("LUNCH", 12, 30, pantry.chicken, 140, "g");
    add("LUNCH", 12, 31, pantry.rice, 170, "g");
    add("LUNCH", 12, 32, pantry.broccoli, 110, "g");
    add("SNACK", 16, 0, pantry.yogurt, 170, "g", "Calendar reminder snack");
    add("SNACK", 16, 2, pantry.almonds, 20, "g");
    add("DINNER", 19, 0, pantry.shawarma, 140, "g");
    add("DINNER", 19, 1, pantry.fattoush, 150, "g");
    add("DINNER", 19, 2, pantry.rice, 120, "g");
    return lines;
  }

  // Friday rest / easy walk
  if (weekday === 5) {
    add("BREAKFAST", 8, 10, pantry.yogurt, 200, "g");
    add("BREAKFAST", 8, 12, pantry.oats, 120, "g");
    add("BREAKFAST", 8, 14, pantry.almonds, 15, "g");
    add("LUNCH", 12, 50, pantry.falafel, 120, "g");
    add("LUNCH", 12, 51, pantry.hummus, 70, "g");
    add("LUNCH", 12, 52, pantry.tabbouleh, 140, "g");
    add("SNACK", 15, 40, pantry.apple, 150, "g");
    add("DINNER", 19, 20, pantry.salmon, 130, "g");
    add("DINNER", 19, 21, pantry.broccoli, 160, "g");
    add("DINNER", 19, 22, pantry.rice, 110, "g");
    add("DINNER", 19, 23, pantry.oil, 6, "g");
    return lines;
  }

  // Saturday medium run + optional treat
  add("BREAKFAST", 6, 50, pantry.oats, 220, "g");
  add("BREAKFAST", 6, 52, pantry.smoothie, 50, "g");
  add("BREAKFAST", 6, 54, pantry.apple, 130, "g");
  add("LUNCH", 12, 25, pantry.chicken, 150, "g");
  add("LUNCH", 12, 26, pantry.rice, 200, "g");
  add("LUNCH", 12, 27, pantry.broccoli, 90, "g");
  add("LUNCH", 12, 28, pantry.oil, 8, "g");
  add("SNACK", 15, 50, pantry.yogurt, 150, "g");
  add("DINNER", 19, 40, pantry.shawarma, 150, "g");
  add("DINNER", 19, 41, pantry.fattoush, 160, "g");
  if (daysBack % 14 < 7) {
    add("SNACK", 20, 30, pantry.baklava, 35, "g", "Shared dessert after dinner out");
  }
  return lines;
}

type Session = {
  activityType: string;
  durationMinutes: number;
  intensity: "LOW" | "MODERATE" | "HIGH";
  hour: number;
  minute: number;
  notes?: string;
  caloriesBurned?: number;
};

function sessionForDay(daysBack: number): Session | null {
  const weekday = atDaysAgo(daysBack, 12).getDay();
  if (weekday === 0) {
    return {
      activityType: "Long run",
      durationMinutes: daysBack % 14 < 7 ? 108 : 96,
      intensity: "HIGH",
      hour: 6,
      minute: 10,
      notes: daysBack % 14 < 7 ? "32k, 2 gels + electrolyte after 75 min" : "28k, easy last 4k",
      caloriesBurned: daysBack % 14 < 7 ? 980 : 860,
    };
  }
  if (weekday === 1) {
    return {
      activityType: "Easy walk + mobility",
      durationMinutes: 28,
      intensity: "LOW",
      hour: 18,
      minute: 15,
      notes: "Recovery day — hips and calves",
      caloriesBurned: 90,
    };
  }
  if (weekday === 2) {
    return {
      activityType: "Tempo run",
      durationMinutes: 48,
      intensity: "HIGH",
      hour: 17,
      minute: 30,
      notes: "8k at marathon pace after 2k warm-up",
      caloriesBurned: 420,
    };
  }
  if (weekday === 3) {
    return {
      activityType: "Strength circuit",
      durationMinutes: 42,
      intensity: "MODERATE",
      hour: 18,
      minute: 0,
      notes: "Squat, hinge, single-leg, core. Harbor gym.",
      caloriesBurned: 220,
    };
  }
  if (weekday === 4) {
    return {
      activityType: "Easy shakeout run",
      durationMinutes: 36,
      intensity: "MODERATE",
      hour: 18,
      minute: 20,
      notes: "Neighborhood loop, conversational",
      caloriesBurned: 280,
    };
  }
  if (weekday === 5) {
    if (daysBack % 14 >= 7) return null;
    return {
      activityType: "Easy walk",
      durationMinutes: 25,
      intensity: "LOW",
      hour: 12,
      minute: 10,
      notes: "Lunch walk with Sam",
      caloriesBurned: 80,
    };
  }
  return {
    activityType: "Medium-long run",
    durationMinutes: daysBack % 14 < 7 ? 68 : 58,
    intensity: "MODERATE",
    hour: 7,
    minute: 5,
    notes: daysBack % 14 < 7 ? "18k with strides" : "16k easy",
    caloriesBurned: daysBack % 14 < 7 ? 620 : 530,
  };
}

function sleepForDay(daysBack: number): {
  durationMinutes: number;
  quality: number;
  bedHour: number;
  bedMinute: number;
  wakeHour: number;
  wakeMinute: number;
  notes?: string;
} {
  const weekday = atDaysAgo(daysBack, 12).getDay();
  if (weekday === 0) {
    return {
      durationMinutes: 390,
      quality: 3,
      bedHour: 21,
      bedMinute: 40,
      wakeHour: 5,
      wakeMinute: 10,
      notes: "Alarm for long run — a bit short",
    };
  }
  if (weekday === 2) {
    return {
      durationMinutes: 400,
      quality: 3,
      bedHour: 22,
      bedMinute: 45,
      wakeHour: 6,
      wakeMinute: 25,
      notes: "Wired after tempo",
    };
  }
  if (weekday === 5) {
    return {
      durationMinutes: 480,
      quality: 5,
      bedHour: 22,
      bedMinute: 0,
      wakeHour: 7,
      wakeMinute: 0,
      notes: "Best night of the week",
    };
  }
  if (weekday === 4 && daysBack % 14 >= 7) {
    return {
      durationMinutes: 370,
      quality: 2,
      bedHour: 23,
      bedMinute: 10,
      wakeHour: 6,
      wakeMinute: 20,
      notes: "Late dinner after under-fueled afternoon",
    };
  }
  return {
    durationMinutes: 430 + (daysBack % 3) * 10,
    quality: 4,
    bedHour: 22,
    bedMinute: 15,
    wakeHour: 6,
    wakeMinute: 20,
  };
}

function waterPlan(daysBack: number): Array<{ hour: number; minute: number; ml: number; notes?: string }> {
  const weekday = atDaysAgo(daysBack, 12).getDay();
  const long = weekday === 0;
  return [
    { hour: 7, minute: 0, ml: long ? 500 : 350, notes: "With breakfast" },
    { hour: 10, minute: 30, ml: long ? 700 : 400, notes: long ? "On the run" : undefined },
    { hour: 13, minute: 15, ml: 500 },
    { hour: 16, minute: 45, ml: long ? 600 : 450 },
    { hour: 20, minute: 0, ml: long ? 500 : 400, notes: "Evening" },
  ];
}

function mealHourHasPassed(daysBack: number, hour: number, minute: number): boolean {
  if (daysBack > 0) return true;
  const now = new Date();
  return now.getHours() > hour || (now.getHours() === hour && now.getMinutes() >= minute);
}

async function logFood(
  prisma: PrismaClient,
  input: {
    dietitianAccountId: string;
    clientId: string;
    line: FoodLine;
    daysBack: number;
  },
) {
  const consumedAt = atDaysAgo(input.daysBack, input.line.hour, input.line.minute);
  const quantity =
    input.line.unit === "g" ? asLoggedQuantity(input.line.food, input.line.quantity) : input.line.quantity;
  await prisma.foodLog.create({
    data: {
      dietitianAccountId: input.dietitianAccountId,
      clientId: input.clientId,
      foodId: input.line.food.id,
      displayName: input.line.food.name,
      quantity,
      unit: input.line.unit,
      consumedAt,
      trackingDate: dateOnlyLocal(consumedAt),
      mealCategory: input.line.meal,
      notes: input.line.notes ?? null,
      nutritionSnapshot: foodLogSnapshot(input.line.food, quantity, input.line.unit),
    },
  });
}

export async function seedEmmaTracking(
  prisma: PrismaClient,
  input: {
    dietitianAccountId: string;
    clientId: string;
    pantry: HarborPantry;
    planVersionId: string;
    breakfastMealId?: string;
  },
): Promise<void> {
  const habits = await prisma.habitDefinition.findMany({
    where: { dietitianAccountId: null, active: true },
    orderBy: { sortOrder: "asc" },
    take: 3,
  });
  for (const habit of habits) {
    await prisma.clientHabitAssignment.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        clientId: input.clientId,
        habitDefinitionId: habit.id,
        active: true,
      },
    });
  }

  for (let daysBack = 0; daysBack < 14; daysBack++) {
    const consumed = menuForDay(daysBack, input.pantry).filter((line) =>
      mealHourHasPassed(daysBack, line.hour, line.minute),
    );
    for (const line of consumed) {
      await logFood(prisma, {
        dietitianAccountId: input.dietitianAccountId,
        clientId: input.clientId,
        line,
        daysBack,
      });
    }

    for (const sip of waterPlan(daysBack)) {
      if (!mealHourHasPassed(daysBack, sip.hour, sip.minute)) continue;
      const loggedAt = atDaysAgo(daysBack, sip.hour, sip.minute);
      await prisma.waterLog.create({
        data: {
          dietitianAccountId: input.dietitianAccountId,
          clientId: input.clientId,
          amountMl: sip.ml,
          loggedAt,
          trackingDate: dateOnlyLocal(loggedAt),
          notes: sip.notes ?? null,
        },
      });
    }

    const session = sessionForDay(daysBack);
    if (session && mealHourHasPassed(daysBack, session.hour, session.minute)) {
      const performedAt = atDaysAgo(daysBack, session.hour, session.minute);
      await prisma.exerciseLog.create({
        data: {
          dietitianAccountId: input.dietitianAccountId,
          clientId: input.clientId,
          activityType: session.activityType,
          durationMinutes: session.durationMinutes,
          intensity: session.intensity,
          caloriesBurned: session.caloriesBurned ?? null,
          performedAt,
          trackingDate: dateOnlyLocal(performedAt),
          notes: session.notes ?? null,
        },
      });
    }

    // Sleep is last night — skip "today" (night has not happened yet).
    if (daysBack > 0) {
      const sleep = sleepForDay(daysBack);
      const wake = atDaysAgo(daysBack, sleep.wakeHour, sleep.wakeMinute);
      const bed = atDaysAgo(daysBack + 1, sleep.bedHour, sleep.bedMinute);
      await prisma.sleepLog.create({
        data: {
          dietitianAccountId: input.dietitianAccountId,
          clientId: input.clientId,
          date: dateOnlyLocal(wake),
          bedtime: bed,
          wakeTime: wake,
          durationMinutes: sleep.durationMinutes,
          quality: sleep.quality,
          notes: sleep.notes ?? null,
        },
      });
    }

    for (const habit of habits) {
      const weekday = atDaysAgo(daysBack, 12).getDay();
      const key = habit.name.toLowerCase().replace(/\s+/g, "_");
      let completed = true;
      if (habit.name === "Eat breakfast") {
        completed = !(weekday === 4 && daysBack % 14 >= 7 && daysBack > 0);
      } else if (habit.name === "Eat vegetables") {
        completed = weekday !== 4 || daysBack % 14 < 7;
      } else if (habit.name === "Take a walk") {
        completed = weekday === 1 || weekday === 5 || weekday === 4;
      }
      if (daysBack === 0 && !completed) continue;
      await prisma.habitLog.create({
        data: {
          dietitianAccountId: input.dietitianAccountId,
          clientId: input.clientId,
          habitDefinitionId: habit.id,
          habitKey: key,
          habitLabel: habit.name,
          logDate: dateOnlyLocal(atDaysAgo(daysBack, 12)),
          completed,
        },
      });
    }
  }

  const plannedAt = atDaysAgo(1, 5, 38);
  await prisma.foodLog.create({
    data: {
      dietitianAccountId: input.dietitianAccountId,
      clientId: input.clientId,
      displayName: "Planned long-run breakfast",
      sourceType: "PLANNED_MEAL",
      sourceMealId: input.breakfastMealId ?? null,
      sourceMealPlanVersionId: input.planVersionId,
      servingsLogged: 1,
      quantity: 1,
      unit: "serving",
      consumedAt: plannedAt,
      trackingDate: dateOnlyLocal(plannedAt),
      mealCategory: "BREAKFAST",
      notes: "Logged from the published race-prep plan",
      nutritionSnapshot: {
        schemaVersion: 2,
        sourceType: "PLANNED_MEAL",
        mealId: input.breakfastMealId ?? "demo-planned-breakfast",
        mealName: "Planned long-run breakfast",
        mealPlanVersionId: input.planVersionId,
        foodName: "Planned long-run breakfast",
        servingsLogged: 1,
        servingDescription: null,
        nutrition: nut({ energyKcal: 620, proteinG: 32, carbohydrateG: 88, fatG: 14, fiberG: 8 }),
        presented: nut({ energyKcal: 620, proteinG: 32, carbohydrateG: 88, fatG: 14, fiberG: 8 }),
        items: [],
        capturedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
}

type PlanItem = {
  food: Food;
  quantity: number;
  unit: "g" | "ml";
};

function planDayMeals(dayNumber: number, pantry: HarborPantry): Array<{
  name: string;
  sortOrder: number;
  items: PlanItem[];
}> {
  const rotate = (dayNumber - 1) % 7;
  if (rotate === 0) {
    return [
      {
        name: "Breakfast",
        sortOrder: 0,
        items: [
          { food: pantry.oats, quantity: 240, unit: "g" },
          { food: pantry.yogurt, quantity: 180, unit: "g" },
          { food: pantry.apple, quantity: 140, unit: "g" },
          { food: pantry.smoothie, quantity: 50, unit: "g" },
        ],
      },
      {
        name: "Lunch",
        sortOrder: 1,
        items: [
          { food: pantry.chicken, quantity: 160, unit: "g" },
          { food: pantry.rice, quantity: 220, unit: "g" },
          { food: pantry.broccoli, quantity: 80, unit: "g" },
          { food: pantry.oil, quantity: 8, unit: "g" },
        ],
      },
      {
        name: "Afternoon Snack",
        sortOrder: 2,
        items: [
          { food: pantry.yogurt, quantity: 200, unit: "g" },
          { food: pantry.almonds, quantity: 20, unit: "g" },
        ],
      },
      {
        name: "Dinner",
        sortOrder: 3,
        items: [
          { food: pantry.salmon, quantity: 150, unit: "g" },
          { food: pantry.rice, quantity: 180, unit: "g" },
          { food: pantry.broccoli, quantity: 100, unit: "g" },
        ],
      },
    ];
  }
  if (rotate === 1) {
    return [
      {
        name: "Breakfast",
        sortOrder: 0,
        items: [
          { food: pantry.yogurt, quantity: 200, unit: "g" },
          { food: pantry.oats, quantity: 140, unit: "g" },
          { food: pantry.apple, quantity: 120, unit: "g" },
        ],
      },
      {
        name: "Lunch",
        sortOrder: 1,
        items: [
          { food: pantry.hummus, quantity: 90, unit: "g" },
          { food: pantry.fattoush, quantity: 180, unit: "g" },
          { food: pantry.chicken, quantity: 80, unit: "g" },
        ],
      },
      {
        name: "Afternoon Snack",
        sortOrder: 2,
        items: [{ food: pantry.almonds, quantity: 25, unit: "g" }],
      },
      {
        name: "Dinner",
        sortOrder: 3,
        items: [
          { food: pantry.salmon, quantity: 140, unit: "g" },
          { food: pantry.rice, quantity: 140, unit: "g" },
          { food: pantry.broccoli, quantity: 150, unit: "g" },
        ],
      },
    ];
  }
  if (rotate === 2) {
    return [
      {
        name: "Breakfast",
        sortOrder: 0,
        items: [
          { food: pantry.oats, quantity: 200, unit: "g" },
          { food: pantry.yogurt, quantity: 150, unit: "g" },
          { food: pantry.apple, quantity: 100, unit: "g" },
        ],
      },
      {
        name: "Lunch",
        sortOrder: 1,
        items: [
          { food: pantry.chicken, quantity: 150, unit: "g" },
          { food: pantry.rice, quantity: 180, unit: "g" },
          { food: pantry.broccoli, quantity: 120, unit: "g" },
          { food: pantry.oil, quantity: 8, unit: "g" },
        ],
      },
      {
        name: "Afternoon Snack",
        sortOrder: 2,
        items: [
          { food: pantry.smoothie, quantity: 70, unit: "g" },
          { food: pantry.almonds, quantity: 15, unit: "g" },
        ],
      },
      {
        name: "Dinner",
        sortOrder: 3,
        items: [
          { food: pantry.egg, quantity: 120, unit: "g" },
          { food: pantry.rice, quantity: 160, unit: "g" },
          { food: pantry.broccoli, quantity: 100, unit: "g" },
        ],
      },
    ];
  }
  if (rotate === 3) {
    return [
      {
        name: "Breakfast",
        sortOrder: 0,
        items: [
          { food: pantry.egg, quantity: 140, unit: "g" },
          { food: pantry.yogurt, quantity: 170, unit: "g" },
          { food: pantry.apple, quantity: 110, unit: "g" },
        ],
      },
      {
        name: "Lunch",
        sortOrder: 1,
        items: [
          { food: pantry.salmon, quantity: 150, unit: "g" },
          { food: pantry.rice, quantity: 150, unit: "g" },
          { food: pantry.broccoli, quantity: 130, unit: "g" },
        ],
      },
      {
        name: "Afternoon Snack",
        sortOrder: 2,
        items: [
          { food: pantry.yogurt, quantity: 180, unit: "g" },
          { food: pantry.almonds, quantity: 25, unit: "g" },
        ],
      },
      {
        name: "Dinner",
        sortOrder: 3,
        items: [
          { food: pantry.chicken, quantity: 170, unit: "g" },
          { food: pantry.rice, quantity: 160, unit: "g" },
          { food: pantry.tabbouleh, quantity: 120, unit: "g" },
        ],
      },
    ];
  }
  if (rotate === 4) {
    return [
      {
        name: "Breakfast",
        sortOrder: 0,
        items: [
          { food: pantry.oats, quantity: 180, unit: "g" },
          { food: pantry.yogurt, quantity: 160, unit: "g" },
        ],
      },
      {
        name: "Lunch",
        sortOrder: 1,
        items: [
          { food: pantry.chicken, quantity: 140, unit: "g" },
          { food: pantry.rice, quantity: 170, unit: "g" },
          { food: pantry.broccoli, quantity: 110, unit: "g" },
        ],
      },
      {
        name: "Afternoon Snack",
        sortOrder: 2,
        items: [
          { food: pantry.yogurt, quantity: 170, unit: "g" },
          { food: pantry.almonds, quantity: 20, unit: "g" },
        ],
      },
      {
        name: "Dinner",
        sortOrder: 3,
        items: [
          { food: pantry.shawarma, quantity: 140, unit: "g" },
          { food: pantry.fattoush, quantity: 150, unit: "g" },
          { food: pantry.rice, quantity: 120, unit: "g" },
        ],
      },
    ];
  }
  if (rotate === 5) {
    return [
      {
        name: "Breakfast",
        sortOrder: 0,
        items: [
          { food: pantry.yogurt, quantity: 200, unit: "g" },
          { food: pantry.oats, quantity: 120, unit: "g" },
          { food: pantry.almonds, quantity: 15, unit: "g" },
        ],
      },
      {
        name: "Lunch",
        sortOrder: 1,
        items: [
          { food: pantry.falafel, quantity: 120, unit: "g" },
          { food: pantry.hummus, quantity: 70, unit: "g" },
          { food: pantry.tabbouleh, quantity: 140, unit: "g" },
        ],
      },
      {
        name: "Afternoon Snack",
        sortOrder: 2,
        items: [{ food: pantry.apple, quantity: 150, unit: "g" }],
      },
      {
        name: "Dinner",
        sortOrder: 3,
        items: [
          { food: pantry.salmon, quantity: 130, unit: "g" },
          { food: pantry.broccoli, quantity: 160, unit: "g" },
          { food: pantry.rice, quantity: 110, unit: "g" },
        ],
      },
    ];
  }
  return [
    {
      name: "Breakfast",
      sortOrder: 0,
      items: [
        { food: pantry.oats, quantity: 220, unit: "g" },
        { food: pantry.smoothie, quantity: 50, unit: "g" },
        { food: pantry.apple, quantity: 130, unit: "g" },
      ],
    },
    {
      name: "Lunch",
      sortOrder: 1,
      items: [
        { food: pantry.chicken, quantity: 150, unit: "g" },
        { food: pantry.rice, quantity: 200, unit: "g" },
        { food: pantry.broccoli, quantity: 90, unit: "g" },
        { food: pantry.oil, quantity: 8, unit: "g" },
      ],
    },
    {
      name: "Afternoon Snack",
      sortOrder: 2,
      items: [{ food: pantry.yogurt, quantity: 150, unit: "g" }],
    },
    {
      name: "Dinner",
      sortOrder: 3,
      items: [
        { food: pantry.shawarma, quantity: 150, unit: "g" },
        { food: pantry.fattoush, quantity: 160, unit: "g" },
      ],
    },
  ];
}

export async function createEmmaRacePrepPlan(
  prisma: PrismaClient,
  input: {
    dietitianAccountId: string;
    clientId: string;
    createdById: string;
    pantry: HarborPantry;
    recipeId: string;
    recipeName: string;
  },
): Promise<{ planId: string; versionId: string; breakfastMealId: string | null }> {
  const plan = await prisma.mealPlan.create({
    data: {
      dietitianAccountId: input.dietitianAccountId,
      clientId: input.clientId,
      name: "Emma Race Prep — 14 days",
      description:
        "Peak-to-taper block: higher carbs on Sunday long-run and Saturday medium days, protein-forward Wednesday, lighter Friday. Harbor Power Bowl is the Wednesday dinner swap if she cooks at home.",
      status: "ACTIVE",
      dayLabelMode: "NUMBERED",
      createdById: input.createdById,
    },
  });
  const version = await prisma.mealPlanVersion.create({
    data: {
      dietitianAccountId: input.dietitianAccountId,
      mealPlanId: plan.id,
      versionNumber: 1,
      status: "PUBLISHED",
      publishedAt: daysAgo(5),
      createdById: input.createdById,
    },
  });

  const daySnapshots: Array<{
    id: string;
    dayNumber: number;
    meals: Array<{
      id: string;
      name: string;
      sortOrder: number;
      items: Array<{
        id: string;
        itemType: "FOOD" | "RECIPE";
        quantity: number;
        unit: string;
        food?: { id: string; name: string } | null;
        recipe?: { id: string; name: string; servings: number } | null;
        nutrition: Nut;
      }>;
    }>;
  }> = [];

  let breakfastMealId: string | null = null;

  for (let dayNumber = 1; dayNumber <= 7; dayNumber++) {
    const day = await prisma.mealPlanDay.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        mealPlanVersionId: version.id,
        dayNumber,
      },
    });
    const meals: (typeof daySnapshots)[number]["meals"] = [];
    for (const spec of planDayMeals(dayNumber, input.pantry)) {
      const meal = await prisma.meal.create({
        data: {
          dietitianAccountId: input.dietitianAccountId,
          mealPlanDayId: day.id,
          name: spec.name,
          sortOrder: spec.sortOrder,
        },
      });
      if (dayNumber === 1 && spec.name === "Breakfast") breakfastMealId = meal.id;

      const items: (typeof meals)[number]["items"] = [];
      let sort = 0;
      const useRecipeDinner = dayNumber === 4 && spec.name === "Dinner";
      if (!useRecipeDinner) {
        for (const line of spec.items) {
          const quantity = line.unit === "g" ? asLoggedQuantity(line.food, line.quantity) : line.quantity;
          const created = await prisma.mealItem.create({
            data: {
              dietitianAccountId: input.dietitianAccountId,
              mealId: meal.id,
              itemType: "FOOD",
              foodId: line.food.id,
              quantity,
              unit: line.unit,
              sortOrder: sort,
            },
          });
          sort += 1;
          items.push({
            id: created.id,
            itemType: "FOOD",
            quantity,
            unit: line.unit,
            food: { id: line.food.id, name: line.food.name },
            recipe: null,
            nutrition: scaleFoodNutrition(line.food, quantity),
          });
        }
      }
      if (useRecipeDinner) {
        const created = await prisma.mealItem.create({
          data: {
            dietitianAccountId: input.dietitianAccountId,
            mealId: meal.id,
            itemType: "RECIPE",
            recipeId: input.recipeId,
            quantity: 1,
            unit: "serving",
            sortOrder: sort,
          },
        });
        items.push({
          id: created.id,
          itemType: "RECIPE",
          quantity: 1,
          unit: "serving",
          food: null,
          recipe: { id: input.recipeId, name: input.recipeName, servings: 2 },
          nutrition: nut({ energyKcal: 420, proteinG: 38, carbohydrateG: 36, fatG: 12, fiberG: 5 }),
        });
      }
      meals.push({ id: meal.id, name: spec.name, sortOrder: spec.sortOrder, items });
    }
    daySnapshots.push({ id: day.id, dayNumber, meals });
  }

  for (let dayNumber = 8; dayNumber <= 14; dayNumber++) {
    await prisma.mealPlanDay.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        mealPlanVersionId: version.id,
        dayNumber,
      },
    });
  }

  const calculatedAt = new Date().toISOString();
  const snapshot: Prisma.InputJsonValue = {
    schemaVersion: 1,
    calculatedAt,
    planName: "Emma Race Prep — 14 days",
    planDescription:
      "Peak-to-taper block: higher carbs on Sunday long-run and Saturday medium days, protein-forward Wednesday, lighter Friday.",
    dayLabelMode: "NUMBERED",
    versionNumber: 1,
    days: daySnapshots.map((day) => {
      const dayNut = nut();
      const meals = day.meals.map((meal) => {
        const mealNut = nut();
        const items = meal.items.map((item) => {
          mealNut.energyKcal = (mealNut.energyKcal ?? 0) + (item.nutrition.energyKcal ?? 0);
          mealNut.proteinG = (mealNut.proteinG ?? 0) + (item.nutrition.proteinG ?? 0);
          mealNut.carbohydrateG = (mealNut.carbohydrateG ?? 0) + (item.nutrition.carbohydrateG ?? 0);
          mealNut.fatG = (mealNut.fatG ?? 0) + (item.nutrition.fatG ?? 0);
          mealNut.fiberG = (mealNut.fiberG ?? 0) + (item.nutrition.fiberG ?? 0);
          return {
            id: item.id,
            itemType: item.itemType,
            quantity: item.quantity,
            unit: item.unit,
            notes: null,
            food: item.food,
            recipe: item.recipe,
            nutrition: item.nutrition,
          };
        });
        dayNut.energyKcal = (dayNut.energyKcal ?? 0) + (mealNut.energyKcal ?? 0);
        dayNut.proteinG = (dayNut.proteinG ?? 0) + (mealNut.proteinG ?? 0);
        dayNut.carbohydrateG = (dayNut.carbohydrateG ?? 0) + (mealNut.carbohydrateG ?? 0);
        dayNut.fatG = (dayNut.fatG ?? 0) + (mealNut.fatG ?? 0);
        dayNut.fiberG = (dayNut.fiberG ?? 0) + (mealNut.fiberG ?? 0);
        return {
          id: meal.id,
          name: meal.name,
          sortOrder: meal.sortOrder,
          notes: null,
          items,
          nutrition: mealNut,
        };
      });
      return { id: day.id, dayNumber: day.dayNumber, notes: null, meals, nutrition: dayNut };
    }),
  };

  await prisma.mealPlanVersion.update({
    where: { id: version.id },
    data: { snapshot },
  });

  await prisma.timelineEvent.create({
    data: {
      dietitianAccountId: input.dietitianAccountId,
      clientId: input.clientId,
      type: "MEAL_PLAN_PUBLISHED",
      actorUserId: input.createdById,
      targetType: "meal_plan_version",
      targetId: version.id,
      occurredAt: daysAgo(5),
    },
  });

  return { planId: plan.id, versionId: version.id, breakfastMealId };
}

export async function seedEmmaMessages(
  prisma: PrismaClient,
  input: {
    dietitianAccountId: string;
    clientId: string;
    aliceUserId: string;
    emmaUserId: string;
  },
): Promise<{ conversationId: string }> {
  const convo = await prisma.conversation.create({
    data: {
      dietitianAccountId: input.dietitianAccountId,
      clientId: input.clientId,
      status: "ACTIVE",
    },
  });

  const thread: Array<{ from: "alice" | "emma"; body: string; hoursAgo: number }> = [
    {
      from: "alice",
      body: "Hi Emma — welcome to Harbor. I published a 14-day race-prep plan. Start with Sunday’s long-run breakfast (oats + yogurt + apple) three hours out, and we’ll tighten fueling as the long runs grow.",
      hoursAgo: 24 * 12 + 4,
    },
    {
      from: "emma",
      body: "Got it. Grocery list done — oats, Greek yogurt, rice, chicken, salmon, broccoli. Should I keep the electrolyte mix in the vest from the first hour?",
      hoursAgo: 24 * 12,
    },
    {
      from: "alice",
      body: "Only after 75 minutes for now, unless it’s over 70°F. Sip water to thirst before that. How did Monday’s recovery walk feel?",
      hoursAgo: 24 * 11 + 6,
    },
    {
      from: "emma",
      body: "Legs were heavy Monday but Tuesday tempo was honest — 8k at MP and the last 2k felt controlled. I did get a little niggle in my left hip after strength last night.",
      hoursAgo: 24 * 8 + 3,
    },
    {
      from: "alice",
      body: "Good split. For the hip: skip deep lunges this week, keep the hinge pattern, and extra yogurt + almonds at 4pm so you’re not lifting under-fueled. Sleep target 7h after tempo — I saw 6:40 last Tuesday.",
      hoursAgo: 24 * 8,
    },
    {
      from: "emma",
      body: "Thursday I totally blew the afternoon snack (back-to-back Figma reviews) and the shakeout felt awful. Added a calendar reminder. Also — Saturday we might do shawarma after the 18k, that ok?",
      hoursAgo: 24 * 6 + 2,
    },
    {
      from: "alice",
      body: "Shawarma + fattoush is a great carb-protein dinner. Skip baklava if Sunday is 30k+. Reminder snack is exactly what we wanted — I saw it logged yesterday.",
      hoursAgo: 24 * 5 + 8,
    },
    {
      from: "alice",
      body: "Emma — great splits this week. Keep carbs high on long-run days. I published a small tweak: extra rice on Sunday lunch and the Harbor smoothie mixed into the oats.",
      hoursAgo: 50,
    },
    {
      from: "emma",
      body: "Thanks! Should I bump the evening snack before Saturday’s 28k? Also had a tiny stitch at 22k last Sunday — more gels or just slower from 18–22?",
      hoursAgo: 26,
    },
    {
      from: "alice",
      body: "Both: add 30–40g carbs at 8pm Friday (yogurt is enough), and take the second gel at 75 min not 90. If the stitch returns, that’s usually too much gel too fast — sip, don’t dump.",
      hoursAgo: 18,
    },
    {
      from: "emma",
      body: "Perfect. Sleep was 7h last night. Weight this morning 59.9. I’ll see you at the fueling review — bringing the vest so we can pack the race bottles.",
      hoursAgo: 3,
    },
  ];

  for (const row of thread) {
    await prisma.message.create({
      data: {
        conversationId: convo.id,
        dietitianAccountId: input.dietitianAccountId,
        clientId: input.clientId,
        senderUserId: row.from === "alice" ? input.aliceUserId : input.emmaUserId,
        body: row.body,
        createdAt: new Date(Date.now() - row.hoursAgo * 60 * 60 * 1000),
      },
    });
  }

  const last = await prisma.message.findFirstOrThrow({
    where: { conversationId: convo.id },
    orderBy: { createdAt: "desc" },
  });
  await prisma.conversation.update({
    where: { id: convo.id },
    data: {
      lastMessageId: last.id,
      lastMessageAt: last.createdAt,
      lastMessagePreview: last.body.slice(0, 120),
    },
  });
  await prisma.conversationReadState.create({
    data: {
      conversationId: convo.id,
      readerUserId: input.aliceUserId,
      dietitianAccountId: input.dietitianAccountId,
      lastReadAt: new Date(Date.now() - 20 * 60 * 60 * 1000),
    },
  });

  return { conversationId: convo.id };
}

export async function seedEmmaAppointments(
  prisma: PrismaClient,
  input: {
    dietitianAccountId: string;
    aliceUserId: string;
    emmaClientId: string;
    emmaUserId: string;
  },
): Promise<void> {
  const slot = (start: Date, minutes: number) => ({
    startAt: start,
    endAt: new Date(start.getTime() + minutes * 60_000),
  });

  await prisma.appointment.create({
    data: {
      dietitianAccountId: input.dietitianAccountId,
      clientId: input.emmaClientId,
      assignedUserId: input.aliceUserId,
      title: "Initial sports nutrition consult",
      category: "CONSULTATION",
      ...slot(daysAgo(40), 60),
      status: "COMPLETED",
      notes: "Full intake. Set 2650 kcal, 110g protein, marathon fueling education.",
      createdById: input.aliceUserId,
    },
  });
  await prisma.appointment.create({
    data: {
      dietitianAccountId: input.dietitianAccountId,
      clientId: input.emmaClientId,
      assignedUserId: input.aliceUserId,
      title: "Mid-block anthropometrics",
      category: "ASSESSMENT",
      ...slot(daysAgo(14), 45),
      status: "COMPLETED",
      notes: "Waist/hips/skinfolds. Body fat 28.4%. Plan still on track.",
      createdById: input.aliceUserId,
    },
  });
  await prisma.appointment.create({
    data: {
      dietitianAccountId: input.dietitianAccountId,
      clientId: input.emmaClientId,
      assignedUserId: input.aliceUserId,
      title: "Race prep check-in",
      category: "FOLLOW_UP",
      ...slot(daysAgo(3), 45),
      status: "COMPLETED",
      notes: "Reviewed long-run gels and Friday night snack. Sleep improving.",
      createdById: input.aliceUserId,
    },
  });

  const today = new Date();
  today.setHours(15, 0, 0, 0);
  await prisma.appointment.create({
    data: {
      dietitianAccountId: input.dietitianAccountId,
      clientId: input.emmaClientId,
      assignedUserId: input.aliceUserId,
      title: "Today — fueling review",
      category: "CONSULTATION",
      startAt: today,
      endAt: new Date(today.getTime() + 60 * 60_000),
      status: "SCHEDULED",
      notes: "Pack race vest. Confirm carb-load grocery list.",
      createdById: input.aliceUserId,
    },
  });

  const taper = new Date();
  taper.setDate(taper.getDate() + 5);
  taper.setHours(14, 0, 0, 0);
  await prisma.appointment.create({
    data: {
      dietitianAccountId: input.dietitianAccountId,
      clientId: input.emmaClientId,
      assignedUserId: input.aliceUserId,
      title: "Taper week planning",
      category: "MEAL_PLAN",
      startAt: taper,
      endAt: new Date(taper.getTime() + 60 * 60_000),
      status: "SCHEDULED",
      createdById: input.aliceUserId,
    },
  });

  const requested = new Date();
  requested.setDate(requested.getDate() + 8);
  requested.setHours(11, 0, 0, 0);
  await prisma.appointment.create({
    data: {
      dietitianAccountId: input.dietitianAccountId,
      clientId: input.emmaClientId,
      assignedUserId: input.aliceUserId,
      title: "Race-week grocery & day-before meal",
      category: "CONSULTATION",
      startAt: requested,
      endAt: new Date(requested.getTime() + 45 * 60_000),
      status: "REQUESTED",
      notes: "Patient requested a visit from the portal.",
      createdById: input.emmaUserId,
    },
  });
}

export const HARBOR_INTAKE_SCHEMA = {
  sections: [
    {
      id: "main",
      title: "Lifestyle & training",
      questions: [
        { id: "goal", type: "TEXT", label: "Primary nutrition goal", required: true, active: true },
        { id: "energy", type: "NUMBER", label: "Energy this week (1–10)", required: false, active: true },
        { id: "long_run", type: "TEXT", label: "Longest run in the last 14 days", required: false, active: true },
        { id: "gi", type: "TEXT", label: "Any GI issues mid-run?", required: false, active: true },
        { id: "sleep", type: "NUMBER", label: "Typical sleep hours", required: false, active: true },
      ],
    },
    {
      id: "fueling",
      title: "Fueling",
      questions: [
        { id: "gels", type: "TEXT", label: "Current mid-run fuel", required: false, active: true },
        { id: "breakfast", type: "TEXT", label: "Usual pre-long-run breakfast", required: false, active: true },
      ],
    },
  ],
} as const;

export const HARBOR_INTAKE_RESPONSES = {
  goal: "Run Boston marathon strong — sub-3:30, arrive at the start at 58 kg",
  energy: 8,
  long_run: "32 km, last Sunday, 2 gels after 90 min",
  gi: "One stitch at 22k when I took a gel too fast",
  sleep: 6.7,
  gels: "1–2 gels after 90 minutes; starting electrolyte mix on runs over 90 min",
  breakfast: "Oats cooked in water, Greek yogurt, apple — 3 hours out",
};

export const HARBOR_DOCUMENT_BODY = `Harbor Nutrition — Emma Rodriguez (HN-1042)
Race-prep notes  ·  Alice Nguyen, RD, LDN

Training: marathon peak block. Long run Sunday, tempo Tuesday, strength Wednesday.
Targets: 2650 kcal on quality days · 110 g protein · 360 g carbohydrate · 30 g fiber.
Fueling: 40–60 g carb/hour after 75 minutes on runs ≥90 min. Electrolyte mix in vest.
Race weight: 62.4 kg → 59.9 kg (goal 58 kg). Sleep improving to 7h on rest nights.

Do not share outside the practice.
`;
