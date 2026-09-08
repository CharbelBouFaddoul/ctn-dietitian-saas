"use client";

import { useState } from "react";
import { Tooltip } from "@nutrition-saas/ui";
import { api } from "../lib/api";
import { errorMessage } from "../lib/humanize-error";
import {
  CLINIC_METHOD_HELP,
  CLINIC_METHOD_TOOLTIP,
  FACULTY_METHOD_HINT,
  FACULTY_METHOD_LABEL,
  FACULTY_METHOD_TITLE,
  FACULTY_METHOD_TOOLTIP,
  IOM_METHOD_HINT,
  IOM_METHOD_LABEL,
  IOM_METHOD_TOOLTIP,
  isFacultyMethod,
  type NutritionMethod,
} from "../lib/faculty-nutrition";

const OPTIONS: Array<{ id: NutritionMethod; title: string; short: string; hint: string; tooltip: string }> = [
  { id: "iom", title: IOM_METHOD_LABEL, short: "IOM", hint: IOM_METHOD_HINT, tooltip: IOM_METHOD_TOOLTIP },
  {
    id: "faculty_lebanon",
    title: FACULTY_METHOD_TITLE,
    short: FACULTY_METHOD_LABEL,
    hint: FACULTY_METHOD_HINT,
    tooltip: FACULTY_METHOD_TOOLTIP,
  },
];

type Props = {
  dietitianAccountId: string | null;
  value: NutritionMethod;
  allowManage: boolean;
  variant?: "chart" | "settings" | "banner";
  onChange: (method: NutritionMethod) => void;
  onError?: (message: string) => void;
};

export function ClinicNutritionMethodSwitch({
  dietitianAccountId,
  value,
  allowManage,
  variant = "chart",
  onChange,
  onError,
}: Props) {
  const [saving, setSaving] = useState(false);
  const selected = isFacultyMethod(value) ? "faculty_lebanon" : "iom";
  const canSwitch = allowManage && Boolean(dietitianAccountId);

  if (!allowManage) return null;

  async function select(method: NutritionMethod) {
    if (!canSwitch || !dietitianAccountId || method === selected || saving) return;
    const previous = selected;
    onChange(method);
    setSaving(true);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/settings`, {
        method: "PATCH",
        body: JSON.stringify({ defaultNutritionMethod: method }),
      });
    } catch (err) {
      onChange(previous);
      onError?.(errorMessage(err, "Unable to change the clinic calculation method"));
    } finally {
      setSaving(false);
    }
  }

  if (variant === "banner") {
    return (
      <div className="ui-clinic-method ui-clinic-method--banner">
        <Tooltip label={CLINIC_METHOD_TOOLTIP}>
          <span className="ui-clinic-method__banner-label">Method</span>
        </Tooltip>
        <div className="ui-clinic-method__banner-options" role="radiogroup" aria-label="Clinic calculation method">
          {OPTIONS.map((option) => {
            const on = option.id === selected;
            return (
              <Tooltip key={option.id} label={option.tooltip}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!canSwitch || saving}
                  className={`ui-clinic-method__banner-option${on ? " is-on" : ""}`}
                  onClick={() => void select(option.id)}
                >
                  {option.short}
                </button>
              </Tooltip>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <section className={`ui-clinic-method${variant === "settings" ? " ui-clinic-method--settings" : ""}`}>
      <div className="ui-clinic-method__head">
        {variant === "settings" ? null : <h3 className="ui-clinic-method__title">Clinic calculation method</h3>}
        <p className="ui-clinic-method__help">{CLINIC_METHOD_HELP}</p>
      </div>
      <div className="ui-clinic-method__options" role="radiogroup" aria-label="Clinic calculation method">
        {OPTIONS.map((option) => {
          const on = option.id === selected;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!canSwitch || saving}
              className={`ui-clinic-method__option${on ? " is-on" : ""}`}
              onClick={() => void select(option.id)}
            >
              <span className="ui-clinic-method__mark" aria-hidden="true" />
              <span className="ui-clinic-method__copy">
                <strong>{option.title}</strong>
                <span>{option.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
