export type TimezoneChoice = {
  id: string;
  label: string;
  region: string;
};

function zoneIds(): string[] {
  if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
    return Intl.supportedValuesOf("timeZone");
  }
  return ["UTC"];
}

function formatZone(id: string, now: Date): TimezoneChoice {
  const parts = id.split("/");
  const region = (parts.length > 1 ? parts[0]! : "Other").replaceAll("_", " ");
  const city = (parts.slice(1).join(" / ") || id).replaceAll("_", " ");
  let offset = "";
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: id,
      timeZoneName: "shortOffset",
    }).formatToParts(now);
    offset = formatted.find((part) => part.type === "timeZoneName")?.value?.replace("GMT", "UTC") ?? "";
  } catch {
    /* ignore invalid zone */
  }
  return {
    id,
    label: offset ? `${city} (${offset})` : city,
    region,
  };
}

export function timezoneChoices(extra?: string | null): TimezoneChoice[] {
  const ids = new Set(zoneIds());
  if (extra) ids.add(extra);
  const now = new Date();
  return [...ids]
    .map((id) => formatZone(id, now))
    .sort((a, b) => a.region.localeCompare(b.region) || a.label.localeCompare(b.label));
}

export function groupTimezones(
  choices: TimezoneChoice[],
): Array<{ region: string; zones: TimezoneChoice[] }> {
  const map = new Map<string, TimezoneChoice[]>();
  for (const choice of choices) {
    const list = map.get(choice.region) ?? [];
    list.push(choice);
    map.set(choice.region, list);
  }
  return [...map.entries()].map(([region, zones]) => ({ region, zones }));
}
