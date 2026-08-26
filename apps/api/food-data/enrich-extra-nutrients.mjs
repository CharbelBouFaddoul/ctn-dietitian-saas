#!/usr/bin/env node
/**
 * Enrich usda-foundation-curated.json with extraNutrients from USDA FDC.
 *
 * Prefers offline dumps when present under food-data/.fdc-cache/ (or --dump):
 *   - Foundation Foods JSON (FoundationFoods[])
 *   - SR Legacy JSON (SRLegacyFoods[]) — used for fdcId lookup and name fallback
 *
 * Otherwise uses the FDC API (DEMO_KEY or FDC_API_KEY), ~1 req/sec.
 *
 * Lookup order per food:
 *   1. Numeric sourceFoodId → fdcId in dump/API
 *   2. If unresolved and name-fallback enabled: match description in dumps
 *
 * Usage:
 *   node apps/api/food-data/enrich-extra-nutrients.mjs
 *   node apps/api/food-data/enrich-extra-nutrients.mjs --dump path/to/foundationDownload.json
 *   node apps/api/food-data/enrich-extra-nutrients.mjs --no-name-fallback
 *   FDC_API_KEY=... node apps/api/food-data/enrich-extra-nutrients.mjs --force
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_INPUT = path.join(__dirname, "usda-foundation-curated.json");
const CACHE_DIR = path.join(__dirname, ".fdc-cache");
const FDC_BASE = "https://api.nal.usda.gov/fdc/v1";
const BATCH_SIZE = 10;
const REQUEST_GAP_MS = 1200;

/** USDA nutrient number → canonical key (same basis as macros, typically /100g). */
const NUTRIENT_NUMBER_TO_KEY = {
  601: "cholesterolMg",
  606: "saturatedFatG",
  605: "transFatG",
  645: "monounsaturatedFatG",
  646: "polyunsaturatedFatG",
  306: "potassiumMg",
  301: "calciumMg",
  303: "ironMg",
  304: "magnesiumMg",
  305: "phosphorusMg",
  309: "zincMg",
  312: "copperMg",
  315: "manganeseMg",
  317: "seleniumMcg",
  313: "fluorideMcg",
  314: "iodineMcg",
  320: "vitaminAMcg",
  401: "vitaminCMg",
  328: "vitaminDMcg",
  323: "vitaminEMg",
  430: "vitaminKMcg",
  404: "thiaminMg",
  405: "riboflavinMg",
  406: "niacinMg",
  410: "pantothenicAcidMg",
  415: "vitaminB6Mg",
  416: "biotinMcg",
  417: "folateMcg",
  418: "vitaminB12Mcg",
  421: "cholineMg",
};

/** Tokens that often appear in USDA descriptions but not in shortened curated names. */
const FILLER_TOKENS = new Set([
  "and", "or", "with", "without", "the", "a", "of", "in", "for", "to", "from",
  "cooked", "boiled", "drained", "raw", "fresh", "frozen", "dried", "roasted",
  "baked", "grilled", "fried", "pan", "dry", "heat", "moist", "salt", "added",
  "unenriched", "enriched", "commercially", "prepared", "refrigerated",
  "mature", "seeds", "separable", "lean", "fat", "trimmed", "meat", "only",
  "skin", "skinless", "boneless", "whole", "mixed", "species", "atlantic",
  "pacific", "domesticated", "broilers", "fryers", "fluid", "cultured",
  "all", "types", "solids", "bone", "type", "kernels", "unspecified",
  "ready", "serve", "plain", "reduced", "sugar", "lowfat", "nonfat",
  "hydrogenated", "soybean", "hard", "soft", "mild", "regular",
  "immature", "sprouted", "steamed", "canned", "water", "oil",
  "broiler", "fryer",
]);

/** Extra tokens that usually mean a wrong food when absent from the query. */
const SPURIOUS_TOKENS = new Set([
  "chip", "sandwich", "bar", "green", "sprouted", "sprout", "native",
  "alaska", "zealand", "imported", "coated", "chocolate", "peanut",
  "butter", "sriracha", "hopi", "sakwavikaviki", "artificial",
  "flavor", "pillsbury", "biscuit", "light", // "light ice cream sandwich"
]);

/**
 * Curated catalog uses shortened names / placeholder 180xxx ids.
 * Map common aliases → USDA search phrases for dump matching.
 */
const NAME_ALIASES = {
  "clams cooked": "mollusks clam mixed species cooked moist heat",
  "ice cream vanilla": "ice creams vanilla",
  "rice jasmine cooked": "rice white long grain regular enriched cooked",
  "rice basmati cooked": "rice white long grain regular enriched cooked",
  "bagel cooked": "bagels plain enriched",
  "bagel plain": "bagels plain enriched",
  "english muffin whole wheat": "english muffins whole grain white",
  "pita bread white": "bread pita white unenriched",
  "naan bread": "bread naan plain commercially prepared refrigerated",
  "corn tortilla": "tortillas ready to bake or fry corn",
  "swiss chard cooked": "chard swiss cooked boiled drained without salt",
  "turnip cooked": "turnips cooked boiled drained without salt",
  "parsnip cooked": "parsnips cooked boiled drained without salt",
  "artichoke cooked": "artichokes globe or french cooked boiled drained without salt",
  "butternut squash cooked": "squash winter butternut cooked baked without salt",
  "acorn squash cooked": "squash winter acorn cooked baked without salt",
  "jalapeno pepper raw": "peppers jalapeno raw",
  "black eyed peas cooked": "cowpeas blackeyes immature seeds cooked boiled drained without salt",
  "pinto beans cooked": "beans pinto mature seeds cooked boiled without salt",
  "navy beans cooked": "beans navy mature seeds cooked boiled without salt",
  "split peas cooked": "peas split mature seeds cooked boiled without salt",
  "maple syrup": "syrups maple",
  "agave nectar": "sweetener syrup agave",
  "hot sauce": "sauce ready to serve pepper or hot",
  "tahini": "seeds sesame butter tahini type of kernels unspecified",
  "cola diet": "beverages carbonated low calorie cola or pepper type with aspartame",
  "sports drink": "beverages pepsico quaker gatorade g performance ready to drink",
  "protein powder plant": "beverages protein powder soy based",
  "lamb leg roasted": "lamb leg whole shank and sirloin separable lean only trimmed choice cooked roasted",
};

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    dump: null,
    dryRun: false,
    force: false,
    nameFallback: true,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input" && argv[i + 1]) args.input = path.resolve(argv[++i]);
    else if (a === "--dump" && argv[i + 1]) args.dump = path.resolve(argv[++i]);
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--force") args.force = true;
    else if (a === "--no-name-fallback") args.nameFallback = false;
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node enrich-extra-nutrients.mjs [--input path] [--dump path] [--dry-run] [--force] [--no-name-fallback]",
      );
      process.exit(0);
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function roundAmount(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  const abs = Math.abs(value);
  if (abs >= 100) return Math.round(value * 10) / 10;
  if (abs >= 10) return Math.round(value * 10) / 10;
  if (abs >= 1) return Math.round(value * 100) / 100;
  return Math.round(value * 1000) / 1000;
}

function nutrientNumber(entry) {
  const raw =
    entry?.nutrient?.number ??
    entry?.nutrientNumber ??
    entry?.nutrientNbr ??
    null;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function nutrientAmount(entry) {
  const amount = entry?.amount ?? entry?.value;
  if (amount == null) return null;
  const n = Number(amount);
  return Number.isFinite(n) ? n : null;
}

function extractExtraNutrients(foodNutrients) {
  const extras = {};
  if (!Array.isArray(foodNutrients)) return extras;
  for (const entry of foodNutrients) {
    const nbr = nutrientNumber(entry);
    if (nbr == null) continue;
    const key = NUTRIENT_NUMBER_TO_KEY[nbr];
    if (!key) continue;
    const amount = nutrientAmount(entry);
    if (amount == null) continue;
    const rounded = roundAmount(amount);
    if (rounded == null) continue;
    if (!(key in extras)) extras[key] = rounded;
  }
  return extras;
}

function fdcIdOf(food) {
  return food?.fdcId ?? food?.FDC_ID ?? food?.id ?? null;
}

function descriptionOf(food) {
  return food?.description ?? food?.name ?? "";
}

function normalizeName(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Light stemming so "beans"/"bean", "syrups"/"syrup" align. */
function stemToken(t) {
  if (t.length > 4 && t.endsWith("ies")) return `${t.slice(0, -3)}y`;
  if (t.length > 3 && t.endsWith("ses")) return t.slice(0, -2);
  if (t.length > 4 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

function nameTokens(s) {
  return normalizeName(s)
    .split(" ")
    .filter((t) => t && !FILLER_TOKENS.has(t))
    .map(stemToken);
}

function orderedSubsequence(queryTokens, descTokens) {
  let i = 0;
  for (const t of descTokens) {
    if (i < queryTokens.length && t === queryTokens[i]) i += 1;
  }
  return i === queryTokens.length;
}

function tokenCoverage(queryTokens, descTokens) {
  if (!queryTokens.length) return 0;
  const dset = new Set(descTokens);
  let hit = 0;
  for (const t of queryTokens) if (dset.has(t)) hit += 1;
  return hit / queryTokens.length;
}

function collectFoodsFromJson(raw) {
  if (Array.isArray(raw)) return raw;
  for (const key of [
    "FoundationFoods",
    "foundationFoods",
    "SRLegacyFoods",
    "SrLegacyFoods",
    "foods",
  ]) {
    if (Array.isArray(raw?.[key])) return raw[key];
  }
  return null;
}

function loadDumpFiles(explicitDump) {
  const paths = [];
  if (explicitDump) paths.push(explicitDump);

  const auto = [
    path.join(CACHE_DIR, "foundationDownload.json"),
    path.join(CACHE_DIR, "FoodData_Central_sr_legacy_food_json_2018-04.json"),
    path.join(__dirname, "FoodData_Central_foundation_food.json"),
    path.join(__dirname, "foundation-foods.json"),
    path.join(__dirname, "fdc-foundation-dump.json"),
  ];
  for (const p of auto) {
    if (fs.existsSync(p) && !paths.includes(p)) paths.push(p);
  }

  const byId = new Map();
  const byNorm = new Map();
  const allFoods = [];

  for (const dumpPath of paths) {
    console.log(`Loading dump: ${dumpPath}`);
    const raw = JSON.parse(fs.readFileSync(dumpPath, "utf8"));
    const list = collectFoodsFromJson(raw);
    if (!list) {
      console.warn(`  skipped (unrecognized shape): ${dumpPath}`);
      continue;
    }
    let indexed = 0;
    for (const food of list) {
      const id = fdcIdOf(food);
      if (id != null && !byId.has(String(id))) {
        byId.set(String(id), food);
        indexed += 1;
      }
      const n = normalizeName(descriptionOf(food));
      if (n && !byNorm.has(n)) byNorm.set(n, food);
      allFoods.push(food);
    }
    console.log(`  indexed ${indexed} fdcIds (${list.length} records)`);
  }

  return { byId, byNorm, allFoods, dumpPaths: paths };
}

function scoreNameMatch(queryName, food) {
  const qTokens = nameTokens(queryName);
  const dTokens = nameTokens(descriptionOf(food));
  if (!qTokens.length || !dTokens.length) return -Infinity;

  const coverage = tokenCoverage(qTokens, dTokens);
  // Require every significant curated token to appear (order may differ:
  // "Pinto beans" vs "Beans, pinto, …").
  if (coverage < 1) return -Infinity;

  const qSet = new Set(qTokens);
  const extra = dTokens.filter((t) => !qSet.has(t));
  let penalty = extra.length * 0.35;
  for (const t of extra) {
    if (SPURIOUS_TOKENS.has(t)) penalty += 4;
  }

  const qn = normalizeName(queryName);
  const dn = normalizeName(descriptionOf(food));
  let bonus = 0;
  if (dn === qn) bonus += 20;
  else if (dn.startsWith(qn)) bonus += 5;
  else if (dn.includes(qn)) bonus += 2;
  if (orderedSubsequence(qTokens, dTokens)) bonus += 2;

  // Prefer cooked vs raw when the curated name implies cooked.
  if (/\bcooked\b/.test(qn)) {
    if (/\bcooked\b/.test(dn)) bonus += 1.5;
    if (/\braw\b/.test(dn) || /\buncooked\b/.test(dn)) penalty += 2;
  }

  // Prefer shorter USDA descriptions for abbreviated curated names.
  const lengthGap = Math.max(0, dTokens.length - qTokens.length);
  return 10 + bonus - penalty - lengthGap * 0.15;
}

function findByName(queryName, byNorm, allFoods) {
  const exact = byNorm.get(normalizeName(queryName));
  if (exact) return { food: exact, how: "exact-name" };

  const aliasKey = normalizeName(queryName);
  const searchName = NAME_ALIASES[aliasKey] ?? queryName;

  const qTokens = nameTokens(searchName);
  if (!qTokens.length) return null;

  // Restrict candidates: must contain the first significant query token.
  const anchor = qTokens[0];
  let best = null;
  let bestScore = -Infinity;
  for (const food of allFoods) {
    const descToks = nameTokens(descriptionOf(food));
    if (!descToks.includes(anchor)) continue;
    const score = scoreNameMatch(searchName, food);
    if (score > bestScore) {
      bestScore = score;
      best = food;
    }
  }
  // Base score is 10 when coverage is complete; reject weak/spurious hits.
  if (!best || bestScore < 6) return null;
  return { food: best, how: "fuzzy-name", score: bestScore };
}

function parseNumericFdcId(sourceFoodId) {
  const s = String(sourceFoodId ?? "").trim();
  if (/^\d+$/.test(s)) return Number(s);
  return null;
}

async function fetchWithRetry(url, options, retries = 4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    const wait = REQUEST_GAP_MS * (attempt + 2);
    console.warn(`  rate limited; waiting ${wait}ms…`);
    await sleep(wait);
  }
  return fetch(url, options);
}

async function fetchFoodsBatch(fdcIds, apiKey) {
  const url = `${FDC_BASE}/foods?api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ fdcIds, format: "full" }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`FDC batch HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(`Unexpected FDC batch response`);
  return data;
}

async function fetchFoodSingle(fdcId, apiKey) {
  const url = `${FDC_BASE}/food/${fdcId}?api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithRetry(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`FDC food/${fdcId} HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function enrichFromApi(ids, apiKey) {
  const byId = new Map();
  const failed = [];
  const uniqueIds = [...new Set(ids)];
  console.log(
    `Fetching ${uniqueIds.length} FDC foods via API (batch ${BATCH_SIZE}, ~${REQUEST_GAP_MS}ms gap)…`,
  );

  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    const chunk = uniqueIds.slice(i, i + BATCH_SIZE);
    process.stdout.write(
      `  batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(uniqueIds.length / BATCH_SIZE)} (${chunk.length} ids)…`,
    );
    try {
      const results = await fetchFoodsBatch(chunk, apiKey);
      for (const food of results) {
        const id = fdcIdOf(food);
        if (id != null) byId.set(String(id), food);
      }
      for (const id of chunk) {
        if (byId.has(String(id))) continue;
        try {
          await sleep(REQUEST_GAP_MS);
          const one = await fetchFoodSingle(id, apiKey);
          byId.set(String(id), one);
        } catch (err) {
          failed.push({ sourceFoodId: String(id), reason: err.message });
        }
      }
      console.log(" ok");
    } catch (err) {
      console.log(` batch failed (${err.message}); singles`);
      for (const id of chunk) {
        try {
          await sleep(REQUEST_GAP_MS);
          const one = await fetchFoodSingle(id, apiKey);
          byId.set(String(id), one);
        } catch (e) {
          failed.push({ sourceFoodId: String(id), reason: e.message });
        }
      }
    }
    if (i + BATCH_SIZE < uniqueIds.length) await sleep(REQUEST_GAP_MS);
  }
  return { byId, failed };
}

function bumpDatasetVersion(source) {
  const v = source.datasetVersion ?? "";
  if (v.includes("-micros")) return v;
  return `${v}-micros`;
}

function applyEnrichment(dataset, ctx) {
  const {
    byId,
    byNorm,
    allFoods,
    nameFallback,
    force,
    apiFailedIds,
  } = ctx;

  const failed = [];
  let enriched = 0;
  let skippedExisting = 0;
  let viaId = 0;
  let viaName = 0;

  for (const food of dataset.foods) {
    if (!force && food.extraNutrients && Object.keys(food.extraNutrients).length) {
      skippedExisting += 1;
      enriched += 1;
      continue;
    }

    const sid = String(food.sourceFoodId);
    const numeric = parseNumericFdcId(sid);
    let fdcFood = null;
    let how = null;

    if (numeric != null) {
      fdcFood = byId.get(String(numeric)) ?? null;
      if (fdcFood) how = "fdcId";
    }

    if (!fdcFood && nameFallback && allFoods.length) {
      const match = findByName(food.name, byNorm, allFoods);
      if (match) {
        fdcFood = match.food;
        how = match.how;
      }
    }

    if (!fdcFood) {
      const apiFail = apiFailedIds?.get(String(numeric ?? sid));
      failed.push({
        sourceFoodId: sid,
        name: food.name,
        reason:
          numeric == null
            ? "non-numeric sourceFoodId and no name match"
            : apiFail || "FDC food not found (invalid/placeholder id or no name match)",
      });
      continue;
    }

    const extras = extractExtraNutrients(fdcFood.foodNutrients);
    if (!Object.keys(extras).length) {
      failed.push({
        sourceFoodId: sid,
        name: food.name,
        reason: `no mapped micronutrients (${how}, fdcId=${fdcIdOf(fdcFood)})`,
      });
      continue;
    }

    food.extraNutrients = extras;
    enriched += 1;
    if (how === "fdcId") viaId += 1;
    else viaName += 1;
  }

  return { enriched, skippedExisting, viaId, viaName, failed };
}

async function main() {
  const args = parseArgs(process.argv);
  const apiKey = process.env.FDC_API_KEY || "DEMO_KEY";

  const dataset = JSON.parse(fs.readFileSync(args.input, "utf8"));
  if (!Array.isArray(dataset.foods)) throw new Error("Input JSON missing foods[]");

  const dump = loadDumpFiles(args.dump);
  let byId = dump.byId;
  const apiFailedIds = new Map();

  const needsApi = [];
  for (const food of dataset.foods) {
    if (!args.force && food.extraNutrients && Object.keys(food.extraNutrients).length) {
      continue;
    }
    const n = parseNumericFdcId(food.sourceFoodId);
    if (n != null && !byId.has(String(n))) needsApi.push(n);
  }

  if (needsApi.length && dump.dumpPaths.length === 0) {
    console.log(
      `No offline dump found; using FDC API (key=${apiKey === "DEMO_KEY" ? "DEMO_KEY" : "env"})`,
    );
  }

  if (needsApi.length && dump.dumpPaths.length === 0) {
    const apiResult = await enrichFromApi(needsApi, apiKey);
    for (const [id, food] of apiResult.byId) byId.set(id, food);
    for (const f of apiResult.failed) apiFailedIds.set(f.sourceFoodId, f.reason);
  } else if (needsApi.length && dump.dumpPaths.length > 0) {
    // Dumps present: still try API for unresolved numeric ids (optional), but
    // DEMO_KEY is often rate-limited — prefer name fallback instead.
    console.log(
      `${needsApi.length} numeric ids not in dumps; will use name fallback where enabled (skipping API).`,
    );
  }

  const stats = applyEnrichment(dataset, {
    byId,
    byNorm: dump.byNorm,
    allFoods: dump.allFoods,
    nameFallback: args.nameFallback,
    force: args.force,
    apiFailedIds,
  });

  dataset.source = dataset.source ?? {};
  dataset.source.datasetVersion = bumpDatasetVersion(dataset.source);

  if (!args.dryRun) {
    fs.writeFileSync(args.input, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  }

  const sample = dataset.foods.find(
    (f) => f.extraNutrients && Object.keys(f.extraNutrients).length,
  );
  const newlyNamed = stats.viaName;
  const summary = {
    input: args.input,
    dumps: dump.dumpPaths,
    dryRun: args.dryRun,
    totalFoods: dataset.foods.length,
    enriched: stats.enriched,
    skippedExisting: stats.skippedExisting,
    viaFdcId: stats.viaId,
    viaNameFallback: newlyNamed,
    failedCount: stats.failed.length,
    datasetVersion: dataset.source.datasetVersion,
    sample: sample
      ? {
          sourceFoodId: sample.sourceFoodId,
          name: sample.name,
          energyKcal: sample.energyKcal,
          proteinG: sample.proteinG,
          extraNutrients: sample.extraNutrients,
        }
      : null,
    failed: stats.failed,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
