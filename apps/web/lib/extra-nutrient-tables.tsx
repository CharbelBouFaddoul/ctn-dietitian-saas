"use client";

import { useMemo, useState } from "react";
import { MICRONUTRIENT_DEFS, type ExtraNutrients, type MicronutrientKey } from "./micronutrients";

type MicroGroup = "minerals" | "vitamins" | "lipids";

const GROUP_ORDER: MicroGroup[] = ["minerals", "vitamins", "lipids"];

const GROUP_LABEL: Record<MicroGroup, string> = {
  minerals: "Minerals",
  vitamins: "Vitamins",
  lipids: "Lipids",
};

/** Clinically common highlights for the collapsed summary line. */
const HIGHLIGHT_KEYS: MicronutrientKey[] = [
  "calciumMg",
  "ironMg",
  "potassiumMg",
  "vitaminCMg",
  "vitaminDMcg",
  "vitaminB12Mcg",
  "folateMcg",
  "magnesiumMg",
];

function fmtVal(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : String(value);
}

function shortLabel(label: string): string {
  return label
    .replace(" (RAE)", "")
    .replace("Thiamin (B1)", "B1")
    .replace("Riboflavin (B2)", "B2")
    .replace("Niacin (B3)", "B3")
    .replace("Pantothenic acid (B5)", "B5")
    .replace("Biotin (B7)", "B7")
    .replace("Vitamin ", "Vit ");
}

export function hasExtraNutrients(values: ExtraNutrients | null | undefined): boolean {
  if (!values) return false;
  return MICRONUTRIENT_DEFS.some((d) => values[d.key] !== undefined);
}

/**
 * Compact vitamins / minerals / lipids: one-line summary, expand into one tabbed list.
 */
export function ExtraNutrientTables({
  values,
  emptyMessage = "No vitamin, mineral, or lipid data yet.",
  caption,
  showAll = false,
}: {
  values: ExtraNutrients;
  emptyMessage?: string;
  caption?: string;
  showAll?: boolean;
}) {
  const { items, highlights, byGroup, availableGroups } = useMemo(() => {
    const present = showAll
      ? [...MICRONUTRIENT_DEFS]
      : MICRONUTRIENT_DEFS.filter((d) => values[d.key] !== undefined);
    const highlightList = HIGHLIGHT_KEYS.map((key) => {
      const def = MICRONUTRIENT_DEFS.find((d) => d.key === key);
      const value = values[key];
      if (!def || value === undefined) return null;
      return { key, label: shortLabel(def.label), unit: def.unit, value };
    }).filter(Boolean) as Array<{
      key: MicronutrientKey;
      label: string;
      unit: string;
      value: number | null;
    }>;

    const grouped = GROUP_ORDER.map((group) => ({
      group,
      label: GROUP_LABEL[group],
      rows: present.filter((d) => d.group === group),
    }));
    const available = grouped.filter((g) => g.rows.length > 0).map((g) => g.group);

    return {
      items: present,
      highlights: highlightList.slice(0, 3),
      byGroup: grouped,
      availableGroups: available,
    };
  }, [values, showAll]);

  const [tab, setTab] = useState<MicroGroup>(availableGroups[0] ?? "minerals");
  const activeTab = availableGroups.includes(tab) ? tab : (availableGroups[0] ?? "minerals");
  const activeRows = byGroup.find((g) => g.group === activeTab)?.rows ?? [];

  if (items.length === 0) {
    return (
      <p className="ui-muted" style={{ margin: 0, fontSize: 13 }}>
        {emptyMessage}
      </p>
    );
  }

  const preview =
    highlights.length > 0
      ? highlights.map((h) => `${h.label} ${fmtVal(h.value)}${h.unit}`).join(" · ")
      : `${items.length} nutrients`;

  return (
    <details className="ui-micro-panel">
      <summary className="ui-micro-panel__summary">
        <span className="ui-micro-panel__title">
          Vitamins & minerals
          {caption ? <span className="ui-micro-panel__caption">{caption}</span> : null}
        </span>
        <span className="ui-micro-panel__preview ui-muted">{preview}</span>
        <span className="ui-micro-panel__toggle" data-closed="View more" data-open="View less" />
      </summary>

      <div className="ui-micro-panel__body">
        {availableGroups.length > 1 ? (
          <div className="ui-micro-panel__tabs" role="tablist" aria-label="Nutrient groups">
            {availableGroups.map((group) => (
              <button
                key={group}
                type="button"
                role="tab"
                aria-selected={activeTab === group}
                className={
                  activeTab === group ? "ui-micro-panel__tab is-active" : "ui-micro-panel__tab"
                }
                onClick={(event) => {
                  event.preventDefault();
                  setTab(group);
                }}
              >
                {GROUP_LABEL[group]}
                <span className="ui-micro-panel__tab-count">
                  {byGroup.find((g) => g.group === group)?.rows.length ?? 0}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <ul className="ui-micro-panel__list">
          {activeRows.map((item) => (
            <li key={item.key}>
              <span className="ui-micro-panel__name">{item.label}</span>
              <span className="ui-micro-panel__value">
                {fmtVal(values[item.key])}
                <span className="ui-micro-panel__unit">{item.unit}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
