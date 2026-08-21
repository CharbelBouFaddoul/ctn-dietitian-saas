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
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Section,
  Select,
  Skeleton,
  StatusBadge,
  Table,
  Tabs,
  Td,
  Textarea,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { AiPanel } from "../../../../../components/ai-panel";
import { DocumentsLibrary, type DocumentsLibraryItem } from "../../../../../components/documents-library";
import { JoinCodePanel } from "../../../../../components/join-code-panel";
import { ClientAssessmentsPanel } from "../../../../../components/client-assessments-panel";
import { ClientEvolutionPanel } from "../../../../../components/client-evolution-panel";
import { ClientTimelinePanel } from "../../../../../components/client-timeline-panel";
import { ClientTrackingPanel } from "../../../../../components/client-tracking-panel";
import { ClinicTagsManager } from "../../../../../components/clinic-tags-manager";
import { api, apiUrl } from "../../../../../lib/api";
import {
  combineLocalDateTime,
  toDateInputValue,
  toTimeInputValue,
} from "../../../../../lib/calendar-range";
import { downloadAuthenticatedFile } from "../../../../../lib/documents";
import { formatDate, formatMoney } from "../../../../../lib/format";
import { errorMessage } from "../../../../../lib/humanize-error";
import { canManageClients } from "../../../../../lib/practice-access";
import { portalStatusLabel, statusLabel, activityLabel } from "../../../../../lib/practice-labels";
import { usePractice } from "../../practice-shell";

type Tab =
  | "overview"
  | "evolution"
  | "personal"
  | "assessments"
  | "goals"
  | "meal-plan"
  | "tracking"
  | "messages"
  | "documents"
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
      { id: "personal", label: "Profile" },
      { id: "goals", label: "Goals" },
    ],
  },
  {
    id: "evaluation",
    label: "Evaluation",
    tabs: [{ id: "assessments", label: "Patient evaluation" }],
  },
  {
    id: "progress",
    label: "Progress & tracking",
    tabs: [
      { id: "evolution", label: "Evolution" },
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
    label: "Appointments & documents",
    tabs: [
      { id: "appointments", label: "Appointments" },
      { id: "documents", label: "Documents" },
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

type ClientForm = {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  sex: string;
};

type ProfileForm = {
  nutritionContext: string;
  preferences: string;
  dietaryPreferences: string;
  allergies: string;
  intolerances: string;
  lifestyle: string;
  notes: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

type GoalRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  targetValue: number | null;
  targetUnit: string | null;
  targetDate: string | null;
};

type TimelineRow = {
  id: string;
  type: string;
  occurredAt: string;
  targetType: string | null;
  targetId: string | null;
};

type MeasurementRow = {
  id: string;
  type: string;
  value: number;
  unit: string;
  measuredAt: string;
};

function emptyClientForm(): ClientForm {
  return {
    firstName: "",
    lastName: "",
    displayName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    sex: "UNSPECIFIED",
  };
}

function emptyProfileForm(): ProfileForm {
  return {
    nutritionContext: "",
    preferences: "",
    dietaryPreferences: "",
    allergies: "",
    intolerances: "",
    lifestyle: "",
    notes: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
  };
}

function clientFormFromPortfolio(portfolio: Portfolio): ClientForm {
  const c = portfolio.client;
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    displayName: c.displayName ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    dateOfBirth: c.dateOfBirth?.slice(0, 10) ?? "",
    sex: c.sex ?? "UNSPECIFIED",
  };
}

function profileFormFromPortfolio(portfolio: Portfolio): ProfileForm {
  const p = portfolio.profile;
  return {
    nutritionContext: p?.nutritionContext ?? "",
    preferences: p?.preferences ?? "",
    dietaryPreferences: p?.dietaryPreferences ?? "",
    allergies: p?.allergies ?? "",
    intolerances: p?.intolerances ?? "",
    lifestyle: p?.lifestyle ?? "",
    notes: p?.notes ?? "",
    emergencyContactName: p?.emergencyContactName ?? "",
    emergencyContactPhone: p?.emergencyContactPhone ?? "",
  };
}

function measurementOf(portfolio: Portfolio, type: string) {
  return portfolio.latestMeasurements.find((row) => row.type === type) ?? null;
}

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
  const [tab, setTab] = useState<Tab>(() =>
    isTab(tabFromQuery, chartSectionsForAi(true)) && !(tabFromQuery === "ai" && !practice.aiAvailable)
      ? (tabFromQuery as Tab)
      : "overview",
  );

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [clientForm, setClientForm] = useState<ClientForm>(emptyClientForm);
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfileForm);
  const [orgTags, setOrgTags] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementRow[]>([]);
  const [weight, setWeight] = useState("");

  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalDescription, setGoalDescription] = useState("");

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

  const [clientDocuments, setClientDocuments] = useState<DocumentsLibraryItem[]>([]);
  const [documentsUploading, setDocumentsUploading] = useState(false);
  const [documentsDownloadingId, setDocumentsDownloadingId] = useState<string | null>(null);
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
  const [timelineHasMore, setTimelineHasMore] = useState(false);
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
    const value = isTab(next, visibleSections) ? next : "overview";
    if (value === "messages") {
      router.push(`/practice/${dietitianAccountId}/messages?clientId=${clientId}`);
      return;
    }
    setTab(value);
    const params = new URLSearchParams();
    params.set("tab", value);
    if (value === "evolution" && extras?.metric) {
      params.set("metric", extras.metric);
    }
    router.replace(`/practice/${dietitianAccountId}/clients/${clientId}?${params.toString()}`, { scroll: false });
  }

  function openEvolution(metric: "WEIGHT" | "HEIGHT" | "BMI") {
    selectTab("evolution", { metric });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react when AI availability flips
  }, [practice.aiAvailable, tab]);

  function applyPortfolio(data: Portfolio) {
    setPortfolio(data);
    setClientForm(clientFormFromPortfolio(data));
    setProfileForm(profileFormFromPortfolio(data));
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

  async function loadGoals() {
    const rows = await api<GoalRow[]>(`${base}/goals`);
    setGoals(rows);
  }

  async function loadMeasurements() {
    const rows = await api<MeasurementRow[]>(`${base}/measurements`);
    setMeasurements(rows);
  }

  async function loadAppointments() {
    const rows = await api<typeof appointments>(`${base}/appointments`);
    setAppointments(rows);
  }

  async function loadTimeline(before?: string) {
    setTimelineLoading(true);
    try {
      const query = new URLSearchParams({ limit: "50" });
      if (before) query.set("before", before);
      const rows = await api<TimelineRow[]>(`${base}/timeline?${query.toString()}`);
      setTimeline((prev) => (before ? [...prev, ...rows] : rows));
      setTimelineHasMore(rows.length >= 50);
    } finally {
      setTimelineLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [dietitianAccountId, clientId]);

  useEffect(() => {
    if (tab !== "personal") return;
    void loadMeasurements().catch((err) => setError(errorMessage(err, "Unable to load measurements")));
  }, [tab, base]);

  useEffect(() => {
    if (tab !== "goals") return;
    void loadGoals().catch((err) => setError(errorMessage(err, "Unable to load goals")));
  }, [tab, base]);

  useEffect(() => {
    if (tab !== "timeline") return;
    setTimeline([]);
    void loadTimeline().catch((err) => setError(errorMessage(err, "Unable to load timeline")));
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
    if (tab !== "documents") return;
    void api<typeof clientDocuments>(`${base}/documents`)
      .then(setClientDocuments)
      .catch((err) => setError(errorMessage(err, "Unable to load documents")));
  }, [tab, base]);

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

      {/* ── OVERVIEW ── */}
      {tab === "overview" && portfolio ? (
        <div className="ui-client-chart__panel ui-stack">
          <div className="ui-client-chart__snapshot">
            <div className="ui-client-chart__vitals" role="group" aria-label="Body metrics">
              <button type="button" className="ui-client-chart__vital" onClick={() => openEvolution("WEIGHT")}>
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
              <button type="button" className="ui-client-chart__vital" onClick={() => openEvolution("HEIGHT")}>
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
              <button type="button" className="ui-client-chart__vital" onClick={() => openEvolution("BMI")}>
                <span className="ui-client-chart__metric-label">BMI</span>
                <span className="ui-client-chart__vital-value">{portfolio.bmi ?? "—"}</span>
              </button>
              <button
                type="button"
                className="ui-client-chart__vital ui-client-chart__vital--trend"
                onClick={() => openEvolution("WEIGHT")}
              >
                <span className="ui-client-chart__metric-label">Evolution</span>
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
              <button type="button" className="ui-client-chart__care-card" onClick={() => selectTab("goals")}>
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

          <Section title="Quick links">
            <div className="ui-client-chart__toolbar" style={{ flexWrap: "wrap" }}>
              {portfolio.quickLinks.map((link) => (
                <Button key={link.tab} variant="secondary" size="sm" onClick={() => selectTab(link.tab)}>
                  {link.label}
                </Button>
              ))}
            </div>
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

      {/* ── EVOLUTION ── */}
      {tab === "evolution" ? (
        <ClientEvolutionPanel
          base={base}
          allowManage={allowManage}
          onError={setError}
          initialMetric={searchParams.get("metric")}
          onMetricChange={(metric) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("tab", "evolution");
            params.set("metric", metric);
            router.replace(`/practice/${dietitianAccountId}/clients/${clientId}?${params.toString()}`, {
              scroll: false,
            });
          }}
        />
      ) : null}

      {/* ── PERSONAL ── */}
      {tab === "personal" && portfolio ? (
        <div className="ui-client-chart__panel ui-stack">
          <Section title="Identity & contact">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void api(base, {
                  method: "PATCH",
                  body: JSON.stringify({
                    firstName: clientForm.firstName,
                    lastName: clientForm.lastName,
                    displayName: clientForm.displayName || undefined,
                    email: clientForm.email || undefined,
                    phone: clientForm.phone || undefined,
                    dateOfBirth: clientForm.dateOfBirth || undefined,
                    sex: clientForm.sex || undefined,
                  }),
                })
                  .then(() => loadPortfolio())
                  .catch((err) => setError(errorMessage(err, "Unable to save client")));
              }}
            >
              <div className="ui-client-chart__form-grid">
                <Field label="First name">
                  <Input
                    value={clientForm.firstName}
                    onChange={(event) => setClientForm({ ...clientForm, firstName: event.target.value })}
                    required
                  />
                </Field>
                <Field label="Last name">
                  <Input
                    value={clientForm.lastName}
                    onChange={(event) => setClientForm({ ...clientForm, lastName: event.target.value })}
                    required
                  />
                </Field>
                <Field label="Display name">
                  <Input
                    value={clientForm.displayName}
                    onChange={(event) => setClientForm({ ...clientForm, displayName: event.target.value })}
                  />
                </Field>
                <Field label="Email">
                  <Input
                    type="email"
                    value={clientForm.email}
                    onChange={(event) => setClientForm({ ...clientForm, email: event.target.value })}
                  />
                </Field>
                <Field label="Phone">
                  <Input
                    type="tel"
                    value={clientForm.phone}
                    onChange={(event) => setClientForm({ ...clientForm, phone: event.target.value })}
                    placeholder="+961 71 123 456"
                  />
                </Field>
                <Field label="Date of birth">
                  <Input
                    type="date"
                    value={clientForm.dateOfBirth}
                    onChange={(event) => setClientForm({ ...clientForm, dateOfBirth: event.target.value })}
                  />
                </Field>
                <Field label="Sex">
                  <Select
                    value={clientForm.sex}
                    onChange={(event) => setClientForm({ ...clientForm, sex: event.target.value })}
                  >
                    <option value="FEMALE">Female</option>
                    <option value="MALE">Male</option>
                    <option value="OTHER">Other</option>
                    <option value="UNSPECIFIED">Unspecified</option>
                  </Select>
                </Field>
              </div>
              <Button type="submit" size="sm" variant="secondary" disabled={!allowManage}>
                Save identity
              </Button>
            </form>
          </Section>

          <Section title="Nutrition profile">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void api(`${base}/profile`, {
                  method: "PATCH",
                  body: JSON.stringify(profileForm),
                })
                  .then(() => loadPortfolio())
                  .catch((err) => setError(errorMessage(err, "Unable to save profile")));
              }}
            >
              <div className="ui-client-chart__form-grid">
                {(
                  [
                    ["nutritionContext", "Nutrition context"],
                    ["preferences", "Preferences"],
                    ["dietaryPreferences", "Dietary preferences"],
                    ["allergies", "Allergies"],
                    ["intolerances", "Intolerances"],
                    ["lifestyle", "Lifestyle"],
                    ["notes", "Notes"],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <Textarea
                      value={profileForm[key]}
                      onChange={(event) => setProfileForm({ ...profileForm, [key]: event.target.value })}
                      style={{ minHeight: 80 }}
                    />
                  </Field>
                ))}
                <Field label="Emergency contact name">
                  <Input
                    value={profileForm.emergencyContactName}
                    onChange={(event) =>
                      setProfileForm({ ...profileForm, emergencyContactName: event.target.value })
                    }
                  />
                </Field>
                <Field label="Emergency contact phone">
                  <Input
                    value={profileForm.emergencyContactPhone}
                    onChange={(event) =>
                      setProfileForm({ ...profileForm, emergencyContactPhone: event.target.value })
                    }
                  />
                </Field>
              </div>
              <Button type="submit" size="sm" variant="secondary" disabled={!allowManage}>
                Save profile
              </Button>
            </form>
          </Section>

          <Section title="Tags">
            <div className="ui-client-tags">
              <ClinicTagsManager
                dietitianAccountId={dietitianAccountId}
                tags={orgTags}
                disabled={!allowManage}
                compact
                onChange={(next) => {
                  setOrgTags(next);
                  setSelectedTagIds((prev) => prev.filter((id) => next.some((tag) => tag.id === id)));
                  void loadPortfolio();
                }}
              />
              {orgTags.length > 0 ? (
                <form
                  className="ui-client-tags__assign"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void api(`${orgBase}/clients/${clientId}/tags`, {
                      method: "PUT",
                      body: JSON.stringify({ tagIds: selectedTagIds }),
                    })
                      .then(() => loadPortfolio())
                      .catch((err) => setError(errorMessage(err, "Unable to save tags")));
                  }}
                >
                  <p className="ui-client-tags__assign-label">Assigned to this client</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
                    {orgTags.map((tag) => (
                      <Checkbox
                        key={tag.id}
                        label={tag.name}
                        checked={selectedTagIds.includes(tag.id)}
                        disabled={!allowManage}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelectedTagIds((prev) =>
                            checked ? [...prev, tag.id] : prev.filter((id) => id !== tag.id),
                          );
                        }}
                      />
                    ))}
                  </div>
                  <Button type="submit" size="sm" variant="secondary" disabled={!allowManage}>
                    Save tags
                  </Button>
                </form>
              ) : null}
            </div>
          </Section>

          <Section
            title="Measurements"
            actions={
              <form
                className="ui-client-chart__toolbar"
                onSubmit={(event) => {
                  event.preventDefault();
                  void api(`${base}/measurements`, {
                    method: "POST",
                    body: JSON.stringify({
                      type: "WEIGHT",
                      value: Number(weight),
                      unit: "kg",
                      measuredAt: new Date().toISOString(),
                    }),
                  })
                    .then(() => {
                      setWeight("");
                      return Promise.all([loadMeasurements(), loadPortfolio()]);
                    })
                    .catch((err) => setError(errorMessage(err, "Unable to record measurement")));
                }}
              >
                <Input
                  type="number"
                  step="0.1"
                  value={weight}
                  onChange={(event) => setWeight(event.target.value)}
                  placeholder="Weight (kg)"
                  required
                  style={{ width: 130 }}
                  disabled={!allowManage}
                />
                <Button type="submit" size="sm" variant="secondary" disabled={!allowManage}>
                  Record
                </Button>
              </form>
            }
          >
            {measurements.length === 0 ? (
              <EmptyState title="No measurements yet" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Value</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {measurements.map((row) => (
                    <tr key={row.id}>
                      <Td label="Type">{humanizeLabel(row.type)}</Td>
                      <Td label="Value">
                        {row.value} {row.unit}
                      </Td>
                      <Td label="Date">{formatDate(row.measuredAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Section>
        </div>
      ) : null}

      {/* ── ASSESSMENTS ── */}
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

      {/* ── GOALS ── */}
      {tab === "goals" ? (
        <div className="ui-client-chart__panel ui-stack">
          <Section title="Add goal">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void api(`${base}/goals`, {
                  method: "POST",
                  body: JSON.stringify({
                    title: goalTitle,
                    description: goalDescription || undefined,
                  }),
                })
                  .then(() => {
                    setGoalTitle("");
                    setGoalDescription("");
                    return Promise.all([loadGoals(), loadPortfolio()]);
                  })
                  .catch((err) => setError(errorMessage(err, "Unable to add goal")));
              }}
            >
              <div className="ui-client-chart__form-grid">
                <Field label="Title">
                  <Input
                    value={goalTitle}
                    onChange={(event) => setGoalTitle(event.target.value)}
                    placeholder="New goal…"
                    required
                    disabled={!allowManage}
                  />
                </Field>
                <Field label="Description">
                  <Textarea
                    value={goalDescription}
                    onChange={(event) => setGoalDescription(event.target.value)}
                    style={{ minHeight: 80 }}
                    disabled={!allowManage}
                  />
                </Field>
              </div>
              <Button type="submit" size="sm" variant="secondary" disabled={!allowManage || !goalTitle.trim()}>
                Add goal
              </Button>
            </form>
          </Section>

          <Section title="Goals">
            {goals.length === 0 ? (
              <EmptyState title="No goals yet" />
            ) : (
              <ul className="ui-client-chart__list">
                {goals.map((goal) => (
                  <li key={goal.id} style={{ alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{goal.title}</div>
                      {goal.description ? <div className="ui-hint">{goal.description}</div> : null}
                      {goal.targetValue != null ? (
                        <div className="ui-hint">
                          Target: {goal.targetValue}
                          {goal.targetUnit ? ` ${goal.targetUnit}` : ""}
                          {goal.targetDate ? ` by ${goal.targetDate}` : ""}
                        </div>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <StatusBadge status={goal.status} label={humanizeLabel(goal.status)} />
                      {goal.status === "ACTIVE" && allowManage ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              void api(`${base}/goals/${goal.id}/complete`, { method: "POST" })
                                .then(() => Promise.all([loadGoals(), loadPortfolio()]))
                                .catch((err) => setError(errorMessage(err, "Unable to complete goal")));
                            }}
                          >
                            Complete
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              void api(`${base}/goals/${goal.id}/cancel`, { method: "POST" })
                                .then(() => Promise.all([loadGoals(), loadPortfolio()]))
                                .catch((err) => setError(errorMessage(err, "Unable to cancel goal")));
                            }}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
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
          />
        </div>
      ) : null}

      {/* ── MESSAGES (opens inbox) ── */}
      {tab === "messages" ? (
        <div className="ui-client-chart__panel">
          <LoadingState>Opening client chat…</LoadingState>
        </div>
      ) : null}

      {/* ── DOCUMENTS ── */}
      {tab === "documents" ? (
        <div className="ui-client-chart__panel">
          <DocumentsLibrary
            variant="clinic"
            documents={clientDocuments}
            uploading={documentsUploading}
            downloadingId={documentsDownloadingId}
            onUpload={async (file, visibility) => {
              setDocumentsUploading(true);
              setError(null);
              try {
                const body = new FormData();
                body.append("file", file);
                body.append("visibility", visibility);
                const res = await fetch(apiUrl(`${base}/documents`), {
                  method: "POST",
                  body,
                  credentials: "include",
                });
                if (!res.ok) {
                  throw new Error(res.status === 413 ? "File exceeds the 20 MB limit" : "Upload failed");
                }
                setClientDocuments(await api<DocumentsLibraryItem[]>(`${base}/documents`));
              } catch (err) {
                setError(errorMessage(err, "Unable to upload document"));
                throw err;
              } finally {
                setDocumentsUploading(false);
              }
            }}
            onDownload={async (doc) => {
              setDocumentsDownloadingId(doc.id);
              setError(null);
              try {
                await downloadAuthenticatedFile(
                  apiUrl(`${base}/documents/${doc.id}/download`),
                  doc.filename,
                );
              } catch (err) {
                setError(errorMessage(err, "Unable to download document"));
              } finally {
                setDocumentsDownloadingId(null);
              }
            }}
          />
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
            hasMore={timelineHasMore}
            onLoadMore={() => {
              const last = timeline[timeline.length - 1];
              if (!last) return;
              void loadTimeline(last.occurredAt).catch((err) =>
                setError(errorMessage(err, "Unable to load more timeline")),
              );
            }}
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
          title="Reconnect portal"
          description="Use this only for an existing chart. New clients create their own account and join with the clinic code from the Clients page."
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
