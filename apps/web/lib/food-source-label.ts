/** Short labels for catalog filters. */
const SHORT_BY_KEY: Record<string, string> = {
  "usda-fdc-foundation-curated": "USDA Foundation",
  "usda-fdc-foundation-sample": "USDA sample",
  "usda-fdc-sr-legacy": "USDA SR Legacy",
  "cnf-canada": "CNF",
  "cofid-uk": "McCance and Widdowson",
  "lebanon-fct-2021": "Lebanon 2021",
  "practice-custom": "Custom",
};

export function foodSourceShortLabel(source: { key?: string | null; name: string }): string {
  if (source.key && SHORT_BY_KEY[source.key]) return SHORT_BY_KEY[source.key]!;
  return source.name;
}

export function foodSourceCaption(
  source?: { key?: string | null; name: string; datasetVersion?: string | null } | null,
  origin?: "catalog" | "custom",
): string {
  if (origin === "custom" || !source) return origin === "custom" ? "Custom" : "";
  const label = foodSourceShortLabel(source);
  const year = source.datasetVersion?.match(/\d{4}/)?.[0];
  return year ? `${label}, ${year}` : label;
}
