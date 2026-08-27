"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Section,
  Skeleton,
  StatusBadge,
  Tabs,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { JoinCodePanel } from "../../../../../components/join-code-panel";
import { ClientAppointmentsPanel } from "../../../../../components/client-appointments-panel";
import { ClientAssessmentsPanel } from "../../../../../components/client-assessments-panel";
import { ClientClinicalProfilePanel } from "../../../../../components/client-clinical-profile-panel";
import { ClientEvolutionPanel } from "../../../../../components/client-evolution-panel";
import { ClientTrackingPanel } from "../../../../../components/client-tracking-panel";
import { ClientNutritionPanel } from "../../../../../components/client-nutrition-panel";
import { ClientPrescriptionPanel } from "../../../../../components/client-prescription-panel";
import type { MealPlanView } from "../../../../../components/client-meal-plan-workspace";
import { api } from "../../../../../lib/api";
import { ageInYears, formatDate, formatFullDate } from "../../../../../lib/format";
import { errorMessage } from "../../../../../lib/humanize-error";
import { canManageClients } from "../../../../../lib/practice-access";
import { portalStatusLabel, statusLabel } from "../../../../../lib/practice-labels";
import { careActivityLabel } from "../../../../../lib/timeline-care";
import { usePractice } from "../../practice-shell";

type Tab =
  | "overview"
  | "measurement"
  | "clinical"
  | "assessments"
  | "prescription"
  | "meal-plan"
  | "tracking"
  | "appointments"
  | "settings";

type ChartSection = {
  id: string;
  label: string;
  icon: ReactNode;
  tabs: Array<{ id: Tab; label: string }>;
};

function ChartTabIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const TIMELINE_PAGE_SIZE = 25;

const LEGACY_TABS: Record<string, Tab> = {
  personal: "clinical",
  goals: "clinical",
  documents: "clinical",
  evolution: "measurement",
  timeline: "tracking",
  portal: "settings",
  "meal-plans": "meal-plan",
};

const chartSections: ChartSection[] = [
  {
    id: "overview",
    label: "Overview",
    icon: (
      <ChartTabIcon>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </ChartTabIcon>
    ),
    tabs: [{ id: "overview", label: "Summary" }],
  },
  {
    id: "personal",
    label: "Personal data",
    icon: (
      <ChartTabIcon>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5.2 19c.9-3.3 3.5-5 6.8-5s5.9 1.7 6.8 5" />
      </ChartTabIcon>
    ),
    tabs: [
      { id: "clinical", label: "Clinical profile" },
      { id: "assessments", label: "Custom forms" },
    ],
  },
  {
    id: "progress",
    label: "Progress & tracking",
    icon: (
      <ChartTabIcon>
        <path d="M4 15V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
        <path d="M8 7v3M12 7v4.5M16 7v3" />
      </ChartTabIcon>
    ),
    tabs: [
      { id: "measurement", label: "Measurement" },
      { id: "tracking", label: "Tracking" },
    ],
  },
  {
    id: "prescription",
    label: "Prescription",
    icon: (
      <ChartTabIcon>
        <path d="M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1z" />
        <path d="M6 5h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
        <path d="M12 10v6M9 13h6" />
      </ChartTabIcon>
    ),
    tabs: [{ id: "prescription", label: "Prescription" }],
  },
  {
    id: "nutrition",
    label: "Nutrition",
    icon: (
      <ChartTabIcon>
        <path d="M5 3v6M8 3v6M11 3v6" />
        <path d="M5 9h6M8 9v12" />
        <path d="M16 3v18" />
        <path d="M16 3c3.2 1.6 4.2 5.2 4.2 8.5H16" />
      </ChartTabIcon>
    ),
    tabs: [{ id: "meal-plan", label: "Nutrition" }],
  },
  {
    id: "care",
    label: "Appointments",
    icon: (
      <ChartTabIcon>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 11h18" />
      </ChartTabIcon>
    ),
    tabs: [{ id: "appointments", label: "Appointments" }],
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <ChartTabIcon>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.36.3.59.75.59 1.24V11a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </ChartTabIcon>
    ),
    tabs: [{ id: "settings", label: "Settings" }],
  },
];

function isTab(value: string | null, sections: ChartSection[]): value is Tab {
  return sections.some((section) => section.tabs.some((item) => item.id === value));
}

function resolveTab(value: string | null, sections: ChartSection[]): Tab {
  const mapped = value && LEGACY_TABS[value] ? LEGACY_TABS[value] : value;
  if (isTab(mapped, sections)) return mapped;
  return "overview";
}

function sectionForTab(tab: Tab, sections: ChartSection[]): ChartSection {
  return sections.find((section) => section.tabs.some((item) => item.id === tab)) ?? sections[0]!;
}

type Portfolio = {
  client: {
    id: string;
    firstName: string;
    lastName: string;
    displayName: string | null;
    email: string | null;
    phone: string | null;
    dateOfBirth: string | null;
    sex: string | null;
    status: string;
    createdAt?: string | null;
    connectionStatus?: string | null;
    portalStatus?: string | null;
    tags: Array<{ id: string; name: string; color?: string | null }>;
  };
  profile: {
    nutritionContext: string | null;
    preferences: string | null;
    dietaryPreferences: string | null;
    allergies: string | null;
    intolerances: string | null;
    lifestyle: string | null;
    notes: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
  } | null;
  latestMeasurements: Array<{
    id: string;
    type: string;
    value: number;
    unit: string;
    measuredAt: string;
  }>;
  previousWeight: { value: number; unit: string; measuredAt: string } | null;
  bmi: number | null;
  evolutionSummary: {
    weightDelta: number | null;
    weightUnit: string | null;
    bmiBaseline: number | null;
    bmiCurrent: number | null;
    pointCount: number;
  } | null;
  primaryGoal: {
    id: string;
    title: string;
    status: string;
    targetValue: number | null;
    targetUnit: string | null;
  } | null;
  activeGoalsCount: number;
  latestAssessment: {
    id: string;
    status: string;
    templateName: string;
    templateId: string;
    templateVersion: number;
    createdAt: string;
    completedAt: string | null;
  } | null;
  activeMealPlan: {
    id: string;
    name: string;
    status: string;
    publishedVersion: { id: string; versionNumber: number; publishedAt: string | null } | null;
  } | null;
  upcomingAppointment: {
    id: string;
    title: string;
    startAt: string;
    endAt: string;
    status: string;
  } | null;
  recentMessages: {
    preview: Array<{ id: string; body: string; createdAt: string; senderUserId: string }>;
    unreadCount: number;
  };
  recentTimeline: Array<{
    id: string;
    type: string;
    occurredAt: string;
    targetType: string | null;
    targetId: string | null;
    metadata: unknown;
  }>;
  missing: {
    goals: boolean;
    assessments: boolean;
    measurements: boolean;
    restrictions: boolean;
    activeMealPlan: boolean;
    upcomingAppointment: boolean;
  };
  alerts: Array<{ kind: string; label: string }>;
  quickLinks: Array<{ tab: string; label: string }>;
};

function measurementOf(portfolio: Portfolio, type: string) {
  return portfolio.latestMeasurements.find((row) => row.type === type) ?? null;
}

type TimelineRow = {
  id: string;
  type: string;
  occurredAt: string;
  targetType: string | null;
  targetId: string | null;
};

export default function ClientWorkspaceRoute() {
  return (
    <Suspense fallback={<ClientWorkspaceSkeleton />}>
      <ClientWorkspacePage />
    </Suspense>
  );
}

function ClientWorkspaceSkeleton() {
  return (
    <section className="ui-client-chart">
      <header className="ui-page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Skeleton style={{ width: 48, height: 48, borderRadius: "50%" }} />
          <div>
            <Skeleton style={{ width: 200, height: 28, marginBottom: 8 }} />
            <Skeleton style={{ width: 140, height: 18 }} />
          </div>
        </div>
      </header>
      <Skeleton style={{ width: "100%", height: 44, margin: "16px 0" }} />
      <Skeleton style={{ width: "100%", height: 200, borderRadius: 12 }} />
    </section>
  );
}

function ClientWorkspacePage() {
  const params = useParams<{ dietitianAccountId: string; clientId: string }>();
  const { dietitianAccountId, clientId } = params;
  const searchParams = useSearchParams();
  const router = useRouter();
  const practice = usePractice();
  const allowManage = canManageClients(practice.role);
  const visibleSections = chartSections;
  const base = `/api/v1/dietitian/${dietitianAccountId}/clients/${clientId}`;
  const orgBase = `/api/v1/dietitian/${dietitianAccountId}`;
  const tabFromQuery = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(() => resolveTab(tabFromQuery, chartSections));

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreatedTip, setShowCreatedTip] = useState(() => searchParams.get("created") === "1");

  const [orgTags, setOrgTags] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const [trackingSummary, setTrackingSummary] = useState<{
    date: string;
    food: {
      presented: {
        energyKcal: number | null;
        proteinG: number | null;
        carbohydrateG: number | null;
        fatG: number | null;
        fiberG: number | null;
      };
      byMeal: Array<{
        category: string;
        items: Array<{
          id: string;
          foodName: string;
          quantity: number;
          unit: string;
          presented: { energyKcal: number | null };
        }>;
        presented: { energyKcal: number | null };
      }>;
    };
    water: {
      totalLiters: number;
      totalMl: number;
      targetMl: number | null;
      entries: Array<{ id: string; amountMl: number }>;
    };
    exercise: {
      totalDurationMinutes: number;
      entries: Array<{
        id: string;
        activityType: string;
        durationMinutes: number;
        intensity: string | null;
      }>;
    };
    sleep: { durationMinutes: number | null; quality: number | null } | null;
    sleepWeek: { averageDurationMinutes: number | null; nightsLogged: number };
    habits: {
      completed: number;
      total: number;
      items: Array<{ habitKey: string; habitLabel: string; completed: boolean }>;
    };
    plannedMeals?: { logged: number; total: number };
  } | null>(null);
  const [trackingDate, setTrackingDate] = useState("");
  const [habitCatalog, setHabitCatalog] = useState<
    Array<{ id: string; name: string; scope: string; defaultTargetValue: number | null; defaultTargetUnit: string | null }>
  >([]);
  const [clientHabits, setClientHabits] = useState<
    Array<{ habitDefinitionId: string; name: string; targetValue: number | null; targetUnit: string | null }>
  >([]);
  const [assignHabitId, setAssignHabitId] = useState("");

  function shiftTrackingDate(days: number) {
    if (!trackingDate) return;
    const parts = trackingDate.split("-").map(Number);
    const next = new Date(Date.UTC(parts[0] ?? 0, (parts[1] ?? 1) - 1, (parts[2] ?? 1) + days));
    setTrackingDate(next.toISOString().slice(0, 10));
  }

  const [billingSnapshot, setBillingSnapshot] = useState<{
    unpaid: number;
    latestLabel: string | null;
  } | null>(null);

  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [timelinePages, setTimelinePages] = useState<TimelineRow[][]>([]);
  const [timelinePageIndex, setTimelinePageIndex] = useState(0);
  const [timelineHasOlder, setTimelineHasOlder] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const [portalAccount, setPortalAccount] = useState<{
    connectionStatus: string;
    joinCode: { expiresAt: string; hint: string | null } | null;
    disconnectRequestedAt?: string | null;
    disconnectRequestNote?: string | null;
  } | null>(null);
  const [plainJoinCode, setPlainJoinCode] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  function selectTab(next: string, extras?: { metric?: string; planId?: string; view?: MealPlanView }) {
    if (next === "messages") {
      router.push(`/practice/${dietitianAccountId}/messages?clientId=${clientId}`);
      return;
    }
    const value = resolveTab(next, visibleSections);
    setTab(value);
    const params = new URLSearchParams();
    params.set("tab", value);
    if (value === "measurement" && extras?.metric) {
      params.set("metric", extras.metric);
    }
    if (value === "meal-plan") {
      const planId = extras?.planId ?? searchParams.get("planId");
      const view = extras?.view ?? searchParams.get("view");
      if (planId) params.set("planId", planId);
      if (view === "plan" || view === "analysis") params.set("view", view);
    }
    router.replace(`/practice/${dietitianAccountId}/clients/${clientId}?${params.toString()}`, { scroll: false });
  }

  function setMealPlanQuery(next: { planId?: string; view?: MealPlanView }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "meal-plan");
    if (next.planId) params.set("planId", next.planId);
    if (next.view) params.set("view", next.view);
    router.replace(`/practice/${dietitianAccountId}/clients/${clientId}?${params.toString()}`, { scroll: false });
  }

  function openMeasurement(metric: "WEIGHT" | "HEIGHT" | "BMI") {
    selectTab("measurement", { metric });
  }

  function selectSection(sectionId: string) {
    const section = visibleSections.find((item) => item.id === sectionId) ?? visibleSections[0]!;
    const current = sectionForTab(tab, visibleSections);
    if (current.id === section.id) return;
    const firstTab = section.tabs[0];
    if (firstTab) selectTab(firstTab.id);
  }

  const activeSection = sectionForTab(tab, visibleSections);

  function applyPortfolio(data: Portfolio) {
    setPortfolio(data);
    setSelectedTagIds(data.client.tags.map((tag) => tag.id));
  }

  async function loadPortfolio() {
    const data = await api<Portfolio>(`${base}/portfolio`);
    applyPortfolio(data);
    return data;
  }

  async function load() {
    setError(null);
    try {
      const [portfolioData, account, tagRows] = await Promise.all([
        api<Portfolio>(`${base}/portfolio`),
        api<NonNullable<typeof portalAccount>>(`${base}/account`),
        api<Array<{ id: string; name: string }>>(`${orgBase}/tags`),
      ]);
      applyPortfolio(portfolioData);
      setPortalAccount(account);
      setOrgTags(tagRows);
    } catch (err) {
      setError(errorMessage(err, "Unable to load client"));
    }
  }

  async function loadTimelinePage(before?: string, replace = true, date?: string) {
    setTimelineLoading(true);
    try {
      const query = new URLSearchParams({ limit: String(TIMELINE_PAGE_SIZE), scope: "care" });
      if (before) query.set("before", before);
      const day = date ?? trackingDate;
      if (day) query.set("date", day);
      const rows = await api<TimelineRow[]>(`${base}/timeline?${query.toString()}`);
      if (replace) {
        setTimelinePages([rows]);
        setTimelinePageIndex(0);
      } else {
        setTimelinePages((prev) => [...prev, rows]);
        setTimelinePageIndex((index) => index + 1);
      }
      setTimeline(rows);
      // Day-scoped feeds are usually short; only page when not filtered to a day.
      setTimelineHasOlder(!day && rows.length >= TIMELINE_PAGE_SIZE);
    } finally {
      setTimelineLoading(false);
    }
  }

  function goTimelineNewer() {
    if (timelinePageIndex <= 0) return;
    const next = timelinePageIndex - 1;
    setTimelinePageIndex(next);
    setTimeline(timelinePages[next] ?? []);
  }

  function goTimelineOlder() {
    const cached = timelinePages[timelinePageIndex + 1];
    if (cached) {
      setTimelinePageIndex(timelinePageIndex + 1);
      setTimeline(cached);
      return;
    }
    const last = timeline[timeline.length - 1];
    if (!last || !timelineHasOlder) return;
    void loadTimelinePage(last.occurredAt, false).catch((err) =>
      setError(errorMessage(err, "Unable to load older timeline")),
    );
  }

  useEffect(() => {
    void load();
  }, [dietitianAccountId, clientId]);

  useEffect(() => {
    const raw = searchParams.get("tab");
    if (raw === "messages") {
      router.replace(`/practice/${dietitianAccountId}/messages?clientId=${clientId}`);
      return;
    }
    if (raw === "invoices") {
      router.replace(`/practice/${dietitianAccountId}/invoices?clientId=${clientId}`);
      return;
    }
    if (raw === "ai") {
      router.replace(`/practice/${dietitianAccountId}/ai?clientId=${clientId}`);
      return;
    }
    if (raw && LEGACY_TABS[raw]) {
      selectTab(LEGACY_TABS[raw]!);
    }
  }, [searchParams]);

  useEffect(() => {
    if (tab !== "tracking") return;
    setTimeline([]);
    setTimelinePages([]);
    setTimelinePageIndex(0);
    setTimelineHasOlder(false);
    if (!trackingDate) return;
    void loadTimelinePage(undefined, true, trackingDate).catch((err) =>
      setError(errorMessage(err, "Unable to load timeline")),
    );
  }, [tab, base, trackingDate]);

  useEffect(() => {
    if (tab !== "tracking") return;
    const query = trackingDate ? `?date=${trackingDate}` : "";
    void api<NonNullable<typeof trackingSummary>>(`${base}/tracking/summary${query}`)
      .then((summary) => {
        setTrackingSummary(summary);
        if (!trackingDate) setTrackingDate(summary.date);
      })
      .catch((err) => setError(errorMessage(err, "Unable to load tracking")));
    void Promise.all([
      api<typeof habitCatalog>(`/api/v1/dietitian/${dietitianAccountId}/habits`),
      api<typeof clientHabits>(`${base}/habits`),
    ])
      .then(([catalog, assigned]) => {
        setHabitCatalog(catalog);
        setClientHabits(assigned);
      })
      .catch((err) => setError(errorMessage(err, "Unable to load habits")));
  }, [tab, trackingDate, base, dietitianAccountId]);

  useEffect(() => {
    if (tab !== "overview") return;
    let cancelled = false;
    void api<Array<{ invoiceNumber: string | null; status: string }>>(`${base}/invoices`)
      .then((rows) => {
        if (cancelled) return;
        const unpaid = rows.filter((row) => row.status === "ISSUED" || row.status === "SENT" || row.status === "OVERDUE")
          .length;
        const latest = rows[0];
        setBillingSnapshot({
          unpaid,
          latestLabel: latest?.invoiceNumber ?? (rows.length > 0 ? "Draft" : null),
        });
      })
      .catch(() => {
        if (!cancelled) setBillingSnapshot({ unpaid: 0, latestLabel: null });
      });
    return () => {
      cancelled = true;
    };
  }, [tab, base]);

  const client = portfolio?.client ?? null;
  const name = client
    ? client.displayName?.trim() || `${client.firstName} ${client.lastName}`
    : "Client";
  const connectionStatus = client?.connectionStatus ?? portalAccount?.connectionStatus;
  const weightMeasurement = portfolio ? measurementOf(portfolio, "WEIGHT") : null;
  const heightMeasurement = portfolio ? measurementOf(portfolio, "HEIGHT") : null;
  const previousWeight = portfolio?.previousWeight ?? null;
  const recentWeightChange =
    weightMeasurement && previousWeight && weightMeasurement.unit === previousWeight.unit
      ? Math.round((weightMeasurement.value - previousWeight.value) * 1000) / 1000
      : null;
  const clientAgeYears = ageInYears(client?.dateOfBirth);

  function dismissCreatedTip() {
    setShowCreatedTip(false);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("created");
    const query = next.toString();
    router.replace(
      `/practice/${dietitianAccountId}/clients/${clientId}${query ? `?${query}` : ""}`,
      { scroll: false },
    );
  }

  return (
    <section className="ui-client-chart">
      <div className="ui-client-chart__chrome">
        <PageHeader
          eyebrow="Client portfolio"
          title={name}
          description={
            client ? (
              <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <StatusBadge status={client.status} label={statusLabel(client.status)} />
                <StatusBadge status={connectionStatus ?? undefined} label={portalStatusLabel(connectionStatus)} />
                {client.email ? <span>{client.email}</span> : null}
                {client.tags.map((tag) => (
                  <Badge key={tag.id} tone="neutral">
                    {tag.name}
                  </Badge>
                ))}
              </span>
            ) : undefined
          }
          actions={client ? <Avatar name={name} /> : undefined}
        />

        <div className="ui-client-chart__tabs ui-client-chart__nav">
          <div className="ui-client-chart__sections">
            <Tabs
              variant="line"
              items={visibleSections.map((section) => ({
                id: section.id,
                label: section.label,
                icon: section.icon,
              }))}
              value={activeSection.id}
              onChange={selectSection}
            />
          </div>
          {activeSection.tabs.length > 1 ? (
            <div className="ui-client-chart__subnav">
              <div className="ui-client-chart__subtabs">
                <Tabs variant="line" items={activeSection.tabs} value={tab} onChange={selectTab} />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <div style={{ marginBottom: 12 }}>
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      {showCreatedTip ? (
        <div style={{ marginBottom: 12 }}>
          <Alert tone="neutral">
            Client chart created. Manage profile, measurements, meal plans, and appointments from this
            workspace — portal login is optional. Invite them later from Settings when ready.{" "}
            <button type="button" className="ui-link" onClick={dismissCreatedTip}>
              Dismiss
            </button>
          </Alert>
        </div>
      ) : null}

      {/* ── OVERVIEW ── */}
      {tab === "overview" && portfolio ? (
        <div className="ui-client-chart__panel ui-stack">
          <div className="ui-client-chart__snapshot">
            <div className="ui-client-chart__vitals" role="group" aria-label="Body metrics">
              <button type="button" className="ui-client-chart__vital" onClick={() => selectTab("clinical")}>
                <span className="ui-client-chart__metric-label">Age</span>
                <span className="ui-client-chart__vital-value">
                  {clientAgeYears != null ? (
                    <>
                      {clientAgeYears}
                      <span className="ui-client-chart__vital-unit">years</span>
                    </>
                  ) : (
                    "—"
                  )}
                </span>
                <span className="ui-client-chart__vital-meta">
                  {client?.dateOfBirth ? formatFullDate(client.dateOfBirth) : "Date of birth not set"}
                </span>
              </button>
              <button type="button" className="ui-client-chart__vital" onClick={() => openMeasurement("WEIGHT")}>
                <span className="ui-client-chart__metric-label">Weight</span>
                <span className="ui-client-chart__vital-value">
                  {weightMeasurement ? (
                    <>
                      {weightMeasurement.value}
                      <span className="ui-client-chart__vital-unit">{weightMeasurement.unit}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </button>
              <button type="button" className="ui-client-chart__vital" onClick={() => openMeasurement("WEIGHT")}>
                <span className="ui-client-chart__metric-label">Previous weight</span>
                <span className="ui-client-chart__vital-value">
                  {previousWeight ? (
                    <>
                      {previousWeight.value}
                      <span className="ui-client-chart__vital-unit">{previousWeight.unit}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </span>
                {previousWeight ? (
                  <span className="ui-client-chart__vital-meta">
                    {formatDate(previousWeight.measuredAt)}
                  </span>
                ) : null}
              </button>
              <button type="button" className="ui-client-chart__vital" onClick={() => openMeasurement("WEIGHT")}>
                <span className="ui-client-chart__metric-label">Weight change</span>
                <span className="ui-client-chart__vital-value">
                  {recentWeightChange != null ? (
                    <>
                      {recentWeightChange > 0 ? "+" : ""}
                      {recentWeightChange}
                      <span className="ui-client-chart__vital-unit">{weightMeasurement?.unit}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </span>
                <span className="ui-client-chart__vital-meta">vs previous</span>
              </button>
              <button type="button" className="ui-client-chart__vital" onClick={() => openMeasurement("HEIGHT")}>
                <span className="ui-client-chart__metric-label">Height</span>
                <span className="ui-client-chart__vital-value">
                  {heightMeasurement ? (
                    <>
                      {heightMeasurement.value}
                      <span className="ui-client-chart__vital-unit">{heightMeasurement.unit}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </button>
              <button type="button" className="ui-client-chart__vital" onClick={() => openMeasurement("BMI")}>
                <span className="ui-client-chart__metric-label">BMI</span>
                <span className="ui-client-chart__vital-value">{portfolio.bmi ?? "—"}</span>
              </button>
              <button
                type="button"
                className="ui-client-chart__vital ui-client-chart__vital--trend"
                onClick={() => openMeasurement("WEIGHT")}
              >
                <span className="ui-client-chart__metric-label">Measurement</span>
                <span className="ui-client-chart__vital-value">
                  {portfolio.evolutionSummary
                    ? `${portfolio.evolutionSummary.weightDelta ?? "—"} ${
                        portfolio.evolutionSummary.weightUnit ?? ""
                      }`.trim()
                    : "—"}
                </span>
                <span className="ui-client-chart__vital-meta">
                  {portfolio.evolutionSummary?.bmiCurrent != null
                    ? `BMI ${portfolio.evolutionSummary.bmiBaseline ?? "—"} → ${portfolio.evolutionSummary.bmiCurrent}`
                    : "Need 2+ weights"}
                </span>
              </button>
            </div>

            <div className="ui-client-chart__care-grid" role="group" aria-label="Care snapshot">
              <button type="button" className="ui-client-chart__care-card" onClick={() => selectTab("settings")}>
                <span className="ui-client-chart__metric-label">Portal status</span>
                <span className="ui-client-chart__care-value">
                  {portalStatusLabel(connectionStatus)}
                </span>
                <span className="ui-client-chart__care-meta">
                  {connectionStatus === "connected"
                    ? "Patient can use the portal"
                    : "Manage this chart without portal login"}
                </span>
              </button>
              <button type="button" className="ui-client-chart__care-card" onClick={() => selectTab("clinical")}>
                <span className="ui-client-chart__metric-label">Primary goal</span>
                <span className="ui-client-chart__care-value">{portfolio.primaryGoal?.title ?? "No goal set"}</span>
                {portfolio.activeGoalsCount > 0 ? (
                  <span className="ui-client-chart__care-meta">{portfolio.activeGoalsCount} active</span>
                ) : null}
              </button>
              <button type="button" className="ui-client-chart__care-card" onClick={() => selectTab("assessments")}>
                <span className="ui-client-chart__metric-label">Latest evaluation</span>
                <span className="ui-client-chart__care-value">
                  {portfolio.latestAssessment?.templateName ?? "None yet"}
                </span>
                {portfolio.latestAssessment ? (
                  <span className="ui-client-chart__care-meta">
                    {humanizeLabel(portfolio.latestAssessment.status)}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className="ui-client-chart__care-card"
                onClick={() => selectTab("meal-plan", { planId: portfolio.activeMealPlan?.id })}
              >
                <span className="ui-client-chart__metric-label">Meal plan</span>
                <span className="ui-client-chart__care-value">
                  {portfolio.activeMealPlan?.name ?? "No active plan"}
                </span>
                {portfolio.activeMealPlan?.publishedVersion ? (
                  <span className="ui-client-chart__care-meta">
                    v{portfolio.activeMealPlan.publishedVersion.versionNumber}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className="ui-client-chart__care-card ui-client-chart__care-card--wide"
                onClick={() => selectTab("appointments")}
              >
                <span className="ui-client-chart__metric-label">Upcoming appointment</span>
                <span className="ui-client-chart__care-value">
                  {portfolio.upcomingAppointment?.title ?? "Nothing scheduled"}
                </span>
                {portfolio.upcomingAppointment ? (
                  <span className="ui-client-chart__care-meta">
                    {new Date(portfolio.upcomingAppointment.startAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className="ui-client-chart__care-card ui-client-chart__care-card--messages"
                onClick={() => selectTab("messages")}
              >
                <span className="ui-client-chart__metric-label">Unread messages</span>
                <span className="ui-client-chart__care-value ui-client-chart__care-value--stat">
                  {portfolio.recentMessages.unreadCount}
                </span>
                <span className="ui-client-chart__care-meta">Open chat</span>
              </button>
              <Link
                href={`/practice/${dietitianAccountId}/invoices?clientId=${clientId}`}
                className="ui-client-chart__care-card ui-client-chart__care-card--billing"
              >
                <span className="ui-client-chart__metric-label">Billing</span>
                {billingSnapshot && billingSnapshot.unpaid > 0 ? (
                  <>
                    <span className="ui-client-chart__care-value ui-client-chart__care-value--stat">
                      {billingSnapshot.unpaid}
                    </span>
                    <span className="ui-client-chart__care-meta">
                      Unpaid invoice{billingSnapshot.unpaid === 1 ? "" : "s"}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="ui-client-chart__care-value">{billingSnapshot?.latestLabel ?? "No invoices"}</span>
                    <span className="ui-client-chart__care-meta">
                      {billingSnapshot?.latestLabel ? "Latest invoice" : "Open invoices"}
                    </span>
                  </>
                )}
              </Link>
            </div>
          </div>

          {(portfolio.alerts.length > 0 || Object.values(portfolio.missing).some(Boolean)) && (
            <Section title="Alerts & gaps">
              {portfolio.alerts.length === 0 ? (
                <EmptyState title="No alerts" />
              ) : (
                <ul className="ui-client-chart__list">
                  {portfolio.alerts.map((alert, index) => (
                    <li key={`${alert.kind}-${index}`}>
                      <span>{alert.label}</span>
                      <Badge tone={alert.kind === "allergy" || alert.kind === "intolerance" ? "danger" : "neutral"}>
                        {humanizeLabel(alert.kind)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          <Section
            title="Recent activity"
            actions={
              <Button variant="secondary" size="sm" onClick={() => selectTab("tracking")}>
                View timeline
              </Button>
            }
          >
            {portfolio.recentTimeline.length === 0 ? (
              <EmptyState title="No activity yet" />
            ) : (
              <ul className="ui-client-chart__list">
                {portfolio.recentTimeline.map((row) => (
                  <li key={row.id}>
                    <span>{careActivityLabel(row.type)}</span>
                    <span className="ui-muted">{formatDate(row.occurredAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      ) : null}

      {/* ── MEASUREMENT ── */}
      {tab === "measurement" ? (
        <div className="ui-client-chart__panel">
          <ClientEvolutionPanel
            base={base}
            allowManage={allowManage}
            onError={setError}
            initialMetric={searchParams.get("metric")}
            onMetricChange={(metric) => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("tab", "measurement");
              params.set("metric", metric);
              router.replace(`/practice/${dietitianAccountId}/clients/${clientId}?${params.toString()}`, {
                scroll: false,
              });
            }}
          />
        </div>
      ) : null}

      {/* ── CLINICAL ── */}
      {tab === "clinical" && portfolio ? (
        <div className="ui-client-chart__panel">
          <ClientClinicalProfilePanel
            dietitianAccountId={dietitianAccountId}
            clientId={clientId}
            base={base}
            orgBase={orgBase}
            allowManage={allowManage}
            client={portfolio.client}
            orgTags={orgTags}
            selectedTagIds={selectedTagIds}
            onOrgTagsChange={setOrgTags}
            onSelectedTagIdsChange={setSelectedTagIds}
            onError={setError}
            onPortfolioRefresh={loadPortfolio}
            onDeleteClient={
              allowManage && portfolio.client.status !== "ARCHIVED" ? () => setConfirmArchive(true) : undefined
            }
          />
        </div>
      ) : null}

      {/* ── CUSTOM FORMS ── */}
      {tab === "assessments" ? (
        <ClientAssessmentsPanel
          dietitianAccountId={dietitianAccountId}
          clientId={clientId}
          base={base}
          orgBase={orgBase}
          allowManage={allowManage}
          onError={setError}
          onPortfolioRefresh={async () => {
            await loadPortfolio();
          }}
        />
      ) : null}

      {/* ── PRESCRIPTION ── */}
      {tab === "prescription" && portfolio ? (
        <div className="ui-client-chart__panel">
          <ClientPrescriptionPanel
            base={base}
            allowManage={allowManage}
            client={{
              sex: portfolio.client.sex ?? null,
              dateOfBirth: portfolio.client.dateOfBirth ?? null,
            }}
            latestMeasurements={portfolio.latestMeasurements}
            onError={setError}
          />
        </div>
      ) : null}

      {/* ── NUTRITION ── */}
      {tab === "meal-plan" && portfolio ? (
        <ClientNutritionPanel
          dietitianAccountId={dietitianAccountId}
          clientId={clientId}
          clientName={portfolio.client.displayName ?? `${portfolio.client.firstName} ${portfolio.client.lastName}`}
          allowManage={allowManage}
          initialPlanId={searchParams.get("planId") ?? portfolio.activeMealPlan?.id ?? null}
          initialView={searchParams.get("view") === "analysis" ? "analysis" : "plan"}
          onPlanChange={(planId) => setMealPlanQuery({ planId })}
          onViewChange={(view) => setMealPlanQuery({ view })}
          onError={setError}
        />
      ) : null}

      {/* ── TRACKING ── */}
      {tab === "tracking" ? (
        <div className="ui-client-chart__panel">
          <ClientTrackingPanel
            dietitianAccountId={dietitianAccountId}
            clientId={clientId}
            summary={trackingSummary}
            trackingDate={trackingDate}
            onDateChange={setTrackingDate}
            onShiftDate={shiftTrackingDate}
            habitCatalog={habitCatalog}
            clientHabits={clientHabits}
            assignHabitId={assignHabitId}
            onAssignHabitIdChange={setAssignHabitId}
            allowManage={allowManage}
            onAssignHabit={() => {
              void api(`${base}/habits`, {
                method: "POST",
                body: JSON.stringify({ habitDefinitionId: assignHabitId }),
              })
                .then(() => api<typeof clientHabits>(`${base}/habits`))
                .then((rows) => {
                  setClientHabits(rows);
                  setAssignHabitId("");
                  return api<NonNullable<typeof trackingSummary>>(
                    `${base}/tracking/summary${trackingDate ? `?date=${trackingDate}` : ""}`,
                  );
                })
                .then(setTrackingSummary)
                .catch((err) => setError(errorMessage(err, "Unable to assign habit")));
            }}
            onRemoveHabit={(habitDefinitionId) => {
              void api(`${base}/habits/${habitDefinitionId}`, { method: "DELETE" })
                .then(() => api<typeof clientHabits>(`${base}/habits`))
                .then((rows) => {
                  setClientHabits(rows);
                  return api<NonNullable<typeof trackingSummary>>(
                    `${base}/tracking/summary${trackingDate ? `?date=${trackingDate}` : ""}`,
                  );
                })
                .then(setTrackingSummary)
                .catch((err) => setError(errorMessage(err, "Unable to unassign habit")));
            }}
            activities={timeline}
            activitiesLoading={timelineLoading}
            activitiesPage={timelinePageIndex + 1}
            activitiesHasNewer={timelinePageIndex > 0}
            activitiesHasOlder={timelinePageIndex < timelinePages.length - 1 || timelineHasOlder}
            onActivitiesNewer={goTimelineNewer}
            onActivitiesOlder={goTimelineOlder}
            onError={setError}
          />
        </div>
      ) : null}

      {/* ── APPOINTMENTS ── */}
      {tab === "appointments" ? (
        <div className="ui-client-chart__panel">
          <ClientAppointmentsPanel
            dietitianAccountId={dietitianAccountId}
            clientId={clientId}
            base={base}
            onChanged={() => void loadPortfolio()}
          />
        </div>
      ) : null}

      {/* ── SETTINGS ── */}
      {tab === "settings" ? (
        <div className="ui-client-chart__panel ui-stack">
          <JoinCodePanel
            title="Portal connection"
            description="Portal login is optional. Manage this patient from the chart without them signing in. Generate a join code when they are ready to use the patient app — they create their own account and connect with the code."
            connectionStatus={connectionStatus}
            plainJoinCode={plainJoinCode}
            hint={portalAccount?.joinCode?.hint ?? null}
            expiresAt={portalAccount?.joinCode?.expiresAt ?? null}
            allowManage={allowManage}
            portalBusy={portalBusy}
            disconnectRequestedAt={portalAccount?.disconnectRequestedAt}
            disconnectRequestNote={portalAccount?.disconnectRequestNote}
            onGenerate={() => {
              setPortalBusy(true);
              void api<{ code: string }>(`${base}/account/join-code`, { method: "POST" })
                .then((result) => {
                  setPlainJoinCode(result.code);
                  return load();
                })
                .catch((err) => setError(errorMessage(err, "Could not generate join code")))
                .finally(() => setPortalBusy(false));
            }}
            onCopy={() => plainJoinCode && void navigator.clipboard.writeText(plainJoinCode)}
            onRevoke={() => setConfirmRevoke(true)}
            onDeactivate={
              allowManage && connectionStatus === "connected" ? () => setConfirmDeactivate(true) : undefined
            }
            onDismissDisconnectRequest={
              allowManage && portalAccount?.disconnectRequestedAt
                ? () => {
                    setPortalBusy(true);
                    void api(`${base}/account/disconnect-request/dismiss`, { method: "POST" })
                      .then(() => load())
                      .catch((err) => setError(errorMessage(err, "Could not dismiss request")))
                      .finally(() => setPortalBusy(false));
                  }
                : undefined
            }
          />

          {allowManage ? (
            <Section
              title="Chart status"
              description={
                client?.status === "ARCHIVED"
                  ? "This client is archived. Unarchive to make the chart active again."
                  : "Archive hides the client from the active list. The chart stays in the clinic."
              }
            >
              <div className="ui-client-chart__toolbar">
                {client?.status === "ARCHIVED" ? (
                  <Button variant="secondary" size="sm" onClick={() => setConfirmRestore(true)}>
                    Unarchive client
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => setConfirmArchive(true)}>
                    Archive client
                  </Button>
                )}
                <span className="ui-muted" style={{ fontSize: "0.8rem" }}>
                  Status: {statusLabel(client?.status)}
                </span>
              </div>
            </Section>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmArchive}
        title="Archive this client?"
        description="The chart stays in the clinic but is no longer active."
        confirmLabel="Archive"
        onConfirm={() => {
          void api(`${base}/archive`, { method: "POST" })
            .then(() => {
              setConfirmArchive(false);
              return load();
            })
            .catch((err) => setError(errorMessage(err, "Unable to archive client")));
        }}
        onCancel={() => setConfirmArchive(false)}
      />
      <ConfirmDialog
        open={confirmRestore}
        title="Unarchive this client?"
        description="The chart will become active again. Portal access stays off until you reconnect them."
        confirmLabel="Unarchive"
        onConfirm={() => {
          void api(`${base}/restore`, {
            method: "POST",
            body: JSON.stringify({ status: "ACTIVE" }),
          })
            .then(() => {
              setConfirmRestore(false);
              return load();
            })
            .catch((err) => setError(errorMessage(err, "Unable to unarchive client")));
        }}
        onCancel={() => setConfirmRestore(false)}
      />
      <ConfirmDialog
        open={confirmRevoke}
        title="Revoke this reconnect code?"
        confirmLabel="Revoke"
        onConfirm={() => {
          setPortalBusy(true);
          void api(`${base}/account/join-code`, { method: "DELETE" })
            .then(() => {
              setPlainJoinCode(null);
              setConfirmRevoke(false);
              return load();
            })
            .finally(() => setPortalBusy(false));
        }}
        onCancel={() => setConfirmRevoke(false)}
      />
      <ConfirmDialog
        open={confirmDeactivate}
        title={
          portalAccount?.disconnectRequestedAt
            ? "Approve disconnect and deactivate portal?"
            : "Deactivate this portal connection?"
        }
        confirmLabel={portalAccount?.disconnectRequestedAt ? "Approve & deactivate" : "Deactivate"}
        onConfirm={() => {
          void api(`${base}/account/deactivate`, { method: "POST" }).then(() => {
            setPlainJoinCode(null);
            setConfirmDeactivate(false);
            return load();
          });
        }}
        onCancel={() => setConfirmDeactivate(false)}
      />
    </section>
  );
}
