/** Short labels for catalog filters. CNF is reserved for a later import. */
const SHORT_BY_KEY: Record<string, string> = {
  "usda-fdc-foundation-curated": "USDA Foundation",
  "usda-fdc-foundation-sample": "USDA sample",
  "usda-fdc-sr-legacy": "USDA SR Legacy",
  "cnf-canada": "CNF",
  "cofid-uk": "McCance and Widdowson",
  "practice-custom": "Custom",
};

export function foodSourceShortLabel(source: { key?: string | null; name: string }): string {
  if (source.key && SHORT_BY_KEY[source.key]) return SHORT_BY_KEY[source.key]!;
  return source.name;
}
