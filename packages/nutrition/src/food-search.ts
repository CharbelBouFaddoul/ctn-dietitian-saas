/**
 * Relevance search for catalog food names (USDA / CNF / CoFID style).
 *
 * Ranking goals, in order:
 * 1. Whole-word matches only (query "milk" does not equal "buttermilk").
 * 2. Names whose first word is the query, with few extra descriptors.
 * 3. Everyday forms (whole, fluid, raw, cooked) over infant, canned, dessert, etc.
 * 4. Practice custom foods, then the denser catalogs.
 */

export function normalizeFoodName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Tokens that usually mean a processed, specialty, or non-staple form. */
const DEMOTE: Record<string, number> = {
  infant: 90,
  formula: 80,
  baby: 80,
  toddler: 70,
  junior: 50,
  human: 70,
  imitation: 70,
  substitute: 45,
  canned: 72,
  evaporated: 75,
  condensed: 70,
  dried: 85,
  dry: 82,
  powder: 78,
  powdered: 78,
  dehydrated: 70,
  dessert: 58,
  pudding: 50,
  custard: 45,
  shake: 48,
  bar: 52,
  bread: 40,
  cake: 50,
  cookie: 50,
  candy: 50,
  chocolate: 42,
  cocoa: 30,
  flavored: 30,
  flavoured: 30,
  sweetened: 22,
  broth: 40,
  soup: 35,
  gravy: 40,
  sauce: 28,
  nuggets: 55,
  nugget: 55,
  breaded: 45,
  coated: 40,
  fried: 18,
  reconstituted: 40,
  producer: 32,
  buttermilk: 38,
  sheep: 32,
  sheeps: 32,
  goat: 32,
  goats: 32,
  buffalo: 40,
  camel: 40,
  channel: 28,
  beverage: 20,
  drink: 18,
  mix: 22,
  feet: 82,
  foot: 82,
  neck: 48,
  giblets: 68,
  giblet: 68,
  gizzard: 55,
  liver: 42,
  hearts: 40,
  heart: 36,
  spread: 78,
  meatless: 80,
  slices: 42,
  patty: 40,
  roll: 36,
  skin: 36,
};

const DEMOTE_PHRASES: Array<{ phrase: string; penalty: number }> = [
  { phrase: "infant formula", penalty: 40 },
  { phrase: "baby food", penalty: 50 },
  { phrase: "cereal bar", penalty: 50 },
  { phrase: "hot cocoa", penalty: 35 },
  { phrase: "milk chocolate", penalty: 40 },
];

/** British/American and common catalog spelling pairs. Symmetric. */
const TOKEN_ALIAS_GROUPS: string[][] = [
  ["skim", "skimmed"],
  ["yogurt", "yoghurt"],
  ["flavor", "flavour"],
  ["flavored", "flavoured"],
  ["fiber", "fibre"],
  ["pasteurized", "pasteurised"],
  ["homogenized", "homogenised"],
  ["aluminum", "aluminium"],
  ["donut", "doughnut"],
  ["chili", "chilli"],
  ["egg", "eggs"],
  ["bean", "beans"],
  ["tomato", "tomatoes"],
  ["potato", "potatoes"],
  ["chickpea", "chickpeas"],
];

const TOKEN_ALIASES: Record<string, string[]> = {};
for (const group of TOKEN_ALIAS_GROUPS) {
  for (const token of group) {
    TOKEN_ALIASES[token] = group.filter((item) => item !== token);
  }
}

export function expandFoodSearchToken(token: string): string[] {
  const aliases = TOKEN_ALIASES[token];
  return aliases && aliases.length > 0 ? [token, ...aliases] : [token];
}

function queryTokenFamily(queryTokens: string[]): Set<string> {
  const family = new Set<string>();
  for (const token of queryTokens) {
    for (const item of expandFoodSearchToken(token)) family.add(item);
  }
  return family;
}

function nameHasQueryToken(nameTokens: string[], token: string): boolean {
  return expandFoodSearchToken(token).some((alias) => nameTokens.includes(alias));
}

/** Everyday preparation / form words. Only scored when they are extra tokens. */
const STAPLE = new Set([
  "whole",
  "fluid",
  "fresh",
  "raw",
  "cooked",
  "boiled",
  "roasted",
  "grilled",
  "baked",
  "steamed",
  "plain",
  "skim",
  "skimmed",
  "semiskimmed",
  "semi",
  "pasteurised",
  "pasteurized",
  "homogenized",
  "homogenised",
  "average",
  "liquid",
]);

/** Common culinary cuts — boost these when the user typed a generic food (chicken, beef). */
const CUT_BOOST: Record<string, number> = {
  breast: 58,
  thigh: 34,
  thighs: 34,
  drumstick: 24,
  drumsticks: 24,
  fillet: 28,
  fillets: 28,
  loin: 22,
  boneless: 18,
  skinless: 22,
};

const SOURCE_BOOST: Record<string, number> = {
  "practice-custom": 36,
  "usda-fdc-sr-legacy": 18,
  "cnf-canada": 16,
  "cofid-uk": 14,
  "lebanon-fct-2021": 10,
  "usda-fdc-foundation-curated": 4,
};

export function tokenizeFoodQuery(query: string): string[] {
  return normalizeFoodName(query)
    .split(" ")
    .filter((token) => token.length > 0);
}

function tokensOf(name: string): string[] {
  return tokenizeFoodQuery(name);
}

export function foodNameMatchesQuery(name: string, query: string): boolean {
  const queryTokens = tokenizeFoodQuery(query);
  if (queryTokens.length === 0) return true;
  const nameTokens = tokensOf(name);
  return queryTokens.every((token) => nameHasQueryToken(nameTokens, token));
}

function tokensInOrder(queryTokens: string[], nameTokens: string[]): boolean {
  let from = 0;
  for (const token of queryTokens) {
    const aliases = expandFoodSearchToken(token);
    let at = -1;
    for (let i = from; i < nameTokens.length; i++) {
      if (aliases.includes(nameTokens[i]!)) {
        at = i;
        break;
      }
    }
    if (at < 0) return false;
    from = at + 1;
  }
  return true;
}

export type FoodSearchSubject = {
  name: string;
  sourceKey?: string | null;
  isCustom?: boolean;
};

export function scoreFoodSearch(food: FoodSearchSubject, query: string): number {
  const queryTokens = tokenizeFoodQuery(query);
  if (queryTokens.length === 0) return 0;
  const name = normalizeFoodName(food.name);
  const nameTokens = tokensOf(food.name);
  if (!queryTokens.every((token) => nameHasQueryToken(nameTokens, token))) return -1_000;

  let score = 0;
  const queryText = queryTokens.join(" ");

  if (name === queryText) score += 1_000;
  else if (name.startsWith(`${queryText} `)) score += 220;

  if (nameTokens[0] === queryTokens[0]) score += 300;
  if (queryTokens.length > 1 && nameTokens.slice(0, queryTokens.length).join(" ") === queryText) {
    score += 160;
  }
  if (tokensInOrder(queryTokens, nameTokens)) score += 70;

  const covered = queryTokenFamily(queryTokens);
  const extraTokens = nameTokens.filter((token) => !covered.has(token));
  score += Math.max(0, 120 - extraTokens.length * 8);
  score += Math.max(0, 48 - Math.floor(name.length / 3));

  for (const token of extraTokens) {
    if (STAPLE.has(token)) score += 14;
    const cut = CUT_BOOST[token];
    if (cut) score += cut;
    const demote = DEMOTE[token];
    if (demote) score -= demote;
  }

  for (const { phrase, penalty } of DEMOTE_PHRASES) {
    if (name.includes(phrase) && !queryText.includes(phrase)) score -= penalty;
  }

  if (food.isCustom) score += SOURCE_BOOST["practice-custom"] ?? 0;
  else if (food.sourceKey) score += SOURCE_BOOST[food.sourceKey] ?? 0;

  return score;
}

export function rankFoodsForSearch<T extends FoodSearchSubject>(foods: T[], query: string): T[] {
  const q = query.trim();
  if (!q) return foods;
  return [...foods].sort((a, b) => {
    const byScore = scoreFoodSearch(b, q) - scoreFoodSearch(a, q);
    if (byScore !== 0) return byScore;
    const byLength = normalizeFoodName(a.name).length - normalizeFoodName(b.name).length;
    if (byLength !== 0) return byLength;
    return a.name.localeCompare(b.name);
  });
}

function clausesForExactToken(token: string): Array<{
  nameNormalized: { equals?: string; startsWith?: string; endsWith?: string; contains?: string; mode: "insensitive" };
}> {
  return [
    { nameNormalized: { equals: token, mode: "insensitive" } },
    { nameNormalized: { startsWith: `${token} `, mode: "insensitive" } },
    { nameNormalized: { endsWith: ` ${token}`, mode: "insensitive" } },
    { nameNormalized: { contains: ` ${token} `, mode: "insensitive" } },
  ];
}

/** Prisma-friendly word-boundary clauses for a token, including spelling aliases. */
export function foodSearchTokenClauses(token: string): Array<{
  nameNormalized: { equals?: string; startsWith?: string; endsWith?: string; contains?: string; mode: "insensitive" };
}> {
  return expandFoodSearchToken(token).flatMap(clausesForExactToken);
}
