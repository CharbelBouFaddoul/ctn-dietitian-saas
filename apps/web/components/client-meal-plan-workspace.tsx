"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  ConfirmDialog,
  Dialog,
  DonutChart,
  EmptyState,
  Input,
  LoadingState,
  RdaBarList,
  Table,
  TargetBar,
  Td,
  Tooltip,
} from "@nutrition-saas/ui";
import { api } from "../lib/api";
import { MICRONUTRIENT_DEFS, type ExtraNutrients } from "../lib/micronutrients";
import { errorMessage } from "../lib/humanize-error";
import { groupDaysByWeek, weekOfDay } from "../lib/meal-plan-weeks";
import {
  analysisMicroLabel,
  DEFAULT_RDA_PROFILE_ID,
  isRdaProfileId,
  RDA_PROFILE_STORAGE_KEY,
  RDA_PROFILES,
  resolveDailyMacroTargets,
  type RdaProfile,
  type RdaProfileId,
} from "../lib/nutrition-targets";
import { statusLabel, unitLabel } from "../lib/practice-labels";
import { ClientMealNotesRail } from "./client-meal-notes-rail";
import { MealFoodPicker } from "./meal-food-picker";
import { MealItemNutritionDialog } from "./meal-item-nutrition-dialog";
import { MealMacroDonuts } from "./meal-macro-donuts";
import { MealPlanAnalysisPanel } from "./meal-plan-analysis-panel";

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
    category?: string | null;
    servingDescription?: string | null;
    referenceQuantity?: number;
    referenceUnit?: string;
    source?: { key?: string | null; name: string; datasetVersion?: string | null } | null;
  } | null;
  recipe: { id: string; name: string; servings?: number } | null;
  presented: Nutrition;
  presentedExtraNutrients?: ExtraNutrients;
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

const FOODS_PAGE_SIZE = 8;

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

const MASS_TO_G: Record<string, number> = { g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 };
const VOL_TO_ML: Record<string, number> = { ml: 1, l: 1000, fl_oz: 29.5735295625 };
const MASS_UNITS = ["g", "kg", "oz", "lb"] as const;
const VOLUME_UNITS = ["ml", "l", "fl_oz"] as const;

function trimQty(value: number) {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function itemGramsLabel(item: MealItem): string | null {
  if (item.unit === "serving") {
    const qty = item.food?.referenceQuantity;
    const unit = item.food?.referenceUnit;
    if (qty && unit) return `${trimQty(item.quantity * qty)} ${unit}`;
    return null;
  }
  if (MASS_TO_G[item.unit]) return `${trimQty(item.quantity * MASS_TO_G[item.unit]!)} g`;
  if (VOL_TO_ML[item.unit]) return `${trimQty(item.quantity * VOL_TO_ML[item.unit]!)} ml`;
  return null;
}

function itemLine(item: MealItem): string {
  const name = item.food?.servingDescription?.trim() || itemName(item);
  const amount = `${trimQty(item.quantity)} ${unitLabel(item.unit)}`;
  const grams = itemGramsLabel(item);
  if (grams && item.unit !== "g" && item.unit !== "ml") return `${amount} ${name} (${grams})`;
  if (grams && (item.unit === "g" || item.unit === "ml")) return `${amount} ${name}`;
  return `${amount} ${name}`;
}

function itemUnits(item: MealItem): string[] {
  const base =
    item.itemType === "RECIPE" || item.unit === "serving"
      ? ["serving"]
      : (VOLUME_UNITS as readonly string[]).includes(item.unit)
        ? [...VOLUME_UNITS]
        : [...MASS_UNITS];
  return base.includes(item.unit) ? base : [item.unit, ...base];
}

function DragHandleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="3.5" r="1.15" />
      <circle cx="11" cy="3.5" r="1.15" />
      <circle cx="5" cy="8" r="1.15" />
      <circle cx="11" cy="8" r="1.15" />
      <circle cx="5" cy="12.5" r="1.15" />
      <circle cx="11" cy="12.5" r="1.15" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M13.5 7.5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
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

function ImportIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 11l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

const MACRO_CHIP_COLORS = {
  energy: "#9b7bc4",
  fat: "#e8a82e",
  carb: "#e89a6a",
  protein: "#4f8fe0",
  fiber: "#1f9a82",
} as const;

const MACRO_DONUT_COLORS = {
  fat: "#e8a82e",
  carb: "#e89a6a",
  protein: "#4f8fe0",
} as const;

function MacroChip({
  tone,
  children,
}: {
  tone: keyof typeof MACRO_CHIP_COLORS;
  children: ReactNode;
}) {
  const color = MACRO_CHIP_COLORS[tone];
  return (
    <span className="ui-mp__macro-chip" style={{ color, background: `${color}1f` }}>
      {children}
    </span>
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

type ImportClient = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
};

function importClientName(client: ImportClient) {
  return client.displayName?.trim() || `${client.firstName} ${client.lastName}`.trim() || "Client";
}

function SearchGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.25" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16.2 16.2L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ImportAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return <span className="ui-mp__import-avatar">{initials || "?"}</span>;
}

function SearchableSelect({
  label,
  open,
  onOpenChange,
  value,
  search,
  onSearch,
  children,
}: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: ReactNode;
  search: string;
  onSearch: (value: string) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onOpenChange(false);
    }
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [open, onOpenChange]);

  return (
    <div className="ui-mp__ss" ref={ref}>
      <span className="ui-mp__ss-label">{label}</span>
      <button
        type="button"
        className={`ui-mp__ss-btn${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => onOpenChange(!open)}
      >
        <span className="ui-mp__ss-value">{value}</span>
        <span className="ui-mp__ss-caret" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open ? (
        <div className="ui-mp__ss-menu">
          <div className="ui-mp__ss-search">
            <input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              autoFocus
              aria-label={`Search ${label.toLowerCase()}`}
            />
            <SearchGlyph />
          </div>
          <div className="ui-mp__ss-list" role="listbox">
            {children}
          </div>
        </div>
      ) : null}
    </div>
  );
}

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
  hideViewToggle?: boolean;
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
  hideViewToggle = false,
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
  const [customMealName, setCustomMealName] = useState("");
  const [renameMealId, setRenameMealId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [unitDrafts, setUnitDrafts] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [foodsPage, setFoodsPage] = useState(0);
  const [foodsSort, setFoodsSort] = useState<{ key: "name" | "energy" | "meal"; dir: "asc" | "desc" }>({
    key: "energy",
    dir: "desc",
  });
  const [tracking, setTracking] = useState<TrackingGlance | null>(null);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [macroTargets, setMacroTargets] = useState(() => resolveDailyMacroTargets().targets);
  const [macroTargetsFromClient, setMacroTargetsFromClient] = useState(false);
  const [rdaProfileId, setRdaProfileId] = useState<RdaProfileId>(DEFAULT_RDA_PROFILE_ID);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [pendingDeleteVersion, setPendingDeleteVersion] = useState<{
    id: string;
    versionNumber: number;
    status: string;
  } | null>(null);
  const [inspectingItem, setInspectingItem] = useState<MealItem | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<{ mealId: string; itemId: string } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [addMealOpen, setAddMealOpen] = useState(false);
  const [mealMenuId, setMealMenuId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importTargetMealId, setImportTargetMealId] = useState<string | null>(null);
  const [importClients, setImportClients] = useState<ImportClient[]>([]);
  const [importClientId, setImportClientId] = useState("");
  const [importClientOpen, setImportClientOpen] = useState(false);
  const [importClientSearch, setImportClientSearch] = useState("");
  const [importPlans, setImportPlans] = useState<PlanOption[]>([]);
  const [importPlanId, setImportPlanId] = useState("");
  const [importPlanOpen, setImportPlanOpen] = useState(false);
  const [importPlanSearch, setImportPlanSearch] = useState("");
  const [importSourceVersion, setImportSourceVersion] = useState<VersionDetail | null>(null);
  const [importSourceDayId, setImportSourceDayId] = useState("");
  const [importDayOpen, setImportDayOpen] = useState(false);
  const [importDaySearch, setImportDaySearch] = useState("");
  const [importNotes, setImportNotes] = useState(true);
  const [importLoading, setImportLoading] = useState(false);
  const [pendingDeleteDay, setPendingDeleteDay] = useState<{ id: string; label: string } | null>(null);
  const [pendingDeleteWeek, setPendingDeleteWeek] = useState<{ week: number; count: number } | null>(null);
  const switcherRef = useRef<HTMLDivElement>(null);
  const versionRef = useRef<HTMLDivElement>(null);
  const pendingDraftRef = useRef<{ dayNumber: number } | null>(null);
  const skipItemClickRef = useRef(false);

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
    if (loaded.status !== "PUBLISHED") setNotice(null);
    const pending = pendingDraftRef.current;
    if (pending) {
      pendingDraftRef.current = null;
      const day =
        loaded.snapshot.days.find((row) => row.dayNumber === pending.dayNumber) ?? loaded.snapshot.days[0];
      if (day) {
        setActiveDayId(day.id);
        setActiveWeek(weekOfDay(day.dayNumber));
      }
      return;
    }
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
    return loaded;
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
    void api<{
      clinicalData?: {
        nutrition?: {
          targets?: {
            energyKcal?: number | null;
            fatG?: number | null;
            carbohydrateG?: number | null;
            proteinG?: number | null;
            fiberG?: number | null;
          };
        };
      };
    }>(`${clientBase}/profile`)
      .then((profile) => {
        const resolved = resolveDailyMacroTargets(profile.clinicalData?.nutrition?.targets);
        setMacroTargets(resolved.targets);
        setMacroTargetsFromClient(resolved.fromClient);
      })
      .catch(() => {
        const resolved = resolveDailyMacroTargets();
        setMacroTargets(resolved.targets);
        setMacroTargetsFromClient(false);
      });
  }, [dietitianAccountId, trackingClientId]);

  useEffect(() => {
    if (!switcherOpen && !versionOpen) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (switcherOpen && switcherRef.current && !switcherRef.current.contains(target)) {
        setSwitcherOpen(false);
      }
      if (versionOpen && versionRef.current && !versionRef.current.contains(target)) {
        setVersionOpen(false);
      }
    }
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [switcherOpen, versionOpen]);

  useEffect(() => {
    if (!mealMenuId) return;
    function onPointer(event: MouseEvent) {
      const node = event.target as HTMLElement | null;
      if (!node?.closest?.(`[data-meal-menu="${mealMenuId}"]`)) {
        setMealMenuId(null);
      }
    }
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [mealMenuId]);

  const canEdit = version?.status === "DRAFT" && !version.immutable;
  const canStartDraft = Boolean(allowManage && plan && plan.status !== "ARCHIVED" && !canEdit);
  const viewingPublished = version?.status === "PUBLISHED";
  const showNotify = Boolean(allowManage && plan && plan.status !== "ARCHIVED");
  const canNotify = Boolean(showNotify && viewingPublished);
  const notifyTip = canNotify
    ? "Send notification to patient"
    : version?.status === "SUPERSEDED"
      ? "Send notification from published version"
      : "Publish first to send notification";
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
    setNotice(null);
    try {
      await api(`${apiBase}/versions/${version.id}/publish`, { method: "POST" });
      await load(version.id);
      setNotice("Published. Notify the patient when you’re ready.");
    } catch (err) {
      setError(errorMessage(err, "Publish failed"));
    } finally {
      setBusy(false);
    }
  }

  async function notifyClient() {
    if (!canNotify) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api(`${apiBase}/notify`, { method: "POST" });
      setNotice("Patient notified about this published plan");
    } catch (err) {
      setError(errorMessage(err, "Could not notify the patient"));
    } finally {
      setBusy(false);
    }
  }

  async function newVersion() {
    const existingDraft = plan?.versions.find((row) => row.status === "DRAFT");
    if (existingDraft) {
      setVersionOpen(false);
      try {
        await load(existingDraft.id);
      } catch (err) {
        pendingDraftRef.current = null;
        setError(errorMessage(err, "Could not open draft"));
      }
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api<VersionDetail>(`${apiBase}/versions`, { method: "POST" });
      setVersionOpen(false);
      await load(created.id);
      if (!compact) {
        router.replace(`/practice/${dietitianAccountId}/meal-plans/${planId}?versionId=${created.id}`);
      }
    } catch (err) {
      pendingDraftRef.current = null;
      setError(errorMessage(err, "Could not create version"));
    } finally {
      setBusy(false);
    }
  }

  async function enterDraft() {
    if (!canStartDraft) return;
    if (focusedDay) {
      pendingDraftRef.current = { dayNumber: focusedDay.dayNumber };
    }
    await newVersion();
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

  async function createMealFromName(name: string) {
    if (!version || !focusedDay) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Meal name is required");
      return;
    }
    const keepPicker = Boolean(editingMealId);
    try {
      await api(`${apiBase}/versions/${version.id}/days/${focusedDay.id}/meals`, {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });
      setCustomMealName("");
      setAddMealOpen(false);
      const loaded = await load(version.id);
      if (keepPicker && loaded) {
        const day = loaded.snapshot.days.find((row) => row.id === focusedDay.id);
        const created = [...(day?.meals ?? [])].reverse().find((meal) => meal.name === trimmed);
        if (created) setEditingMealId(created.id);
      }
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
      setUnitDrafts((curr) => {
        const next = { ...curr };
        delete next[itemId];
        return next;
      });
      setEditingItemId(null);
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not update quantity"));
    }
  }

  async function reorderMealItems(mealId: string, itemIds: string[]) {
    if (!version) return;
    setVersion((curr) => {
      if (!curr) return curr;
      return {
        ...curr,
        snapshot: {
          ...curr.snapshot,
          days: curr.snapshot.days.map((day) => ({
            ...day,
            meals: day.meals.map((meal) => {
              if (meal.id !== mealId) return meal;
              const byId = new Map(meal.items.map((item) => [item.id, item]));
              return { ...meal, items: itemIds.map((id) => byId.get(id)).filter((row): row is MealItem => Boolean(row)) };
            }),
          })),
        },
      };
    });
    try {
      const loaded = await api<VersionDetail>(`${apiBase}/versions/${version.id}/meals/${mealId}/items/reorder`, {
        method: "PATCH",
        body: JSON.stringify({ itemIds }),
      });
      applyVersion(loaded);
    } catch (err) {
      setError(errorMessage(err, "Could not reorder foods"));
      await load(version.id);
    }
  }

  function moveItem(meal: Meal, fromId: string, toId: string) {
    if (fromId === toId) return;
    const ids = meal.items.map((item) => item.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, fromId);
    void reorderMealItems(meal.id, next);
  }

  async function addFood(mealId: string, input: { foodId: string; quantity: number; unit: string }) {
    if (!version) return;
    try {
      const loaded = await api<VersionDetail>(`${apiBase}/versions/${version.id}/meals/${mealId}/items`, {
        method: "POST",
        body: JSON.stringify({
          itemType: "FOOD",
          foodId: input.foodId,
          quantity: input.quantity,
          unit: input.unit,
        }),
      });
      applyVersion(loaded);
    } catch (err) {
      setError(errorMessage(err, "Could not add food"));
    }
  }

  async function addRecipe(mealId: string, recipeId: string, servings = 1) {
    if (!version) return;
    try {
      const loaded = await api<VersionDetail>(`${apiBase}/versions/${version.id}/meals/${mealId}/items`, {
        method: "POST",
        body: JSON.stringify({
          itemType: "RECIPE",
          recipeId,
          quantity: servings,
          unit: "serving",
        }),
      });
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

  async function confirmDeleteVersion() {
    const row = pendingDeleteVersion;
    if (!row) return;
    setBusy(true);
    try {
      const updated = await api<PlanDetail>(`${apiBase}/versions/${row.id}`, { method: "DELETE" });
      setPendingDeleteVersion(null);
      if (updated.status === "ARCHIVED") {
        setSettingsOpen(false);
        if (onArchived) onArchived();
        else router.push(`/practice/${dietitianAccountId}/meal-plans`);
        return;
      }
      setVersionOpen(false);
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

  async function deleteDay(dayId?: string) {
    if (!version) return;
    const target = dayId
      ? version.snapshot.days.find((day) => day.id === dayId)
      : focusedDay;
    if (!target) return;
    if (version.snapshot.days.length <= 1) {
      setError("Keep at least one day in this version");
      return;
    }
    try {
      await api(`${apiBase}/versions/${version.id}/days/${target.id}`, { method: "DELETE" });
      if (activeDayId === target.id) setActiveDayId("");
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not delete day"));
    }
  }

  async function deleteWeek(week: number) {
    if (!version) return;
    const group = weekGroups.find((row) => row.week === week);
    if (!group || group.days.length === 0) return;
    if (version.snapshot.days.length - group.days.length < 1) {
      setError("Keep at least one day in this version");
      return;
    }
    setBusy(true);
    try {
      for (const day of group.days) {
        await api(`${apiBase}/versions/${version.id}/days/${day.id}`, { method: "DELETE" });
      }
      if (group.days.some((day) => day.id === activeDayId)) setActiveDayId("");
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not delete week"));
    } finally {
      setBusy(false);
    }
  }

  function closeImport() {
    setImportOpen(false);
    setImportTargetMealId(null);
    setImportClientOpen(false);
    setImportPlanOpen(false);
    setImportDayOpen(false);
  }

  function openImport(mealId?: string) {
    setImportOpen(true);
    setImportTargetMealId(mealId ?? null);
    setImportNotes(true);
    setImportClientOpen(false);
    setImportPlanOpen(false);
    setImportDayOpen(false);
    setImportClientSearch("");
    setImportPlanSearch("");
    setImportDaySearch("");
    setMealMenuId(null);
    const sourceClient = trackingClientId ?? plan?.clientId ?? "";
    setImportClientId(sourceClient);
    void (async () => {
      try {
        const rows = await api<{ items: ImportClient[] }>(
          `/api/v1/dietitian/${dietitianAccountId}/clients?pageSize=50`,
        );
        setImportClients(rows.items);
      } catch {
        setImportClients([]);
      }
      await loadImportPlans(sourceClient, plan?.id, !mealId);
    })();
  }

  async function loadImportPlans(clientId: string, preferPlanId?: string, preferOtherDay = false) {
    if (!clientId) {
      setImportPlans([]);
      setImportPlanId("");
      setImportSourceVersion(null);
      setImportSourceDayId("");
      return;
    }
    setImportLoading(true);
    try {
      const listed = await api<{ items: PlanOption[] }>(
        `/api/v1/dietitian/${dietitianAccountId}/meal-plans?clientId=${encodeURIComponent(clientId)}&pageSize=50`,
      );
      const items = listed.items.filter((row) => row.status !== "ARCHIVED");
      setImportPlans(items);
      const chosen =
        (preferPlanId && items.find((row) => row.id === preferPlanId)) ??
        items.find((row) => row.status === "ACTIVE") ??
        items[0];
      setImportPlanId(chosen?.id ?? "");
      if (!chosen) {
        setImportSourceVersion(null);
        setImportSourceDayId("");
        return;
      }
      await loadImportPlan(chosen.id, preferOtherDay);
    } catch (err) {
      setImportPlans([]);
      setImportPlanId("");
      setImportSourceVersion(null);
      setImportSourceDayId("");
      setError(errorMessage(err, "Could not load meals to import"));
    } finally {
      setImportLoading(false);
    }
  }

  async function loadImportPlan(planId: string, preferOtherDay = false) {
    if (!planId) {
      setImportSourceVersion(null);
      setImportSourceDayId("");
      return;
    }
    setImportLoading(true);
    try {
      if (planId === plan?.id && version) {
        setImportSourceVersion(version);
        const otherDay = preferOtherDay
          ? version.snapshot.days.find((day) => day.id !== focusedDay?.id)
          : null;
        setImportSourceDayId(otherDay?.id ?? focusedDay?.id ?? version.snapshot.days[0]?.id ?? "");
        return;
      }
      const detail = await api<PlanDetail>(
        `/api/v1/dietitian/${dietitianAccountId}/meal-plans/${planId}`,
      );
      const versionId =
        detail.versions.find((row) => row.status === "PUBLISHED")?.id ??
        detail.versions.find((row) => row.status === "DRAFT")?.id ??
        detail.versions[0]?.id;
      if (!versionId) {
        setImportSourceVersion(null);
        setImportSourceDayId("");
        return;
      }
      const loaded = await api<VersionDetail>(
        `/api/v1/dietitian/${dietitianAccountId}/meal-plans/${planId}/versions/${versionId}`,
      );
      setImportSourceVersion(loaded);
      setImportSourceDayId(loaded.snapshot.days[0]?.id ?? "");
    } catch (err) {
      setImportSourceVersion(null);
      setImportSourceDayId("");
      setError(errorMessage(err, "Could not load meals to import"));
    } finally {
      setImportLoading(false);
    }
  }

  async function importChosenMeal(sourceMeal: Meal) {
    if (!version || !focusedDay) return;
    if (sourceMeal.items.length === 0 && !(importNotes && sourceMeal.notes)) {
      setError("That meal has no foods to import");
      return;
    }
    setBusy(true);
    try {
      let targetMealId = importTargetMealId;
      if (!targetMealId) {
        await api(`${apiBase}/versions/${version.id}/days/${focusedDay.id}/meals`, {
          method: "POST",
          body: JSON.stringify({
            name: sourceMeal.name,
            notes: importNotes && sourceMeal.notes ? sourceMeal.notes : undefined,
          }),
        });
        const loaded = await load(version.id);
        const day = loaded?.snapshot.days.find((row) => row.id === focusedDay.id);
        const created = [...(day?.meals ?? [])].reverse().find((meal) => meal.name === sourceMeal.name);
        targetMealId = created?.id ?? null;
        if (!targetMealId) throw new Error("Imported meal was not created");
      }
      for (const item of sourceMeal.items) {
        if (item.itemType === "FOOD" && item.food?.id) {
          await api(`${apiBase}/versions/${version.id}/meals/${targetMealId}/items`, {
            method: "POST",
            body: JSON.stringify({
              itemType: "FOOD",
              foodId: item.food.id,
              quantity: item.quantity,
              unit: item.unit,
            }),
          });
        } else if (item.itemType === "RECIPE" && item.recipe?.id) {
          await api(`${apiBase}/versions/${version.id}/meals/${targetMealId}/items`, {
            method: "POST",
            body: JSON.stringify({
              itemType: "RECIPE",
              recipeId: item.recipe.id,
              quantity: item.quantity,
              unit: item.unit || "serving",
            }),
          });
        }
      }
      if (importTargetMealId && importNotes && sourceMeal.notes) {
        await api(`${apiBase}/versions/${version.id}/meals/${importTargetMealId}`, {
          method: "PATCH",
          body: JSON.stringify({ notes: sourceMeal.notes }),
        });
      }
      closeImport();
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not import meal"));
    } finally {
      setBusy(false);
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
    const dir = foodsSort.dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (foodsSort.key === "energy") return (a.energy - b.energy) * dir;
      if (foodsSort.key === "meal") return a.meal.localeCompare(b.meal) * dir;
      return a.name.localeCompare(b.name) * dir;
    });
    return rows;
  }, [focusedDay, foodsSort]);

  const foodsPageCount = Math.max(1, Math.ceil(foods.length / FOODS_PAGE_SIZE));
  const foodsSlice = foods.slice(foodsPage * FOODS_PAGE_SIZE, foodsPage * FOODS_PAGE_SIZE + FOODS_PAGE_SIZE);

  function toggleFoodsSort(key: "name" | "energy" | "meal") {
    setFoodsSort((curr) =>
      curr.key === key
        ? { key, dir: curr.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "energy" ? "desc" : "asc" },
    );
  }

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
  const canDeleteDay = canEdit && version.snapshot.days.length > 1;
  const selectedImportClient = importClients.find((row) => row.id === importClientId) ?? null;
  const filteredImportClients = importClients.filter((row) =>
    importClientName(row).toLowerCase().includes(importClientSearch.trim().toLowerCase()),
  );
  const selectedImportPlan = importPlans.find((row) => row.id === importPlanId) ?? null;
  const filteredImportPlans = importPlans.filter((row) =>
    row.name.toLowerCase().includes(importPlanSearch.trim().toLowerCase()),
  );
  const importDays = importSourceVersion?.snapshot.days ?? [];
  const filteredImportDays = importDays.filter((day) => {
    const q = importDaySearch.trim().toLowerCase();
    if (!q) return true;
    return `${dayTabLabel(day)} ${dayFullLabel(day)}`.toLowerCase().includes(q);
  });
  const importDay = importDays.find((day) => day.id === importSourceDayId) ?? importDays[0] ?? null;
  const importMeals = (importDay?.meals ?? []).filter((meal) =>
    importTargetMealId ? meal.id !== importTargetMealId : true,
  );

  return (
    <>
    <div className={`ui-mp${compact ? " ui-mp--compact" : ""}${editingMealId ? " ui-mp--picking" : ""}`}>
      <header className="ui-mp__top">
        <div className="ui-mp__identity">
          {planOptions && planOptions.length > 0 && onSelectPlan ? (
            <div className="ui-mp__switcher" ref={switcherRef}>
              <button
                type="button"
                className="ui-mp__switcher-btn"
                aria-expanded={switcherOpen}
                aria-haspopup="listbox"
                onClick={() => {
                  setVersionOpen(false);
                  setSwitcherOpen((open) => !open);
                }}
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
          <div className="ui-mp__version-switcher" ref={versionRef}>
            <button
              type="button"
              className="ui-mp__version-switcher-btn"
              aria-expanded={versionOpen}
              aria-haspopup="listbox"
              aria-label="Plan versions"
              onClick={() => {
                setSwitcherOpen(false);
                setVersionOpen((open) => !open);
              }}
            >
              <span>
                Version {version.versionNumber} · {version.immutable ? "Published" : "Draft"}
              </span>
              <span className="ui-mp__switcher-caret" aria-hidden>
                ▾
              </span>
            </button>
            {versionOpen ? (
              <div className="ui-mp__switcher-menu ui-mp__version-menu" role="listbox" aria-label="Plan versions">
                {[...plan.versions]
                  .sort((a, b) => b.versionNumber - a.versionNumber)
                  .map((row) => (
                    <div
                      key={row.id}
                      className={`ui-mp__version-row${row.id === version.id ? " is-active" : ""}`}
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={row.id === version.id}
                        className="ui-mp__version-item"
                        onClick={() => {
                          setVersionOpen(false);
                          void load(row.id);
                        }}
                      >
                        <span>Version {row.versionNumber}</span>
                        <span>{statusLabel(row.status)}</span>
                      </button>
                      {allowManage && plan.status !== "ARCHIVED" ? (
                        <button
                          type="button"
                          className="ui-mp__switcher-delete"
                          aria-label={`Delete version ${row.versionNumber}`}
                          disabled={busy}
                          onClick={(event) => {
                            event.stopPropagation();
                            setVersionOpen(false);
                            setPendingDeleteVersion(row);
                          }}
                        >
                          <TrashIcon />
                        </button>
                      ) : null}
                    </div>
                  ))}
                {allowManage && plan.status !== "ARCHIVED" && !plan.versions.some((row) => row.status === "DRAFT") ? (
                  <button
                    type="button"
                    className="ui-mp__switcher-all"
                    disabled={busy}
                    onClick={() => void newVersion()}
                  >
                    New version
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
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
          {hideViewToggle ? null : (
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
          )}
          {showNotify ? (
            <Tooltip label={notifyTip}>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void notifyClient()}
                disabled={busy || !canNotify}
                aria-label={notifyTip}
              >
                Notify
              </Button>
            </Tooltip>
          ) : null}
          {canEdit ? (
            <Button size="sm" onClick={() => void publish()} disabled={busy}>
              Publish
            </Button>
          ) : canStartDraft ? (
            <Button size="sm" onClick={() => void enterDraft()} disabled={busy}>
              Edit
            </Button>
          ) : null}
        </div>
      </header>

      {error ? <Alert tone="danger">{error}</Alert> : notice ? <Alert tone="success">{notice}</Alert> : null}

      <div className="ui-mp__schedule">
        <div className="ui-mp__weeks" role="tablist" aria-label="Weeks">
          {weekGroups.map((group) => {
            const canDeleteThisWeek = canEdit && version.snapshot.days.length - group.days.length >= 1;
            return (
              <div
                key={group.week}
                className={`ui-mp__chip${group.week === currentWeek ? " is-active" : ""}`}
              >
                <button
                  type="button"
                  className="ui-mp__chip-label"
                  onClick={() => {
                    setActiveWeek(group.week);
                    const first = group.days[0];
                    if (first) setActiveDayId(first.id);
                  }}
                >
                  Week {group.week}
                </button>
                {canDeleteThisWeek ? (
                  <button
                    type="button"
                    className="ui-mp__chip-del"
                    aria-label={`Remove week ${group.week}`}
                    onClick={() => setPendingDeleteWeek({ week: group.week, count: group.days.length })}
                  >
                    <TrashIcon />
                  </button>
                ) : null}
              </div>
            );
          })}
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
            <div
              key={day.id}
              className={`ui-mp__chip${day.id === focusedDay?.id ? " is-active" : ""}`}
            >
              <button
                type="button"
                role="tab"
                className="ui-mp__chip-label"
                aria-selected={day.id === focusedDay?.id}
                onClick={() => {
                  setActiveDayId(day.id);
                  setActiveWeek(weekOfDay(day.dayNumber));
                  setEditingMealId(null);
                  setRenameMealId(null);
                }}
              >
                {dayTabLabel(day as PlanDay)}
              </button>
              {canDeleteDay ? (
                <button
                  type="button"
                  className="ui-mp__chip-del"
                  aria-label={`Remove ${dayTabLabel(day as PlanDay)}`}
                  onClick={() =>
                    setPendingDeleteDay({ id: day.id, label: dayFullLabel(day as PlanDay) })
                  }
                >
                  <TrashIcon />
                </button>
              ) : null}
            </div>
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
        <EmptyState
          title="No days yet"
          action={
            canEdit ? (
              <Button onClick={() => void addDay()}>Add first day</Button>
            ) : canStartDraft ? (
              <Button onClick={() => void enterDraft()} disabled={busy}>
                Edit
              </Button>
            ) : undefined
          }
        />
      ) : view === "plan" ? (
        <div className="ui-mp__plan">
          <div className="ui-mp__meals" aria-label={dayFullLabel(focusedDay)}>
            <div className="ui-mp__day-head">
              <p className="ui-muted">
                {n(presented?.energyKcal)} kcal · {focusedDay.meals.length} meal
                {focusedDay.meals.length === 1 ? "" : "s"}
              </p>
            </div>

            {canEdit ? (
              <div className="ui-mp__day-actions">
                <Button block variant="secondary" onClick={() => setAddMealOpen(true)}>
                  Add meal
                </Button>
                <Button block variant="ghost" onClick={() => openImport()}>
                  Import meal
                </Button>
              </div>
            ) : null}

            {focusedDay.meals.length === 0 ? (
              <EmptyState
                title="No meals yet"
                action={
                  canStartDraft ? (
                    <Button size="sm" onClick={() => void enterDraft()} disabled={busy}>
                      Edit
                    </Button>
                  ) : undefined
                }
              />
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
                        <button
                          type="button"
                          className="ui-mp__item-icon ui-mp__import-btn"
                          aria-label="Import foods into this meal"
                          onClick={() => openImport(meal.id)}
                        >
                          <ImportIcon />
                        </button>
                        <div className="ui-mp__meal-menu" data-meal-menu={meal.id}>
                          <button
                            type="button"
                            className="ui-mp__item-icon"
                            aria-label={`Meal actions for ${meal.name}`}
                            aria-expanded={mealMenuId === meal.id}
                            onClick={() => setMealMenuId(mealMenuId === meal.id ? null : meal.id)}
                          >
                            <MoreIcon />
                          </button>
                          {mealMenuId === meal.id ? (
                            <div className="ui-mp__meal-menu-pop" role="menu">
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setRenameMealId(meal.id);
                                  setRenameValue(meal.name);
                                  setMealMenuId(null);
                                }}
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="is-danger"
                                onClick={() => {
                                  setMealMenuId(null);
                                  void deleteMeal(meal.id);
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : canStartDraft ? (
                      <div className="ui-mp__meal-actions">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void enterDraft()}
                        >
                          Edit
                        </Button>
                      </div>
                    ) : null}
                  </header>

                  {meal.items.length > 0 ? (
                    <ul className="ui-mp__items">
                      {meal.items.map((item) => {
                        const draftQty = qtyDrafts[item.id] ?? String(item.quantity);
                        const draftUnit = unitDrafts[item.id] ?? item.unit;
                        const editing = editingItemId === item.id;
                        return (
                          <li
                            key={item.id}
                            className={`ui-mp__item${dragOverId === item.id ? " is-over" : ""}${dragItem?.itemId === item.id ? " is-dragging" : ""}`}
                            onDragOver={
                              canEdit
                                ? (event) => {
                                    event.preventDefault();
                                    setDragOverId(item.id);
                                  }
                                : undefined
                            }
                            onDrop={
                              canEdit
                                ? (event) => {
                                    event.preventDefault();
                                    skipItemClickRef.current = true;
                                    if (dragItem?.mealId === meal.id) moveItem(meal, dragItem.itemId, item.id);
                                    setDragItem(null);
                                    setDragOverId(null);
                                  }
                                : undefined
                            }
                            onDragLeave={() => {
                              if (dragOverId === item.id) setDragOverId(null);
                            }}
                          >
                            {canEdit ? (
                              <span
                                className="ui-mp__item-handle"
                                draggable
                                role="button"
                                tabIndex={0}
                                aria-label={`Reorder ${itemName(item)}`}
                                onDragStart={(event) => {
                                  event.dataTransfer.effectAllowed = "move";
                                  event.dataTransfer.setData("text/plain", item.id);
                                  setDragItem({ mealId: meal.id, itemId: item.id });
                                }}
                                onDragEnd={() => {
                                  setDragItem(null);
                                  setDragOverId(null);
                                }}
                              >
                                <DragHandleIcon />
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className="ui-mp__item-body"
                              onClick={() => {
                                if (skipItemClickRef.current) {
                                  skipItemClickRef.current = false;
                                  return;
                                }
                                setInspectingItem(item);
                              }}
                            >
                              {itemLine(item)}
                            </button>
                            {canEdit ? (
                              <div className="ui-mp__item-tools">
                                {editing ? (
                                  <div className="ui-mp__item-edit">
                                    <input
                                      className="ui-mp__item-qty"
                                      value={draftQty}
                                      inputMode="decimal"
                                      aria-label={`Amount for ${itemName(item)}`}
                                      onChange={(e) =>
                                        setQtyDrafts((curr) => ({ ...curr, [item.id]: e.target.value }))
                                      }
                                    />
                                    <select
                                      className="ui-mp__item-unit"
                                      value={draftUnit}
                                      aria-label={`Unit for ${itemName(item)}`}
                                      onChange={(event) =>
                                        setUnitDrafts((curr) => ({ ...curr, [item.id]: event.target.value }))
                                      }
                                    >
                                      {itemUnits(item).map((unit) => (
                                        <option key={unit} value={unit}>
                                          {unitLabel(unit) || unit}
                                        </option>
                                      ))}
                                    </select>
                                    <Button
                                      size="sm"
                                      className="ui-mp__item-save"
                                      variant={
                                        draftQty !== String(item.quantity) || draftUnit !== item.unit
                                          ? "primary"
                                          : "secondary"
                                      }
                                      onClick={() => {
                                        if (draftQty !== String(item.quantity) || draftUnit !== item.unit) {
                                          void updateItemQuantity(item.id, Number(draftQty), draftUnit);
                                        } else {
                                          setEditingItemId(null);
                                        }
                                      }}
                                    >
                                      {draftQty !== String(item.quantity) || draftUnit !== item.unit
                                        ? "Save"
                                        : "Done"}
                                    </Button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className="ui-mp__item-icon"
                                    aria-label={`Edit ${itemName(item)}`}
                                    onClick={() => {
                                      setQtyDrafts((curr) => ({ ...curr, [item.id]: String(item.quantity) }));
                                      setUnitDrafts((curr) => ({ ...curr, [item.id]: item.unit }));
                                      setEditingItemId(item.id);
                                    }}
                                  >
                                    <EditIcon />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="ui-mp__item-icon ui-mp__item-icon--danger"
                                  aria-label={`Remove ${itemName(item)}`}
                                  onClick={() => void removeItem(item.id)}
                                >
                                  <TrashIcon />
                                </button>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="ui-muted ui-mp__empty-line">No items yet.</p>
                  )}

                  {canEdit ? (
                    <button
                      type="button"
                      className="ui-mp__add-food"
                      onClick={() => setEditingMealId(editingMealId === meal.id ? null : meal.id)}
                    >
                      {editingMealId === meal.id ? "Done" : "Add new food +"}
                    </button>
                  ) : null}

                  {canEdit && editingMealId === meal.id ? (
                    <MealFoodPicker
                      dietitianAccountId={dietitianAccountId}
                      onAddFood={(input) => addFood(meal.id, input)}
                      onAddRecipe={(input) => addRecipe(meal.id, input.recipeId, input.servings)}
                      onClose={() => setEditingMealId(null)}
                      onError={setError}
                    />
                  ) : null}

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
                    <MacroChip tone="energy">Energy {n(meal.presented.energyKcal)} kcal</MacroChip>
                    <MacroChip tone="fat">Fat {n(meal.presented.fatG)} g</MacroChip>
                    <MacroChip tone="carb">Carb {n(meal.presented.carbohydrateG)} g</MacroChip>
                    <MacroChip tone="protein">Protein {n(meal.presented.proteinG)} g</MacroChip>
                    <MacroChip tone="fiber">Fiber {n(meal.presented.fiberG)} g</MacroChip>
                  </footer>
                </article>
              ))
            )}
          </div>

          <aside className="ui-mp__rail" aria-label="Global analysis">
            <section className="ui-mp__rail-card">
              <h3>Global analysis</h3>
              <p className="ui-muted ui-mp__source">
                {macroTargetsFromClient
                  ? "Compared to this client’s daily targets"
                  : "Using default targets — set daily targets in Prescription"}
              </p>
              <div className="ui-mp__rail-bars">
                <TargetBar
                  layout="row"
                  label="Energy"
                  actual={presented?.energyKcal}
                  target={macroTargets.energyKcal}
                  unit="kcal"
                  tone="energy"
                />
                <TargetBar
                  layout="row"
                  label="Fat"
                  actual={presented?.fatG}
                  target={macroTargets.fatG}
                  unit="g"
                  tone="fat"
                />
                <TargetBar
                  layout="row"
                  label="Carbohydrate"
                  actual={presented?.carbohydrateG}
                  target={macroTargets.carbohydrateG}
                  unit="g"
                  tone="carb"
                />
                <TargetBar
                  layout="row"
                  label="Protein"
                  actual={presented?.proteinG}
                  target={macroTargets.proteinG}
                  unit="g"
                  tone="protein"
                />
                <TargetBar
                  layout="row"
                  label="Fiber"
                  actual={presented?.fiberG}
                  target={macroTargets.fiberG}
                  unit="g"
                  tone="fiber"
                />
              </div>
              <DonutChart
                caption="Macronutrients"
                size={132}
                thickness={28}
                showPct={false}
                valueUnit="kcal"
                slices={[
                  { label: "Fat", value: n(presented?.fatG) * 9, color: MACRO_DONUT_COLORS.fat },
                  { label: "Carbs", value: n(presented?.carbohydrateG) * 4, color: MACRO_DONUT_COLORS.carb },
                  { label: "Protein", value: n(presented?.proteinG) * 4, color: MACRO_DONUT_COLORS.protein },
                ]}
              />
            </section>
            <section className="ui-mp__rail-card">
              <MealMacroDonuts meals={mealMacros} weightKg={weightKg} />
            </section>
            {trackingClientId ? (
              <section className="ui-mp__rail-card">
                <ClientMealNotesRail
                  dietitianAccountId={dietitianAccountId}
                  clientId={trackingClientId}
                  allowManage={allowManage}
                  onError={(message) => setError(message)}
                />
              </section>
            ) : null}
            <section className="ui-mp__rail-card">
              <div className="ui-mp__micro-head">
                <h3>Micronutrients</h3>
                <RdaProfilePicker value={rdaProfileId} onChange={selectRdaProfile} />
              </div>
              <p className="ui-muted ui-mp__source">From imported food data · {rdaProfile.basis}</p>
              <RdaBarList rows={microRda} compact />
            </section>
          </aside>
        </div>
      ) : (
        <div className="ui-mp__analysis">
          <MealPlanAnalysisPanel
            dayLabel={dayFullLabel(focusedDay)}
            presented={presented}
            extras={extras}
            meals={focusedDay.meals}
            macroTargets={macroTargets}
            macroTargetsFromClient={macroTargetsFromClient}
          />

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
              <h3>Foods ordered by {foodsSort.key === "energy" ? "energy" : foodsSort.key}</h3>
            </header>
            {foods.length === 0 ? (
              <EmptyState title="No foods on this day" />
            ) : (
              <>
                <Table>
                  <thead className="ui-mp__foods-head">
                    <tr>
                      {(
                        [
                          { key: "name", label: "Name" },
                          { key: "energy", label: "Energy (kcal)" },
                          { key: "meal", label: "Meal" },
                        ] as const
                      ).map((col) => {
                        const active = foodsSort.key === col.key;
                        return (
                          <th key={col.key} scope="col">
                            <button
                              type="button"
                              className={`ui-mp__sort-btn${active ? " is-active" : ""}`}
                              aria-sort={active ? (foodsSort.dir === "asc" ? "ascending" : "descending") : "none"}
                              onClick={() => toggleFoodsSort(col.key)}
                            >
                              <span>{col.label}</span>
                              <span className="ui-mp__sort-icon" aria-hidden="true">
                                {active ? (foodsSort.dir === "asc" ? "↑" : "↓") : "↕"}
                              </span>
                            </button>
                          </th>
                        );
                      })}
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
    <MealItemNutritionDialog
      item={
        inspectingItem
          ? {
              name: itemName(inspectingItem),
              quantity: inspectingItem.quantity,
              unit: inspectingItem.unit,
              servingDescription: inspectingItem.food?.servingDescription,
              amountCaption:
                itemGramsLabel(inspectingItem) ??
                `${trimQty(inspectingItem.quantity)} ${unitLabel(inspectingItem.unit)}`,
              presented: inspectingItem.presented,
              presentedExtraNutrients: inspectingItem.presentedExtraNutrients,
              origin: inspectingItem.food?.origin,
              source: inspectingItem.food?.source ?? (inspectingItem.recipe ? { name: "Recipe" } : null),
            }
          : null
      }
      onClose={() => setInspectingItem(null)}
    />
    <ConfirmDialog
      open={pendingDeleteVersion !== null}
      title={
        (plan.versions.length ?? 0) <= 1
          ? "Delete this meal plan?"
          : `Delete version ${pendingDeleteVersion?.versionNumber}?`
      }
      description={
        (plan.versions.length ?? 0) <= 1
          ? `This is the only version. Deleting it will archive “${plan.name}”.`
          : `This ${statusLabel(pendingDeleteVersion?.status ?? "").toLowerCase()} version will be removed. This cannot be undone.`
      }
      confirmLabel={(plan.versions.length ?? 0) <= 1 ? "Delete plan" : "Delete version"}
      danger
      pending={busy}
      onCancel={() => {
        if (busy) return;
        setPendingDeleteVersion(null);
      }}
      onConfirm={() => void confirmDeleteVersion()}
    />
    <ConfirmDialog
      open={pendingDeleteDay !== null}
      title={`Remove ${pendingDeleteDay?.label}?`}
      description="This day and its meals will be deleted from this version."
      confirmLabel="Remove day"
      danger
      pending={busy}
      onCancel={() => {
        if (busy) return;
        setPendingDeleteDay(null);
      }}
      onConfirm={() => {
        const id = pendingDeleteDay?.id;
        setPendingDeleteDay(null);
        if (id) void deleteDay(id);
      }}
    />
    <ConfirmDialog
      open={pendingDeleteWeek !== null}
      title={`Remove week ${pendingDeleteWeek?.week}?`}
      description={`This will delete ${pendingDeleteWeek?.count ?? 0} day${
        pendingDeleteWeek?.count === 1 ? "" : "s"
      } in that week.`}
      confirmLabel="Remove week"
      danger
      pending={busy}
      onCancel={() => {
        if (busy) return;
        setPendingDeleteWeek(null);
      }}
      onConfirm={() => {
        const week = pendingDeleteWeek?.week;
        setPendingDeleteWeek(null);
        if (week != null) void deleteWeek(week);
      }}
    />
    <Dialog open={addMealOpen} title="Add meal" onClose={() => setAddMealOpen(false)}>
      <div className="ui-mp__preset-list" role="list">
        {MEAL_NAME_PRESETS.map((name) => (
          <button
            key={name}
            type="button"
            disabled={busy}
            onClick={() => void createMealFromName(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <form
        className="ui-mp__custom-meal"
        onSubmit={(event) => {
          event.preventDefault();
          void createMealFromName(customMealName);
        }}
      >
        <Input
          value={customMealName}
          onChange={(e) => setCustomMealName(e.target.value)}
          placeholder="Custom meal name…"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={busy || !customMealName.trim()}>
          Add custom
        </Button>
      </form>
    </Dialog>
    <Dialog
      open={importOpen}
      title={importTargetMealId ? "Import foods into meal" : "Import meal"}
      className="ui-mp__import-dialog"
      onClose={() => {
        if (busy) return;
        closeImport();
      }}
    >
      <div className="ui-mp__import">
        <SearchableSelect
          label="Select client"
          open={importClientOpen}
          onOpenChange={(next) => {
            setImportPlanOpen(false);
            setImportDayOpen(false);
            setImportClientOpen(next);
            if (next) setImportClientSearch("");
          }}
          value={
            selectedImportClient ? (
              <>
                <ImportAvatar name={importClientName(selectedImportClient)} />
                {importClientName(selectedImportClient)}
              </>
            ) : (
              <span className="ui-muted">Select a client</span>
            )
          }
          search={importClientSearch}
          onSearch={setImportClientSearch}
        >
          {filteredImportClients.length === 0 ? (
            <p className="ui-muted ui-mp__ss-empty">No clients match.</p>
          ) : (
            filteredImportClients.map((row) => {
              const name = importClientName(row);
              return (
                <button
                  key={row.id}
                  type="button"
                  role="option"
                  className={row.id === importClientId ? "is-active" : undefined}
                  aria-selected={row.id === importClientId}
                  onClick={() => {
                    setImportClientId(row.id);
                    setImportClientOpen(false);
                    void loadImportPlans(row.id);
                  }}
                >
                  <ImportAvatar name={name} />
                  {name}
                </button>
              );
            })
          )}
        </SearchableSelect>

        <SearchableSelect
          label="Select meal plan"
          open={importPlanOpen}
          onOpenChange={(next) => {
            setImportClientOpen(false);
            setImportDayOpen(false);
            setImportPlanOpen(next);
            if (next) setImportPlanSearch("");
          }}
          value={
            selectedImportPlan ? (
              `${selectedImportPlan.name} · ${planStatusCaption(selectedImportPlan.status)}`
            ) : (
              <span className="ui-muted">Select a meal plan</span>
            )
          }
          search={importPlanSearch}
          onSearch={setImportPlanSearch}
        >
          {filteredImportPlans.length === 0 ? (
            <p className="ui-muted ui-mp__ss-empty">No meal plans match.</p>
          ) : (
            filteredImportPlans.map((row) => (
              <button
                key={row.id}
                type="button"
                role="option"
                className={row.id === importPlanId ? "is-active" : undefined}
                aria-selected={row.id === importPlanId}
                onClick={() => {
                  setImportPlanId(row.id);
                  setImportPlanOpen(false);
                  void loadImportPlan(row.id);
                }}
              >
                <span>{row.name}</span>
                <span className="ui-muted">{planStatusCaption(row.status)}</span>
              </button>
            ))
          )}
        </SearchableSelect>

        <SearchableSelect
          label="Select day"
          open={importDayOpen}
          onOpenChange={(next) => {
            setImportClientOpen(false);
            setImportPlanOpen(false);
            setImportDayOpen(next);
            if (next) setImportDaySearch("");
          }}
          value={importDay ? dayFullLabel(importDay) : <span className="ui-muted">Select a day</span>}
          search={importDaySearch}
          onSearch={setImportDaySearch}
        >
          {filteredImportDays.length === 0 ? (
            <p className="ui-muted ui-mp__ss-empty">No days match.</p>
          ) : (
            filteredImportDays.map((day) => (
              <button
                key={day.id}
                type="button"
                role="option"
                className={day.id === importDay?.id ? "is-active" : undefined}
                aria-selected={day.id === importDay?.id}
                onClick={() => {
                  setImportSourceDayId(day.id);
                  setImportDayOpen(false);
                }}
              >
                {dayFullLabel(day)}
              </button>
            ))
          )}
        </SearchableSelect>

        <div className="ui-mp__import-meals">
          <p className="ui-mp__import-heading">
            {importTargetMealId ? "Choose a meal to copy foods from" : "Choose a meal to add to this day"}
          </p>
          {importLoading ? (
            <LoadingState>Loading meals…</LoadingState>
          ) : importMeals.length === 0 ? (
            <p className="ui-muted">No meals to import from this day.</p>
          ) : (
            <ul>
              {importMeals.map((meal) => (
                <li key={meal.id}>
                  <button
                    type="button"
                    className="ui-mp__import-meal"
                    disabled={busy}
                    onClick={() => void importChosenMeal(meal)}
                  >
                    <span className="ui-mp__import-meal-name">{meal.name}</span>
                    <span className="ui-mp__import-macros">
                      <span>
                        <strong>{Math.round(n(meal.presented.energyKcal))} kcal</strong>
                        <em>Energy</em>
                      </span>
                      <span>
                        <strong>{Math.round(n(meal.presented.fatG))} g</strong>
                        <em>Fat</em>
                      </span>
                      <span>
                        <strong>{Math.round(n(meal.presented.carbohydrateG))} g</strong>
                        <em>Carbohydrate</em>
                      </span>
                      <span>
                        <strong>{Math.round(n(meal.presented.proteinG))} g</strong>
                        <em>Protein</em>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          role="checkbox"
          aria-checked={importNotes}
          className={`ui-mp__import-notes${importNotes ? " is-on" : ""}`}
          onClick={() => setImportNotes((value) => !value)}
        >
          <span className="ui-mp__import-notes-box" aria-hidden>
            {importNotes ? "✓" : ""}
          </span>
          Import Notes
        </button>
      </div>
    </Dialog>
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
