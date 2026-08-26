"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Dialog,
  DonutChart,
  EmptyState,
  Input,
  LoadingState,
  RdaBarList,
  Select,
  StatusBadge,
  Table,
  TargetBar,
  Td,
} from "@nutrition-saas/ui";
import { api } from "../lib/api";
import { MICRONUTRIENT_DEFS, type ExtraNutrients } from "../lib/micronutrients";
import { errorMessage } from "../lib/humanize-error";
import { groupDaysByWeek, weekOfDay } from "../lib/meal-plan-weeks";
import {
  analysisMicroLabel,
  DAILY_MACRO_TARGETS,
  DEFAULT_RDA_PROFILE_ID,
  isRdaProfileId,
  RDA_PROFILE_STORAGE_KEY,
  RDA_PROFILES,
  type RdaProfile,
  type RdaProfileId,
} from "../lib/nutrition-targets";
import { statusLabel, unitLabel } from "../lib/practice-labels";
import { foodSourceShortLabel } from "../lib/food-source-label";
import { ClientMealNotesRail } from "./client-meal-notes-rail";
import { MealMacroDonuts } from "./meal-macro-donuts";

export type MealPlanView = "plan" | "analysis";

type Nutrition = {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG?: number | null;
  sodiumMg?: number | null;
};

type FoodHit = {
  id: string;
  name: string;
  origin?: "catalog" | "custom";
  servingDescription?: string | null;
  referenceQuantity?: number;
  referenceUnit?: string;
  hasOverride?: boolean;
  source?: { key?: string; name: string };
};

type RecipeHit = { id: string; name: string; servings?: number };

type MealItem = {
  id: string;
  itemType: string;
  quantity: number;
  unit: string;
  notes: string | null;
  food: {
    id: string;
    name: string;
    origin?: "catalog" | "custom";
    servingDescription?: string | null;
  } | null;
  recipe: { id: string; name: string; servings?: number } | null;
  presented: Nutrition;
};

type Meal = {
  id: string;
  name: string;
  notes: string | null;
  presented: Nutrition;
  items: MealItem[];
};

type PlanDay = {
  id: string;
  dayNumber: number;
  weekday?: string | null;
  title: string | null;
  notes: string | null;
  presented: Nutrition;
  presentedExtraNutrients?: ExtraNutrients;
  meals: Meal[];
};

type Snapshot = { days: PlanDay[] };

type PlanDetail = {
  id: string;
  name: string;
  status: string;
  clientId: string;
  dayLabelMode: "NUMBERED" | "WEEKDAY";
  versions: Array<{ id: string; versionNumber: number; status: string }>;
};

type VersionDetail = {
  id: string;
  versionNumber: number;
  status: string;
  immutable: boolean;
  snapshot: Snapshot;
};

type TrackingGlance = {
  water: { totalLiters: number; targetMl: number | null };
  exercise: { totalDurationMinutes: number };
};

const MEAL_NAME_PRESETS = [
  "Breakfast",
  "Morning Snack",
  "Lunch",
  "Afternoon Snack",
  "Dinner",
  "Evening Snack",
] as const;

const UNITS = ["g", "kg", "oz", "lb", "ml", "l", "fl_oz"] as const;
const FOODS_PAGE_SIZE = 8;
const MEAL_DONUT_COLORS = ["#0f766e", "#14b8a6", "#5eead4", "#f59e0b", "#3b82f6", "#8b5cf6"];

function n(value: number | null | undefined) {
  return value ?? 0;
}

function weightToKg(value: number, unit: string) {
  const u = unit.toLowerCase();
  if (u === "lb" || u === "lbs") return value * 0.45359237;
  return value;
}

function rdaRows(presented: Nutrition | undefined, extras: ExtraNutrients | undefined, profile: RdaProfile) {
  const vitaminMineral = MICRONUTRIENT_DEFS.filter((def) => def.group !== "lipids").map((def) => ({
    id: def.key,
    label: analysisMicroLabel(def.label),
    actual: extras?.[def.key],
    target: profile.micros[def.key],
    unit: def.unit,
  }));
  return [
    {
      id: "sodiumMg",
      label: "Sodium",
      actual: presented?.sodiumMg,
      target: profile.sodiumMg,
      unit: "mg",
    },
    ...vitaminMineral,
  ].sort((a, b) => a.label.localeCompare(b.label));
}

function dayInWeek(dayNumber: number) {
  return ((dayNumber - 1) % 7) + 1;
}

function dayWeek(dayNumber: number) {
  return Math.floor((dayNumber - 1) / 7) + 1;
}

function dayTabLabel(day: PlanDay) {
  if (day.weekday) return day.weekday;
  return `Day ${dayInWeek(day.dayNumber)}`;
}

function dayFullLabel(day: PlanDay) {
  if (day.title) return day.title;
  if (day.weekday) return `Week ${dayWeek(day.dayNumber)} · ${day.weekday}`;
  return `Week ${dayWeek(day.dayNumber)} · Day ${dayInWeek(day.dayNumber)}`;
}

function itemName(item: MealItem) {
  return item.food?.name ?? item.recipe?.name ?? "Item";
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.5 7h15M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7M18 7l-.7 12.1a1.5 1.5 0 0 1-1.5 1.4H8.2a1.5 1.5 0 0 1-1.5-1.4L6 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function planStatusCaption(status: string) {
  if (status === "ACTIVE") return "Published";
  return statusLabel(status);
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.4 13.1a7.6 7.6 0 0 0 .06-2.2l2.04-1.58-2-3.46-2.45.58a7.7 7.7 0 0 0-1.9-1.1L14.7 3h-5.4L8.85 5.34a7.7 7.7 0 0 0-1.9 1.1L4.5 5.86l-2 3.46L4.54 10.9a7.6 7.6 0 0 0 .06 2.2L2.56 14.68l2 3.46 2.45-.58c.58.47 1.22.84 1.9 1.1L9.3 21h5.4l.45-2.34c.68-.26 1.32-.63 1.9-1.1l2.45.58 2-3.46-1.98-1.58Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type PlanOption = { id: string; name: string; status: string };

function RdaProfilePicker({
  value,
  onChange,
}: {
  value: RdaProfileId;
  onChange: (id: RdaProfileId) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = RDA_PROFILES[value];

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [open]);

  return (
    <div className="ui-mp__rda-picker" ref={ref}>
      <button
        type="button"
        className="ui-mp__rda-picker-btn"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Reference intake source"
        onClick={() => setOpen((next) => !next)}
      >
        <span>{selected.label}</span>
        <span className="ui-mp__rda-picker-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="ui-mp__rda-picker-menu" role="listbox" aria-label="Reference intake source">
          {Object.values(RDA_PROFILES).map((profile) => (
            <button
              key={profile.id}
              type="button"
              role="option"
              aria-selected={profile.id === value}
              className={profile.id === value ? "is-active" : undefined}
              onClick={() => {
                onChange(profile.id);
                setOpen(false);
              }}
            >
              <strong>{profile.label}</strong>
              <span>{profile.basis}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type Props = {
  dietitianAccountId: string;
  planId: string;
  clientId?: string;
  compact?: boolean;
  allowManage?: boolean;
  initialView?: MealPlanView;
  versionId?: string | null;
  plans?: PlanOption[];
  allPlansHref?: string;
  onViewChange?: (view: MealPlanView) => void;
  onArchived?: () => void;
  onCreateRequest?: () => void;
  onSelectPlan?: (planId: string) => void;
};

export function ClientMealPlanWorkspace({
  dietitianAccountId,
  planId,
  clientId,
  compact = false,
  allowManage = true,
  initialView = "plan",
  versionId: versionIdProp,
  plans: planOptions,
  allPlansHref,
  onViewChange,
  onArchived,
  onCreateRequest,
  onSelectPlan,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<MealPlanView>(initialView);
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [version, setVersion] = useState<VersionDetail | null>(null);
  const [activeDayId, setActiveDayId] = useState("");
  const [activeWeek, setActiveWeek] = useState(1);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [foodQuery, setFoodQuery] = useState("");
  const [recipeQuery, setRecipeQuery] = useState("");
  const [foodHits, setFoodHits] = useState<FoodHit[]>([]);
  const [recipeHits, setRecipeHits] = useState<RecipeHit[]>([]);
  const [quantity, setQuantity] = useState("100");
  const [recipeServings, setRecipeServings] = useState("1");
  const [unit, setUnit] = useState("g");
  const [servingHint, setServingHint] = useState<string | null>(null);
  const [newMealName, setNewMealName] = useState("Breakfast");
  const [customMealName, setCustomMealName] = useState("");
  const [renameMealId, setRenameMealId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [foodsPage, setFoodsPage] = useState(0);
  const [foodsSort, setFoodsSort] = useState<"energy" | "name">("energy");
  const [tracking, setTracking] = useState<TrackingGlance | null>(null);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [rdaProfileId, setRdaProfileId] = useState<RdaProfileId>(DEFAULT_RDA_PROFILE_ID);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  const apiBase = `/api/v1/dietitian/${dietitianAccountId}/meal-plans/${planId}`;

  const selectedVersionId = useMemo(() => {
    if (versionIdProp) return versionIdProp;
    const draft = plan?.versions.find((row) => row.status === "DRAFT");
    const published = plan?.versions.find((row) => row.status === "PUBLISHED");
    return draft?.id ?? published?.id ?? plan?.versions[0]?.id;
  }, [versionIdProp, plan]);

  function applyVersion(loaded: VersionDetail) {
    setVersion(loaded);
    setError(null);
    const first = loaded.snapshot.days[0];
    if (!activeDayId && first) {
      setActiveDayId(first.id);
      setActiveWeek(weekOfDay(first.dayNumber));
    } else if (activeDayId) {
      const still = loaded.snapshot.days.find((d) => d.id === activeDayId);
      if (still) setActiveWeek(weekOfDay(still.dayNumber));
      else if (first) {
        setActiveDayId(first.id);
        setActiveWeek(weekOfDay(first.dayNumber));
      }
    }
  }

  async function load(nextVersionId?: string) {
    const detail = await api<PlanDetail>(apiBase);
    setPlan(detail);
    const selected =
      nextVersionId ??
      selectedVersionId ??
      detail.versions.find((row) => row.status === "DRAFT")?.id ??
      detail.versions[0]?.id;
    if (!selected) return;
    const loaded = await api<VersionDetail>(`${apiBase}/versions/${selected}`);
    applyVersion(loaded);
  }

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load plan")));
  }, [dietitianAccountId, planId, selectedVersionId]);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  const trackingClientId = clientId ?? plan?.clientId;

  useEffect(() => {
    if (!trackingClientId) return;
    const clientBase = `/api/v1/dietitian/${dietitianAccountId}/clients/${trackingClientId}`;
    void api<TrackingGlance>(`${clientBase}/tracking/summary`)
      .then(setTracking)
      .catch(() => setTracking(null));
    void api<{ latest?: { WEIGHT?: { value: number; unit: string } | null } }>(`${clientBase}/evolution`)
      .then((row) => {
        const weight = row.latest?.WEIGHT;
        setWeightKg(weight ? weightToKg(weight.value, weight.unit) : null);
      })
      .catch(() => setWeightKg(null));
  }, [dietitianAccountId, trackingClientId]);

  useEffect(() => {
    if (!switcherOpen) return;
    function onPointer(event: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(event.target as Node)) {
        setSwitcherOpen(false);
      }
    }
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [switcherOpen]);

  const canEdit = version?.status === "DRAFT" && !version.immutable;
  const weekGroups = version ? groupDaysByWeek(version.snapshot.days) : [];
  const currentWeek = weekGroups.some((g) => g.week === activeWeek)
    ? activeWeek
    : (weekGroups[0]?.week ?? 1);
  const weekDays = weekGroups.find((g) => g.week === currentWeek)?.days ?? [];
  const focusedDay =
    (weekDays.find((d) => d.id === activeDayId) as PlanDay | undefined) ??
    (weekDays[0] as PlanDay | undefined) ??
    null;

  function selectView(next: MealPlanView) {
    setView(next);
    onViewChange?.(next);
  }

  async function publish() {
    if (!version) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${apiBase}/versions/${version.id}/publish`, { method: "POST" });
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Publish failed"));
    } finally {
      setBusy(false);
    }
  }

  async function newDraft() {
    setBusy(true);
    setError(null);
    try {
      const created = await api<VersionDetail>(`${apiBase}/versions`, { method: "POST" });
      await load(created.id);
      if (!compact) {
        router.replace(`/practice/${dietitianAccountId}/meal-plans/${planId}?versionId=${created.id}`);
      }
    } catch (err) {
      setError(errorMessage(err, "Could not create draft"));
    } finally {
      setBusy(false);
    }
  }

  async function addDay() {
    if (!version) return;
    try {
      await api(`${apiBase}/versions/${version.id}/days`, { method: "POST", body: JSON.stringify({}) });
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not add day"));
    }
  }

  async function addWeek() {
    if (!version) return;
    setBusy(true);
    try {
      await api(`${apiBase}/versions/${version.id}/weeks`, { method: "POST", body: JSON.stringify({}) });
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not add week"));
    } finally {
      setBusy(false);
    }
  }

  async function setDayLabelMode(mode: "NUMBERED" | "WEEKDAY") {
    if (!plan || plan.dayLabelMode === mode) return;
    setBusy(true);
    try {
      const updated = await api<PlanDetail>(apiBase, {
        method: "PATCH",
        body: JSON.stringify({ dayLabelMode: mode }),
      });
      setPlan(updated);
      if (version) await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not update day labels"));
    } finally {
      setBusy(false);
    }
  }

  async function createMeal(event: FormEvent) {
    event.preventDefault();
    if (!version || !focusedDay) return;
    const name = newMealName === "Custom" ? customMealName.trim() : newMealName;
    if (!name) {
      setError("Meal name is required");
      return;
    }
    try {
      await api(`${apiBase}/versions/${version.id}/days/${focusedDay.id}/meals`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setCustomMealName("");
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not create meal"));
    }
  }

  async function saveRename(mealId: string) {
    if (!version || !renameValue.trim()) return;
    try {
      await api(`${apiBase}/versions/${version.id}/meals/${mealId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      setRenameMealId(null);
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not rename meal"));
    }
  }

  async function saveMealNotes(mealId: string, notes: string) {
    if (!version) return;
    try {
      const loaded = await api<VersionDetail>(`${apiBase}/versions/${version.id}/meals/${mealId}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: notes.trim() || null }),
      });
      applyVersion(loaded);
    } catch (err) {
      setError(errorMessage(err, "Could not save notes"));
    }
  }

  async function deleteMeal(mealId: string) {
    if (!version) return;
    try {
      await api(`${apiBase}/versions/${version.id}/meals/${mealId}`, { method: "DELETE" });
      if (editingMealId === mealId) setEditingMealId(null);
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not delete meal"));
    }
  }

  async function removeItem(itemId: string) {
    if (!version) return;
    try {
      await api(`${apiBase}/versions/${version.id}/items/${itemId}`, { method: "DELETE" });
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not remove item"));
    }
  }

  async function updateItemQuantity(itemId: string, quantityValue: number, unitValue: string) {
    if (!version) return;
    try {
      await api(`${apiBase}/versions/${version.id}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity: quantityValue, unit: unitValue }),
      });
      setQtyDrafts((curr) => {
        const next = { ...curr };
        delete next[itemId];
        return next;
      });
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not update quantity"));
    }
  }

  async function searchFoods() {
    try {
      const result = await api<{ items: FoodHit[] }>(
        `/api/v1/dietitian/${dietitianAccountId}/foods?q=${encodeURIComponent(foodQuery)}&pageSize=8`,
      );
      setFoodHits(result.items);
    } catch (err) {
      setError(errorMessage(err, "Food search failed"));
    }
  }

  async function searchRecipes() {
    try {
      const result = await api<{ items: RecipeHit[] }>(
        `/api/v1/dietitian/${dietitianAccountId}/recipes?q=${encodeURIComponent(recipeQuery)}&pageSize=8`,
      );
      setRecipeHits(result.items);
    } catch (err) {
      setError(errorMessage(err, "Recipe search failed"));
    }
  }

  async function addFood(mealId: string, hit: FoodHit) {
    if (!version) return;
    const qty = hit.referenceQuantity ?? Number(quantity);
    const u = hit.referenceUnit ?? unit;
    try {
      const loaded = await api<VersionDetail>(`${apiBase}/versions/${version.id}/meals/${mealId}/items`, {
        method: "POST",
        body: JSON.stringify({ itemType: "FOOD", foodId: hit.id, quantity: qty, unit: u }),
      });
      setFoodHits([]);
      setFoodQuery("");
      setServingHint(null);
      applyVersion(loaded);
    } catch (err) {
      setError(errorMessage(err, "Could not add food"));
    }
  }

  async function addRecipe(mealId: string, recipeId: string) {
    if (!version) return;
    try {
      const loaded = await api<VersionDetail>(`${apiBase}/versions/${version.id}/meals/${mealId}/items`, {
        method: "POST",
        body: JSON.stringify({
          itemType: "RECIPE",
          recipeId,
          quantity: Number(recipeServings),
          unit: "serving",
        }),
      });
      setRecipeHits([]);
      setRecipeQuery("");
      applyVersion(loaded);
    } catch (err) {
      setError(errorMessage(err, "Could not add recipe"));
    }
  }

  async function archivePlanById(id: string, name: string) {
    if (!window.confirm(`Delete meal plan “${name}”? It will be archived.`)) return;
    setBusy(true);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/meal-plans/${id}/archive`, { method: "POST" });
      setSwitcherOpen(false);
      setSettingsOpen(false);
      if (id === plan?.id && !onArchived) {
        router.push(`/practice/${dietitianAccountId}/meal-plans`);
        return;
      }
      onArchived?.();
    } catch (err) {
      setError(errorMessage(err, "Could not delete plan"));
    } finally {
      setBusy(false);
    }
  }

  async function archivePlan() {
    if (!plan) return;
    await archivePlanById(plan.id, plan.name);
  }

  async function deleteVersion(row: { id: string; versionNumber: number; status: string }) {
    const last = (plan?.versions.length ?? 0) <= 1;
    const confirmed = window.confirm(
      last
        ? `This is the only version. Delete meal plan “${plan?.name}”?`
        : `Delete ${statusLabel(row.status).toLowerCase()} version ${row.versionNumber}?`,
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      const updated = await api<PlanDetail>(`${apiBase}/versions/${row.id}`, { method: "DELETE" });
      if (updated.status === "ARCHIVED") {
        setSettingsOpen(false);
        if (onArchived) onArchived();
        else router.push(`/practice/${dietitianAccountId}/meal-plans`);
        return;
      }
      setPlan(updated);
      const keepCurrent = updated.versions.some((item) => item.id === version?.id);
      const nextId =
        (keepCurrent ? version?.id : null) ??
        updated.versions.find((item) => item.status === "DRAFT")?.id ??
        updated.versions.find((item) => item.status === "PUBLISHED")?.id ??
        updated.versions[0]?.id;
      if (nextId) await load(nextId);
    } catch (err) {
      setError(errorMessage(err, "Could not delete version"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteDay() {
    if (!version || !focusedDay) return;
    if (!window.confirm(`Remove ${dayFullLabel(focusedDay)} from this draft?`)) return;
    try {
      await api(`${apiBase}/versions/${version.id}/days/${focusedDay.id}`, { method: "DELETE" });
      setActiveDayId("");
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not delete day"));
    }
  }

  const foods = useMemo(() => {
    if (!focusedDay) return [];
    const rows = focusedDay.meals.flatMap((meal) =>
      meal.items.map((item) => ({
        id: item.id,
        name: itemName(item),
        energy: n(item.presented.energyKcal),
        meal: meal.name,
        quantity: item.quantity,
        unit: item.unit,
      })),
    );
    rows.sort((a, b) => (foodsSort === "name" ? a.name.localeCompare(b.name) : b.energy - a.energy));
    return rows;
  }, [focusedDay, foodsSort]);

  const foodsPageCount = Math.max(1, Math.ceil(foods.length / FOODS_PAGE_SIZE));
  const foodsSlice = foods.slice(foodsPage * FOODS_PAGE_SIZE, foodsPage * FOODS_PAGE_SIZE + FOODS_PAGE_SIZE);

  useEffect(() => {
    setFoodsPage(0);
  }, [focusedDay?.id, foodsSort]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(RDA_PROFILE_STORAGE_KEY);
      if (stored && isRdaProfileId(stored)) setRdaProfileId(stored);
    } catch {
      /* ignore private-mode storage */
    }
  }, []);

  function selectRdaProfile(id: RdaProfileId) {
    setRdaProfileId(id);
    try {
      window.localStorage.setItem(RDA_PROFILE_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }

  if (!plan || !version) {
    return error ? <Alert tone="danger">{error}</Alert> : <LoadingState>Loading plan…</LoadingState>;
  }

  const presented = focusedDay?.presented;
  const extras = focusedDay?.presentedExtraNutrients;
  const rdaProfile = RDA_PROFILES[rdaProfileId];
  const microRda = rdaRows(presented, extras, rdaProfile);
  const mealMacros =
    focusedDay?.meals.map((meal) => ({
      id: meal.id,
      name: meal.name,
      energyKcal: n(meal.presented.energyKcal),
      fatG: n(meal.presented.fatG),
      carbohydrateG: n(meal.presented.carbohydrateG),
      proteinG: n(meal.presented.proteinG),
    })) ?? [];

  return (
    <>
    <div className={`ui-mp${compact ? " ui-mp--compact" : ""}`}>
      <header className="ui-mp__top">
        <div className="ui-mp__identity">
          {planOptions && planOptions.length > 0 && onSelectPlan ? (
            <div className="ui-mp__switcher" ref={switcherRef}>
              <button
                type="button"
                className="ui-mp__switcher-btn"
                aria-expanded={switcherOpen}
                aria-haspopup="listbox"
                onClick={() => setSwitcherOpen((open) => !open)}
              >
                <span>{plan.name}</span>
                <span className="ui-mp__switcher-caret" aria-hidden>
                  ▾
                </span>
              </button>
              {switcherOpen ? (
                <div className="ui-mp__switcher-menu" role="listbox" aria-label="Meal plans">
                  {planOptions.map((option) => (
                    <div
                      key={option.id}
                      className={`ui-mp__switcher-row${option.id === plan.id ? " is-active" : ""}`}
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={option.id === plan.id}
                        className="ui-mp__switcher-item"
                        onClick={() => {
                          onSelectPlan(option.id);
                          setSwitcherOpen(false);
                        }}
                      >
                        <span className="ui-mp__switcher-name">{option.name}</span>
                        <span className="ui-mp__switcher-status">{planStatusCaption(option.status)}</span>
                      </button>
                      {allowManage ? (
                        <button
                          type="button"
                          className="ui-mp__switcher-delete"
                          aria-label={`Delete ${option.name}`}
                          disabled={busy}
                          onClick={(event) => {
                            event.stopPropagation();
                            void archivePlanById(option.id, option.name);
                          }}
                        >
                          <TrashIcon />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {allPlansHref ? (
                    <Link href={allPlansHref} className="ui-mp__switcher-all" onClick={() => setSwitcherOpen(false)}>
                      All meal plans
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <h2 className="ui-mp__title">{plan.name}</h2>
          )}
          <p className="ui-mp__meta">
            v{version.versionNumber} · {version.immutable ? "Published" : "Draft"}
            <StatusBadge status={plan.status} label={statusLabel(plan.status)} />
          </p>
        </div>
        <div className="ui-mp__toolbar">
          {onCreateRequest ? (
            <button
              type="button"
              className="ui-mp__icon-btn"
              aria-label="New meal plan"
              onClick={onCreateRequest}
            >
              +
            </button>
          ) : null}
          <button
            type="button"
            className="ui-mp__icon-btn"
            aria-label="Plan settings"
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            <GearIcon />
          </button>
          <div className="ui-mp__toggle" role="tablist" aria-label="Plan or analysis">
            <button
              type="button"
              className={view === "plan" ? "is-active" : undefined}
              onClick={() => selectView("plan")}
            >
              Plan
            </button>
            <button
              type="button"
              className={view === "analysis" ? "is-active" : undefined}
              onClick={() => selectView("analysis")}
            >
              Analysis
            </button>
          </div>
          {canEdit ? (
            <Button size="sm" onClick={() => void publish()} disabled={busy}>
              Publish
            </Button>
          ) : (
            <Button size="sm" onClick={() => void newDraft()} disabled={busy}>
              New draft
            </Button>
          )}
        </div>
      </header>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="ui-mp__schedule">
        <div className="ui-mp__weeks" role="tablist" aria-label="Weeks">
          {weekGroups.map((group) => (
            <button
              key={group.week}
              type="button"
              className={group.week === currentWeek ? "is-active" : undefined}
              onClick={() => {
                setActiveWeek(group.week);
                const first = group.days[0];
                if (first) setActiveDayId(first.id);
              }}
            >
              Week {group.week}
            </button>
          ))}
          {canEdit ? (
            <button
              type="button"
              className="ui-mp__icon-btn ui-mp__row-add"
              disabled={busy}
              onClick={() => void addWeek()}
              aria-label="Add week"
            >
              +
            </button>
          ) : null}
        </div>

        <div className="ui-mp__days" role="tablist" aria-label="Days">
          {weekDays.map((day) => (
            <button
              key={day.id}
              type="button"
              role="tab"
              className={day.id === focusedDay?.id ? "is-active" : undefined}
              aria-selected={day.id === focusedDay?.id}
              onClick={() => {
                setActiveDayId(day.id);
                setActiveWeek(weekOfDay(day.dayNumber));
                setEditingMealId(null);
                setFoodHits([]);
                setRecipeHits([]);
                setRenameMealId(null);
              }}
            >
              {dayTabLabel(day as PlanDay)}
            </button>
          ))}
          {canEdit ? (
            <button
              type="button"
              className="ui-mp__icon-btn ui-mp__row-add"
              disabled={busy}
              onClick={() => void addDay()}
              aria-label="Add day"
            >
              +
            </button>
          ) : null}
        </div>
      </div>

      {!focusedDay ? (
        <EmptyState title="No days yet">
          {canEdit ? <Button onClick={() => void addDay()}>Add first day</Button> : "This version has no days."}
        </EmptyState>
      ) : view === "plan" ? (
        <div className="ui-mp__plan">
          <div className="ui-mp__meals">
            <div className="ui-mp__day-head">
              <div>
                <h3>{dayFullLabel(focusedDay)}</h3>
                <p className="ui-muted">
                  {n(presented?.energyKcal)} kcal · {focusedDay.meals.length} meal
                  {focusedDay.meals.length === 1 ? "" : "s"}
                </p>
              </div>
              {canEdit && version.snapshot.days.length > 1 ? (
                <button type="button" className="ui-mp__danger" onClick={() => void deleteDay()}>
                  Remove day
                </button>
              ) : null}
            </div>

            {canEdit ? (
              <form onSubmit={(event) => void createMeal(event)} className="ui-mp__add-meal">
                <div className="ui-mp__meal-types" role="group" aria-label="Meal type">
                  {MEAL_NAME_PRESETS.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className={newMealName === name ? "is-active" : undefined}
                      onClick={() => setNewMealName(name)}
                    >
                      {name}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={newMealName === "Custom" ? "is-active" : undefined}
                    onClick={() => setNewMealName("Custom")}
                  >
                    Custom
                  </button>
                </div>
                {newMealName === "Custom" ? (
                  <Input
                    value={customMealName}
                    onChange={(e) => setCustomMealName(e.target.value)}
                    placeholder="Meal name…"
                    required
                  />
                ) : null}
                <Button type="submit" size="sm" variant="secondary">
                  Add meal
                </Button>
              </form>
            ) : null}

            {focusedDay.meals.length === 0 ? (
              <EmptyState title="No meals yet">
                {canEdit ? "Add a meal, then add foods or recipes." : "This day has no meals."}
              </EmptyState>
            ) : (
              focusedDay.meals.map((meal) => (
                <article key={meal.id} className="ui-mp__meal">
                  <header className="ui-mp__meal-head">
                    {renameMealId === meal.id ? (
                      <div className="ui-mp__rename">
                        <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
                        <Button size="sm" onClick={() => void saveRename(meal.id)}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRenameMealId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <h4>{meal.name}</h4>
                    )}
                    {canEdit && renameMealId !== meal.id ? (
                      <div className="ui-mp__meal-actions">
                        <Button
                          variant={editingMealId === meal.id ? "secondary" : "ghost"}
                          size="sm"
                          onClick={() => {
                            setEditingMealId(editingMealId === meal.id ? null : meal.id);
                            setFoodHits([]);
                            setRecipeHits([]);
                          }}
                        >
                          {editingMealId === meal.id ? "Done" : "Add foods"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRenameMealId(meal.id);
                            setRenameValue(meal.name);
                          }}
                        >
                          Rename
                        </Button>
                        <button type="button" className="ui-mp__danger" onClick={() => void deleteMeal(meal.id)}>
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </header>

                  {meal.items.length > 0 ? (
                    <ul className="ui-mp__items">
                      {meal.items.map((item) => {
                        const draftQty = qtyDrafts[item.id] ?? String(item.quantity);
                        return (
                          <li key={item.id}>
                            <span className="ui-mp__item-name">
                              {itemName(item)}
                              <span className="ui-muted"> · {n(item.presented.energyKcal)} kcal</span>
                            </span>
                            {canEdit ? (
                              <span className="ui-mp__item-qty">
                                <Input
                                  value={draftQty}
                                  onChange={(e) =>
                                    setQtyDrafts((curr) => ({ ...curr, [item.id]: e.target.value }))
                                  }
                                />
                                <span className="ui-muted">{unitLabel(item.unit)}</span>
                                {draftQty !== String(item.quantity) ? (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => void updateItemQuantity(item.id, Number(draftQty), item.unit)}
                                  >
                                    Update
                                  </Button>
                                ) : null}
                              </span>
                            ) : (
                              <span className="ui-muted">
                                {item.quantity} {unitLabel(item.unit)}
                              </span>
                            )}
                            {canEdit ? (
                              <button type="button" className="ui-mp__danger" onClick={() => void removeItem(item.id)}>
                                Remove
                              </button>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="ui-muted ui-mp__empty-line">No items yet.</p>
                  )}

                  {canEdit ? (
                    <label className="ui-mp__notes">
                      Notes
                      <Input
                        value={noteDrafts[meal.id] ?? meal.notes ?? ""}
                        onChange={(e) => setNoteDrafts((curr) => ({ ...curr, [meal.id]: e.target.value }))}
                        onBlur={(e) => {
                          if (e.target.value !== (meal.notes ?? "")) {
                            void saveMealNotes(meal.id, e.target.value);
                          }
                        }}
                        placeholder="Instructions for this meal…"
                      />
                    </label>
                  ) : meal.notes ? (
                    <p className="ui-muted ui-mp__empty-line">{meal.notes}</p>
                  ) : null}

                  <footer className="ui-mp__meal-macros">
                    <span>Energy {n(meal.presented.energyKcal)} kcal</span>
                    <span>Fat {n(meal.presented.fatG)} g</span>
                    <span>Carbs {n(meal.presented.carbohydrateG)} g</span>
                    <span>Protein {n(meal.presented.proteinG)} g</span>
                    <span>Fiber {n(meal.presented.fiberG)} g</span>
                  </footer>

                  {canEdit && editingMealId === meal.id ? (
                    <div className="ui-mp__picker">
                      <div>
                        <p className="ui-mp__picker-label">Food</p>
                        <div className="ui-mp__picker-row">
                          <Input
                            value={foodQuery}
                            onChange={(e) => setFoodQuery(e.target.value)}
                            placeholder="Search catalog…"
                          />
                          <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-label="Amount" />
                          <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
                            {UNITS.map((u) => (
                              <option key={u} value={u}>
                                {unitLabel(u)}
                              </option>
                            ))}
                          </Select>
                          <Button variant="secondary" size="sm" onClick={() => void searchFoods()}>
                            Search
                          </Button>
                        </div>
                        {servingHint ? <p className="ui-muted">{servingHint}</p> : null}
                        {foodHits.map((hit) => (
                          <Button
                            key={hit.id}
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              if (hit.referenceQuantity != null) setQuantity(String(hit.referenceQuantity));
                              if (hit.referenceUnit) setUnit(hit.referenceUnit);
                              setServingHint(hit.servingDescription ?? null);
                              void addFood(meal.id, hit);
                            }}
                          >
                            + {hit.name}
                            {hit.origin === "custom"
                              ? " (custom)"
                              : hit.source
                                ? ` · ${foodSourceShortLabel(hit.source)}`
                                : ""}
                          </Button>
                        ))}
                      </div>
                      <div>
                        <p className="ui-mp__picker-label">Recipe</p>
                        <div className="ui-mp__picker-row">
                          <Input
                            value={recipeQuery}
                            onChange={(e) => setRecipeQuery(e.target.value)}
                            placeholder="Meal library…"
                          />
                          <Input
                            value={recipeServings}
                            onChange={(e) => setRecipeServings(e.target.value)}
                            aria-label="Servings"
                          />
                          <Button variant="secondary" size="sm" onClick={() => void searchRecipes()}>
                            Search
                          </Button>
                        </div>
                        {recipeHits.map((hit) => (
                          <Button
                            key={hit.id}
                            variant="secondary"
                            size="sm"
                            onClick={() => void addRecipe(meal.id, hit.id)}
                          >
                            + {hit.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>

          <aside className="ui-mp__rail" aria-label="Global analysis">
            <h3>Global analysis</h3>
            <TargetBar
              label="Energy"
              actual={presented?.energyKcal}
              target={DAILY_MACRO_TARGETS.energyKcal}
              unit="kcal"
              tone="energy"
            />
            <DonutChart
              caption="Macronutrients"
              slices={[
                { label: "Fat", value: n(presented?.fatG) * 9, color: "#e4c44a" },
                { label: "Carbs", value: n(presented?.carbohydrateG) * 4, color: "#e8a090" },
                { label: "Protein", value: n(presented?.proteinG) * 4, color: "#7eafd9" },
              ]}
            />
            <TargetBar label="Fat" actual={presented?.fatG} target={DAILY_MACRO_TARGETS.fatG} unit="g" tone="fat" />
            <TargetBar
              label="Carbohydrate"
              actual={presented?.carbohydrateG}
              target={DAILY_MACRO_TARGETS.carbohydrateG}
              unit="g"
              tone="carb"
            />
            <TargetBar
              label="Protein"
              actual={presented?.proteinG}
              target={DAILY_MACRO_TARGETS.proteinG}
              unit="g"
              tone="protein"
            />
            <TargetBar
              label="Fiber"
              actual={presented?.fiberG}
              target={DAILY_MACRO_TARGETS.fiberG}
              unit="g"
              tone="fiber"
            />
            <MealMacroDonuts meals={mealMacros} weightKg={weightKg} />
            {trackingClientId ? (
              <ClientMealNotesRail
                dietitianAccountId={dietitianAccountId}
                clientId={trackingClientId}
                allowManage={allowManage}
                onError={(message) => setError(message)}
              />
            ) : null}
            <div className="ui-mp__micro-list">
              <div className="ui-mp__micro-head">
                <h3>Micronutrients</h3>
                <RdaProfilePicker value={rdaProfileId} onChange={selectRdaProfile} />
              </div>
              <p className="ui-muted ui-mp__source">From imported food data · {rdaProfile.basis}</p>
              <RdaBarList rows={microRda} compact />
            </div>
          </aside>
        </div>
      ) : (
        <div className="ui-mp__analysis">
          <section className="ui-mp__card">
            <h3>Daily analysis · {dayFullLabel(focusedDay)}</h3>
            <div className="ui-mp__macro-grid">
              <TargetBar
                label="Energy"
                actual={presented?.energyKcal}
                target={DAILY_MACRO_TARGETS.energyKcal}
                unit="kcal"
                tone="energy"
              />
              <TargetBar label="Fat" actual={presented?.fatG} target={DAILY_MACRO_TARGETS.fatG} unit="g" tone="fat" />
              <TargetBar
                label="Carbohydrate"
                actual={presented?.carbohydrateG}
                target={DAILY_MACRO_TARGETS.carbohydrateG}
                unit="g"
                tone="carb"
              />
              <TargetBar
                label="Protein"
                actual={presented?.proteinG}
                target={DAILY_MACRO_TARGETS.proteinG}
                unit="g"
                tone="protein"
              />
              <TargetBar
                label="Fiber"
                actual={presented?.fiberG}
                target={DAILY_MACRO_TARGETS.fiberG}
                unit="g"
                tone="fiber"
              />
            </div>
          </section>

          <div className="ui-mp__chart-grid">
            <section className="ui-mp__card">
              <h3>Macronutrient distribution</h3>
              <DonutChart
                size={132}
                slices={[
                  { label: "Fat", value: n(presented?.fatG) * 9, color: "#e4c44a" },
                  { label: "Carbs", value: n(presented?.carbohydrateG) * 4, color: "#e8a090" },
                  { label: "Protein", value: n(presented?.proteinG) * 4, color: "#7eafd9" },
                ]}
              />
            </section>
            <section className="ui-mp__card">
              <h3>Energy by meal</h3>
              <DonutChart
                size={132}
                slices={focusedDay.meals.map((meal, i) => ({
                  label: meal.name,
                  value: n(meal.presented.energyKcal),
                  color: MEAL_DONUT_COLORS[i % MEAL_DONUT_COLORS.length]!,
                }))}
              />
            </section>
            <section className="ui-mp__card">
              <h3>Protein by meal</h3>
              <DonutChart
                size={132}
                slices={focusedDay.meals.map((meal, i) => ({
                  label: meal.name,
                  value: n(meal.presented.proteinG),
                  color: MEAL_DONUT_COLORS[i % MEAL_DONUT_COLORS.length]!,
                }))}
              />
            </section>
            <section className="ui-mp__card">
              <h3>Fat types</h3>
              <DonutChart
                size={132}
                slices={[
                  { label: "Saturated", value: n(extras?.saturatedFatG), color: "#f59e0b" },
                  { label: "Mono", value: n(extras?.monounsaturatedFatG), color: "#14b8a6" },
                  { label: "Poly", value: n(extras?.polyunsaturatedFatG), color: "#3b82f6" },
                  { label: "Trans", value: n(extras?.transFatG), color: "#ef4444" },
                ]}
              />
            </section>
            <section className="ui-mp__card">
              <h3>Carbohydrate types</h3>
              <DonutChart
                size={132}
                slices={[
                  { label: "Sugars", value: n(presented?.sugarG), color: "#f59e0b" },
                  {
                    label: "Other carbs",
                    value: Math.max(0, n(presented?.carbohydrateG) - n(presented?.sugarG)),
                    color: "#14b8a6",
                  },
                ]}
              />
            </section>
          </div>

          <section className="ui-mp__card">
            <MealMacroDonuts meals={mealMacros} weightKg={weightKg} layout="wide" />
          </section>

          <section className="ui-mp__card">
            <div className="ui-mp__micro-head">
              <h3>Micronutrients</h3>
              <RdaProfilePicker value={rdaProfileId} onChange={selectRdaProfile} />
            </div>
            <p className="ui-muted ui-mp__source">Imported food data · {rdaProfile.basis}</p>
            <RdaBarList rows={microRda} />
          </section>

          <div className="ui-mp__glance-row">
            <section className="ui-mp__card ui-mp__card--compact">
              <h3>Water today</h3>
              <p className="ui-mp__glance-value">
                {tracking ? `${tracking.water.totalLiters.toFixed(2)} L` : "—"}
              </p>
              <p className="ui-muted">
                {tracking?.water.targetMl != null
                  ? `Target ${(tracking.water.targetMl / 1000).toFixed(1)} L`
                  : "From today’s tracking log"}
              </p>
            </section>
            <section className="ui-mp__card ui-mp__card--compact">
              <h3>Physical activity today</h3>
              <p className="ui-mp__glance-value">
                {tracking ? `${tracking.exercise.totalDurationMinutes} min` : "—"}
              </p>
              <p className="ui-muted">From today’s tracking log</p>
            </section>
          </div>

          <section className="ui-mp__card">
            <header className="ui-mp__table-head">
              <h3>Foods ordered by {foodsSort === "energy" ? "energy" : "name"}</h3>
              <Select value={foodsSort} onChange={(e) => setFoodsSort(e.target.value as "energy" | "name")}>
                <option value="energy">Energy</option>
                <option value="name">Name</option>
              </Select>
            </header>
            {foods.length === 0 ? (
              <EmptyState title="No foods on this day" />
            ) : (
              <>
                <Table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Energy (kcal)</th>
                      <th>Meal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {foodsSlice.map((row) => (
                      <tr key={row.id}>
                        <Td label="Name">
                          {row.name} ({row.quantity} {unitLabel(row.unit)})
                        </Td>
                        <Td label="Energy">{row.energy}</Td>
                        <Td label="Meal">{row.meal}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                {foodsPageCount > 1 ? (
                  <div className="ui-mp__pager">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={foodsPage === 0}
                      onClick={() => setFoodsPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <span className="ui-muted">
                      {foodsPage + 1} / {foodsPageCount}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={foodsPage >= foodsPageCount - 1}
                      onClick={() => setFoodsPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
      )}

      {!compact ? (
        <p className="ui-mp__back">
          <Link href={`/practice/${dietitianAccountId}/meal-plans`} className="ui-link">
            All meal plans
          </Link>
        </p>
      ) : null}
    </div>
    <Dialog open={settingsOpen} title="Plan settings" onClose={() => setSettingsOpen(false)}>
      <div className="ui-mp__settings">
        <div>
          <p className="ui-mp__settings-label">Day labels</p>
          <div className="ui-mp__choice">
            <button
              type="button"
              className={(plan.dayLabelMode ?? "NUMBERED") === "WEEKDAY" ? "is-active" : undefined}
              disabled={busy || !allowManage || plan.status === "ARCHIVED"}
              onClick={() => void setDayLabelMode("WEEKDAY")}
            >
              <strong>Weekdays</strong>
              <span>Monday – Sunday</span>
            </button>
            <button
              type="button"
              className={(plan.dayLabelMode ?? "NUMBERED") === "NUMBERED" ? "is-active" : undefined}
              disabled={busy || !allowManage || plan.status === "ARCHIVED"}
              onClick={() => void setDayLabelMode("NUMBERED")}
            >
              <strong>Numbered</strong>
              <span>Day 1 – Day 7</span>
            </button>
          </div>
        </div>
        <div>
          <p className="ui-mp__settings-label">Versions</p>
          <div className="ui-mp__version-list">
            {plan.versions.map((row) => (
              <div key={row.id} className={`ui-mp__version-row${row.id === version.id ? " is-active" : ""}`}>
                <button type="button" className="ui-mp__version-item" onClick={() => void load(row.id)}>
                  <span>Version {row.versionNumber}</span>
                  <span>{statusLabel(row.status)}</span>
                </button>
                {allowManage && plan.status !== "ARCHIVED" ? (
                  <button
                    type="button"
                    className="ui-mp__switcher-delete"
                    aria-label={`Delete version ${row.versionNumber}`}
                    disabled={busy}
                    onClick={() => void deleteVersion(row)}
                  >
                    <TrashIcon />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        {allowManage && plan.status !== "ARCHIVED" ? (
          <button
            type="button"
            className="ui-mp__danger"
            disabled={busy}
            onClick={() => void archivePlan()}
          >
            Delete plan…
          </button>
        ) : null}
      </div>
    </Dialog>
    </>
  );
}
