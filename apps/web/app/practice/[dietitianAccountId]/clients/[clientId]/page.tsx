"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Avatar,
  Badge,
  Breadcrumbs,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Section,
  Skeleton,
  StatusBadge,
  Table,
  Tabs,
  Td,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { AiPanel } from "../../../../../components/ai-panel";
import { JoinCodePanel } from "../../../../../components/join-code-panel";
import { ClientAssessmentsPanel } from "../../../../../components/client-assessments-panel";
import { ClientClinicalProfilePanel } from "../../../../../components/client-clinical-profile-panel";
import { ClientEvolutionPanel } from "../../../../../components/client-evolution-panel";
import { ClientTimelinePanel } from "../../../../../components/client-timeline-panel";
import { ClientTrackingPanel } from "../../../../../components/client-tracking-panel";
import { api } from "../../../../../lib/api";
import {
  combineLocalDateTime,
  toDateInputValue,
  toTimeInputValue,
} from "../../../../../lib/calendar-range";
import { ageInYears, formatDate, formatFullDate, formatMoney } from "../../../../../lib/format";
import { errorMessage } from "../../../../../lib/humanize-error";
import { canManageClients } from "../../../../../lib/practice-access";
import { portalStatusLabel, statusLabel, activityLabel } from "../../../../../lib/practice-labels";
import { usePractice } from "../../practice-shell";

type Tab =
  | "overview"
  | "measurement"
  | "clinical"
  | "assessments"
  | "meal-plan"
  | "tracking"
  | "messages"
  | "invoices"
  | "appointments"
  | "timeline"
  | "ai"
  | "portal";

type ChartSection = {
  id: string;
  label: string;
  tabs: Array<{ id: Tab; label: string }>;
};

const TIMELINE_PAGE_SIZE = 25;

const LEGACY_TABS: Record<string, Tab> = {
  personal: "clinical",
  goals: "clinical",
  documents: "clinical",
  evolution: "measurement",
};

const chartSections: ChartSection[] = [
  {
    id: "overview",
    label: "Overview",
    tabs: [{ id: "overview", label: "Summary" }],
  },
  {
    id: "personal",
    label: "Personal data",
    tabs: [
      { id: "clinical", label: "Clinical profile" },
      { id: "assessments", label: "Custom forms" },
    ],
  },
  {
    id: "progress",
    label: "Progress & tracking",
    tabs: [
      { id: "measurement", label: "Measurement" },
      { id: "tracking", label: "Tracking" },
      { id: "timeline", label: "Timeline" },
    ],
  },
  {
    id: "nutrition",
    label: "Nutrition",
    tabs: [{ id: "meal-plan", label: "Meal plans" }],
  },
  {
    id: "care",
    label: "Appointments",
    tabs: [
      { id: "appointments", label: "Appointments" },
      { id: "messages", label: "Messages" },
    ],
  },
  {
    id: "portal",
    label: "Portal",
    tabs: [{ id: "portal", label: "Connection" }],
  },
  {
    id: "practice",
    label: "Clinic tools",
    tabs: [
      { id: "invoices", label: "Invoices" },
      { id: "ai", label: "AI" },
    ],
  },
];

function chartSectionsForAi(aiAvailable: boolean): ChartSection[] {
  if (aiAvailable) return chartSections;
  return chartSections.map((section) =>
    section.id === "practice"
      ? { ...section, tabs: section.tabs.filter((tab) => tab.id !== "ai") }
      : section,
  );
}

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
  const visibleSections = chartSectionsForAi(practice.aiAvailable);
  const base = `/api/v1/dietitian/${dietitianAccountId}/clients/${clientId}`;
  const orgBase = `/api/v1/dietitian/${dietitianAccountId}`;
  const tabFromQuery = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(() => {
    const next = resolveTab(tabFromQuery, chartSectionsForAi(true));
    if (next === "ai" && !practice.aiAvailable) return "overview";
    return next;
  });

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreatedTip, setShowCreatedTip] = useState(() => searchParams.get("created") === "1");

  const [orgTags, setOrgTags] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const [plans, setPlans] = useState<Array<{ id: string; name: string; status: string; client: { id: string } }>>([]);

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

  const [clientInvoices, setClientInvoices] = useState<
    Array<{ id: string; invoiceNumber: string | null; status: string; dueDate: string | null; total: number; currency: string }>
  >([]);

  const [appointments, setAppointments] = useState<
    Array<{
      id: string;
      title: string;
      startAt: string;
      endAt?: string;
      status: string;
      proposedStartAt?: string | null;
      proposedEndAt?: string | null;
      proposedByUserId?: string | null;
    }>
  >([]);
  const [appointmentBusyId, setAppointmentBusyId] = useState<string | null>(null);
  const [counterProposeId, setCounterProposeId] = useState<string | null>(null);
  const [counterDate, setCounterDate] = useState(toDateInputValue(new Date()));
  const [counterStart, setCounterStart] = useState("10:00");
  const [counterEnd, setCounterEnd] = useState("11:00");
  const [appointmentTitle, setAppointmentTitle] = useState("Consultation");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [timelinePages, setTimelinePages] = useState<TimelineRow[][]>([]);
  const [timelinePageIndex, setTimelinePageIndex] = useState(0);
  const [timelineHasOlder, setTimelineHasOlder] = useState(false);
  const [timelineNotes, setTimelineNotes] = useState("");
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
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  function selectTab(next: string, extras?: { metric?: string }) {
    const value = resolveTab(next, visibleSections);
    if (next === "ai" && !practice.aiAvailable) {
      setTab("overview");
      return;
    }
    if (value === "messages") {
      router.push(`/practice/${dietitianAccountId}/messages?clientId=${clientId}`);
      return;
    }
    setTab(value);
    const params = new URLSearchParams();
    params.set("tab", value);
    if (value === "measurement" && extras?.metric) {
      params.set("metric", extras.metric);
    }
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
  const activeSubTab = activeSection.tabs.find((item) => item.id === tab) ?? activeSection.tabs[0];

  useEffect(() => {
    if (tab === "messages") {
      router.replace(`/practice/${dietitianAccountId}/messages?clientId=${clientId}`);
    }
  }, [tab, dietitianAccountId, clientId, router]);

  useEffect(() => {
    if (tab === "ai" && !practice.aiAvailable) {
      selectTab("overview");
    }
  }, [practice.aiAvailable, tab]);

  function applyPortfolio(data: Portfolio) {
    setPortfolio(data);
    setSelectedTagIds(data.client.tags.map((tag) => tag.id));
    setTimelineNotes(data.profile?.notes ?? "");
  }

  async function loadPortfolio() {
    const data = await api<Portfolio>(`${base}/portfolio`);
    applyPortfolio(data);
    return data;
  }

  async function load() {
    setError(null);
    try {
      const [portfolioData, account, tagRows, planRows] = await Promise.all([
        api<Portfolio>(`${base}/portfolio`),
        api<NonNullable<typeof portalAccount>>(`${base}/account`),
        api<Array<{ id: string; name: string }>>(`${orgBase}/tags`),
        api<{ items: typeof plans }>(`${orgBase}/meal-plans`),
      ]);
      applyPortfolio(portfolioData);
      setPortalAccount(account);
      setOrgTags(tagRows);
      setPlans(planRows.items.filter((plan) => plan.client.id === clientId));
    } catch (err) {
      setError(errorMessage(err, "Unable to load client"));
    }
  }

  async function loadAppointments() {
    const rows = await api<typeof appointments>(`${base}/appointments`);
    setAppointments(rows);
  }

  async function loadTimelinePage(before?: string, replace = true) {
    setTimelineLoading(true);
    try {
      const query = new URLSearchParams({ limit: String(TIMELINE_PAGE_SIZE) });
      if (before) query.set("before", before);
      const rows = await api<TimelineRow[]>(`${base}/timeline?${query.toString()}`);
      if (replace) {
        setTimelinePages([rows]);
        setTimelinePageIndex(0);
      } else {
        setTimelinePages((prev) => [...prev, rows]);
        setTimelinePageIndex((index) => index + 1);
      }
      setTimeline(rows);
      setTimelineHasOlder(rows.length >= TIMELINE_PAGE_SIZE);
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
    if (raw && LEGACY_TABS[raw]) {
      selectTab(LEGACY_TABS[raw]!);
    }
  }, [searchParams]);

  useEffect(() => {
    if (tab !== "timeline") return;
    setTimeline([]);
    setTimelinePages([]);
    setTimelinePageIndex(0);
    setTimelineHasOlder(false);
    void loadTimelinePage().catch((err) => setError(errorMessage(err, "Unable to load timeline")));
  }, [tab, base]);

  useEffect(() => {
    if (tab !== "appointments") return;
    void loadAppointments().catch((err) => setError(errorMessage(err, "Unable to load appointments")));
  }, [tab, base]);

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
    if (tab !== "invoices") return;
    void api<typeof clientInvoices>(`${base}/invoices`)
      .then(setClientInvoices)
      .catch((err) => setError(errorMessage(err, "Unable to load invoices")));
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
      <Breadcrumbs
        items={[
          { label: "Clients", href: `/practice/${dietitianAccountId}/clients` },
          { label: name },
        ]}
      />
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
            items={visibleSections.map((section) => ({ id: section.id, label: section.label }))}
            value={activeSection.id}
            onChange={selectSection}
          />
        </div>
        {activeSection.tabs.length > 1 ? (
          <div className="ui-client-chart__subnav">
            <p className="ui-client-chart__crumb">
              <span>{activeSection.label}</span>
              <span aria-hidden="true">/</span>
              <strong>{activeSubTab?.label}</strong>
            </p>
            <div className="ui-client-chart__subtabs">
              <Tabs items={activeSection.tabs} value={tab} onChange={selectTab} />
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div style={{ margin: "0 0 12px" }}>
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      {showCreatedTip ? (
        <div style={{ margin: "0 0 12px" }}>
          <Alert tone="neutral">
            Client chart created. Manage profile, measurements, meal plans, and appointments from this
            workspace — portal login is optional. Invite them later from the Portal tab when ready.{" "}
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
              <button type="button" className="ui-client-chart__care-card" onClick={() => selectTab("portal")}>
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
              <button type="button" className="ui-client-chart__care-card" onClick={() => selectTab("meal-plan")}>
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
              <Button variant="secondary" size="sm" onClick={() => selectTab("timeline")}>
                View full timeline
              </Button>
            }
          >
            {portfolio.recentTimeline.length === 0 ? (
              <EmptyState title="No activity yet" />
            ) : (
              <ul className="ui-client-chart__list">
                {portfolio.recentTimeline.map((row) => (
                  <li key={row.id}>
                    <span>{activityLabel(row.type)}</span>
                    <span className="ui-muted">{formatDate(row.occurredAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {allowManage && client?.status === "ACTIVE" ? (
            <Section title="Chart management">
              <div className="ui-client-chart__toolbar">
                <Button variant="secondary" size="sm" onClick={() => setConfirmArchive(true)}>
                  Archive client
                </Button>
              </div>
            </Section>
          ) : null}
        </div>
      ) : null}

      {/* ── MEASUREMENT ── */}
      {tab === "measurement" ? (
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

      {/* ── MEAL PLAN ── */}
      {tab === "meal-plan" ? (
        <Section
          title="Meal plans"
          actions={
            <Link href={`/practice/${dietitianAccountId}/meal-plans`} className="ui-btn ui-btn--secondary ui-btn--sm">
              All meal plans
            </Link>
          }
        >
          {plans.length === 0 ? (
            <EmptyState
              title="No meal plans for this client"
              action={
                <Link href={`/practice/${dietitianAccountId}/meal-plans`} className="ui-btn ui-btn--secondary ui-btn--sm">
                  Open meal plans
                </Link>
              }
            />
          ) : (
            <ul className="ui-client-chart__list">
              {plans.map((plan) => (
                <li key={plan.id}>
                  <Link
                    href={`/practice/${dietitianAccountId}/meal-plans/${plan.id}`}
                    className="ui-link"
                    style={{ fontWeight: 500 }}
                  >
                    {plan.name}
                  </Link>
                  <StatusBadge status={plan.status} label={humanizeLabel(plan.status)} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      {/* ── TRACKING ── */}
      {tab === "tracking" ? (
        <div className="ui-client-chart__panel ui-stack">
          <p className="ui-hint" style={{ margin: "0 0 0.75rem", padding: "0.35rem 0 0.15rem", lineHeight: 1.45 }}>
            Food, water, exercise, sleep, and habits are logged by the patient in the portal. Assign habits here; you don’t need to enter everyday tracking for them.
          </p>
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
          />
        </div>
      ) : null}

      {/* ── MESSAGES (opens inbox) ── */}
      {tab === "messages" ? (
        <div className="ui-client-chart__panel">
          <LoadingState>Opening client chat…</LoadingState>
        </div>
      ) : null}

      {/* ── INVOICES ── */}
      {tab === "invoices" ? (
        <Section title="Invoices">
          {clientInvoices.length === 0 ? (
            <EmptyState title="No invoices for this client" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Status</th>
                  <th>Due date</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {clientInvoices.map((row) => (
                  <tr key={row.id}>
                    <Td label="Invoice">
                      <Link href={`/practice/${dietitianAccountId}/invoices/${row.id}`} className="ui-link">
                        {row.invoiceNumber ?? "Draft"}
                      </Link>
                    </Td>
                    <Td label="Status">
                      <StatusBadge status={row.status} label={humanizeLabel(row.status)} />
                    </Td>
                    <Td label="Due date">{row.dueDate ?? "—"}</Td>
                    <Td label="Total">{formatMoney(row.total, row.currency)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>
      ) : null}

      {/* ── APPOINTMENTS ── */}
      {tab === "appointments" ? (
        <div className="ui-client-chart__panel ui-stack">
          <Section title="Schedule appointment">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void api(`${base}/appointments`, {
                  method: "POST",
                  body: JSON.stringify({
                    title: appointmentTitle,
                    startAt: new Date(startAt).toISOString(),
                    endAt: new Date(endAt).toISOString(),
                  }),
                })
                  .then(() => Promise.all([loadAppointments(), loadPortfolio()]))
                  .catch((err) => setError(errorMessage(err, "Unable to schedule appointment")));
              }}
            >
              <div className="ui-client-chart__form-grid">
                <Field label="Title">
                  <Input
                    value={appointmentTitle}
                    onChange={(event) => setAppointmentTitle(event.target.value)}
                    required
                  />
                </Field>
                <Field label="Start">
                  <Input
                    type="datetime-local"
                    value={startAt}
                    onChange={(event) => setStartAt(event.target.value)}
                    required
                  />
                </Field>
                <Field label="End">
                  <Input
                    type="datetime-local"
                    value={endAt}
                    onChange={(event) => setEndAt(event.target.value)}
                    required
                  />
                </Field>
              </div>
              <Button type="submit" size="sm" variant="secondary">
                Schedule
              </Button>
            </form>
          </Section>

          <Section title="Appointments">
            {appointments.length === 0 ? (
              <EmptyState title="No appointments yet" />
            ) : (
              <ul className="ui-client-appt-list">
                {appointments.map((row) => {
                  const busy = appointmentBusyId === row.id;
                  const pendingReschedule =
                    row.status === "RESCHEDULE_PENDING" && row.proposedStartAt && row.proposedEndAt;
                  const pendingCancel = row.status === "CANCELLATION_PENDING";
                  return (
                    <li key={row.id} className="ui-client-appt">
                      <div className="ui-client-appt__main">
                        <div className="ui-client-appt__title-row">
                          <strong>{row.title}</strong>
                          <StatusBadge status={row.status} label={humanizeLabel(row.status)} />
                        </div>
                        <p className="ui-client-appt__when">{formatDate(row.startAt)}</p>
                        {pendingReschedule ? (
                          <p className="ui-client-appt__request">
                            Requested: {formatDate(row.proposedStartAt)}
                            {row.proposedEndAt ? ` – ${formatDate(row.proposedEndAt)}` : ""}
                          </p>
                        ) : null}
                        {pendingCancel ? (
                          <p className="ui-client-appt__request">Patient requested cancellation</p>
                        ) : null}
                      </div>
                      {pendingReschedule || pendingCancel ? (
                        <div className="ui-client-appt__actions">
                          {pendingReschedule ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                disabled={busy}
                                onClick={() => {
                                  setAppointmentBusyId(row.id);
                                  void api(
                                    `/api/v1/dietitian/${dietitianAccountId}/appointments/${row.id}/accept-reschedule`,
                                    { method: "POST", body: JSON.stringify({}) },
                                  )
                                    .then(() => Promise.all([loadAppointments(), loadPortfolio()]))
                                    .catch((err) =>
                                      setError(errorMessage(err, "Unable to accept reschedule")),
                                    )
                                    .finally(() => setAppointmentBusyId(null));
                                }}
                              >
                                Approve
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={busy}
                                onClick={() => {
                                  const start = new Date(row.proposedStartAt ?? row.startAt);
                                  const end = new Date(row.proposedEndAt ?? row.endAt ?? row.startAt);
                                  setCounterProposeId(row.id);
                                  setCounterDate(toDateInputValue(start));
                                  setCounterStart(toTimeInputValue(start));
                                  setCounterEnd(toTimeInputValue(end));
                                }}
                              >
                                Suggest another time
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => {
                                  setAppointmentBusyId(row.id);
                                  void api(
                                    `/api/v1/dietitian/${dietitianAccountId}/appointments/${row.id}/reject-reschedule`,
                                    { method: "POST", body: JSON.stringify({}) },
                                  )
                                    .then(() => loadAppointments())
                                    .catch((err) =>
                                      setError(errorMessage(err, "Unable to decline reschedule")),
                                    )
                                    .finally(() => setAppointmentBusyId(null));
                                }}
                              >
                                Decline
                              </Button>
                            </>
                          ) : null}
                          {pendingCancel ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="danger"
                                disabled={busy}
                                onClick={() => {
                                  setAppointmentBusyId(row.id);
                                  void api(
                                    `/api/v1/dietitian/${dietitianAccountId}/appointments/${row.id}/accept-cancellation`,
                                    { method: "POST", body: JSON.stringify({}) },
                                  )
                                    .then(() => Promise.all([loadAppointments(), loadPortfolio()]))
                                    .catch((err) =>
                                      setError(errorMessage(err, "Unable to approve cancellation")),
                                    )
                                    .finally(() => setAppointmentBusyId(null));
                                }}
                              >
                                Approve cancel
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={busy}
                                onClick={() => {
                                  setAppointmentBusyId(row.id);
                                  void api(
                                    `/api/v1/dietitian/${dietitianAccountId}/appointments/${row.id}/reject-cancellation`,
                                    { method: "POST", body: JSON.stringify({}) },
                                  )
                                    .then(() => loadAppointments())
                                    .catch((err) =>
                                      setError(errorMessage(err, "Unable to decline cancellation")),
                                    )
                                    .finally(() => setAppointmentBusyId(null));
                                }}
                              >
                                Keep
                              </Button>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      ) : null}

      {/* ── TIMELINE ── */}
      {tab === "timeline" ? (
        <div className="ui-client-chart__panel">
          <ClientTimelinePanel
            notes={timelineNotes}
            onNotesChange={setTimelineNotes}
            onSaveNotes={() => {
              void api(`${base}/profile`, {
                method: "PATCH",
                body: JSON.stringify({ notes: timelineNotes }),
              })
                .then(() => loadPortfolio())
                .catch((err) => setError(errorMessage(err, "Unable to save notes")));
            }}
            allowManage={allowManage}
            events={timeline}
            loading={timelineLoading}
            page={timelinePageIndex + 1}
            hasNewer={timelinePageIndex > 0}
            hasOlder={timelinePageIndex < timelinePages.length - 1 || timelineHasOlder}
            onNewer={goTimelineNewer}
            onOlder={goTimelineOlder}
          />
        </div>
      ) : null}

      {/* ── AI ── */}
      {tab === "ai" && practice.aiAvailable ? (
        <div className="ui-client-chart__ai">
          <AiPanel
            dietitianAccountId={dietitianAccountId}
            clientId={clientId}
            action="client-summary"
            title="Client summary"
            description="Concise overview from profile, goals, tracking, and meal-plan context."
          />
          <AiPanel
            dietitianAccountId={dietitianAccountId}
            clientId={clientId}
            action="meal-plan-assistance"
            title="Meal plan assistance"
            description="Suggestions only — review and apply manually in the meal-plan editor."
          />
          <AiPanel
            dietitianAccountId={dietitianAccountId}
            clientId={clientId}
            action="nutrition-assistance"
            title="Nutrition assistance"
            description="Explain foods using values from your food database."
            foodQuery
          />
          <AiPanel
            dietitianAccountId={dietitianAccountId}
            clientId={clientId}
            action="consultation-summary"
            title="Consultation summary"
            description="Draft summary and follow-up questions for your next visit."
          />
          <AiPanel
            dietitianAccountId={dietitianAccountId}
            clientId={clientId}
            action="message-draft"
            title="Message draft"
            description="Draft only — send manually from Messages when ready."
          />
        </div>
      ) : null}

      {/* ── PORTAL ── */}
      {tab === "portal" ? (
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
      ) : null}

      <Dialog
        open={!!counterProposeId}
        title="Suggest another time"
        onClose={() => setCounterProposeId(null)}
      >
        <form
          className="ui-stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (!counterProposeId) return;
            setAppointmentBusyId(counterProposeId);
            void api(
              `/api/v1/dietitian/${dietitianAccountId}/appointments/${counterProposeId}/propose-reschedule`,
              {
                method: "POST",
                body: JSON.stringify({
                  startAt: combineLocalDateTime(counterDate, counterStart),
                  endAt: combineLocalDateTime(counterDate, counterEnd),
                }),
              },
            )
              .then(() => {
                setCounterProposeId(null);
                return Promise.all([loadAppointments(), loadPortfolio()]);
              })
              .catch((err) => setError(errorMessage(err, "Unable to suggest another time")))
              .finally(() => setAppointmentBusyId(null));
          }}
        >
          <p className="ui-muted" style={{ margin: 0 }}>
            Send a different time to the patient. They will need to accept it.
          </p>
          <Field label="Date">
            <Input
              type="date"
              value={counterDate}
              onChange={(event) => setCounterDate(event.target.value)}
              required
            />
          </Field>
          <Field label="Start">
            <Input
              type="time"
              value={counterStart}
              onChange={(event) => setCounterStart(event.target.value)}
              required
            />
          </Field>
          <Field label="End">
            <Input
              type="time"
              value={counterEnd}
              onChange={(event) => setCounterEnd(event.target.value)}
              required
            />
          </Field>
          <div className="ui-row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <Button type="button" variant="secondary" onClick={() => setCounterProposeId(null)}>
              Back
            </Button>
            <Button type="submit" disabled={appointmentBusyId === counterProposeId}>
              {appointmentBusyId === counterProposeId ? "Sending…" : "Send request"}
            </Button>
          </div>
        </form>
      </Dialog>

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
