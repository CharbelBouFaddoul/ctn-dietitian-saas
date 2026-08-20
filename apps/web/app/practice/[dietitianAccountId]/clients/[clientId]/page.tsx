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
  EmptyState,
  Field,
  Input,
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
import { JoinCodePanel } from "../../../../../components/join-code-panel";
import { ClientAssessmentsPanel } from "../../../../../components/client-assessments-panel";
import { ClientEvolutionPanel } from "../../../../../components/client-evolution-panel";
import { api, apiUrl } from "../../../../../lib/api";
import { formatDate, formatMoney, nutritionLabel } from "../../../../../lib/format";
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

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "evolution", label: "Evolution" },
  { id: "assessments", label: "Assessments" },
  { id: "meal-plan", label: "Meal Plans" },
  { id: "tracking", label: "Tracking" },
  { id: "documents", label: "Documents" },
  { id: "messages", label: "Messages" },
  { id: "appointments", label: "Appointments" },
  { id: "personal", label: "Personal" },
  { id: "goals", label: "Goals" },
  { id: "timeline", label: "Timeline" },
  { id: "invoices", label: "Invoices" },
  { id: "ai", label: "AI" },
  { id: "portal", label: "Portal" },
];

function isTab(value: string | null): value is Tab {
  return tabs.some((item) => item.id === value);
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
  const base = `/api/v1/dietitian/${dietitianAccountId}/clients/${clientId}`;
  const orgBase = `/api/v1/dietitian/${dietitianAccountId}`;
  const tabFromQuery = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(isTab(tabFromQuery) ? tabFromQuery : "overview");

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
    food: { presented: { energyKcal: number | null; proteinG: number | null } };
    water: { totalLiters: number };
    exercise: { totalDurationMinutes: number };
  } | null>(null);
  const [trackingFood, setTrackingFood] = useState<
    Array<{ id: string; foodName: string; quantity: number; unit: string; presented: { energyKcal: number | null } }>
  >([]);
  const [trackingDate, setTrackingDate] = useState("");

  const [chatMessages, setChatMessages] = useState<Array<{ id: string; body: string; createdAt: string }>>([]);
  const [messageBody, setMessageBody] = useState("");

  const [clientDocuments, setClientDocuments] = useState<Array<{ id: string; filename: string; visibility: string }>>([]);
  const [clientInvoices, setClientInvoices] = useState<
    Array<{ id: string; invoiceNumber: string | null; status: string; dueDate: string | null; total: number; currency: string }>
  >([]);

  const [appointments, setAppointments] = useState<Array<{ id: string; title: string; startAt: string; status: string }>>([]);
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
  } | null>(null);
  const [plainJoinCode, setPlainJoinCode] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  function selectTab(next: string) {
    const value = isTab(next) ? next : "overview";
    setTab(value);
    router.replace(`/practice/${dietitianAccountId}/clients/${clientId}?tab=${value}`, { scroll: false });
  }

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
    void Promise.all([
      api<NonNullable<typeof trackingSummary>>(`${base}/tracking/summary${query}`),
      api<typeof trackingFood>(`${base}/tracking/food-logs${query}`),
    ])
      .then(([summary, foods]) => {
        setTrackingSummary(summary);
        if (!trackingDate) setTrackingDate(summary.date);
        setTrackingFood(foods);
      })
      .catch((err) => setError(errorMessage(err, "Unable to load tracking")));
  }, [tab, trackingDate, base]);

  useEffect(() => {
    if (tab !== "messages") return;
    void api<typeof chatMessages>(`${base}/conversation/messages`)
      .then((messages) => {
        setChatMessages(messages);
        return api(`${base}/conversation/read`, { method: "POST", body: JSON.stringify({}) });
      })
      .catch((err) => setError(errorMessage(err, "Unable to load messages")));
  }, [tab, base]);

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

      <div className="ui-client-chart__tabs">
        <Tabs items={tabs} value={tab} onChange={selectTab} />
      </div>

      {error ? (
        <div style={{ margin: "0 0 12px" }}>
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      {/* ── OVERVIEW ── */}
      {tab === "overview" && portfolio ? (
        <div className="ui-client-chart__panel ui-stack">
          <div className="ui-client-chart__metrics">
            <div className="ui-client-chart__metric">
              <span className="ui-client-chart__metric-label">Weight</span>
              <span className="ui-client-chart__metric-value">
                {weightMeasurement ? `${weightMeasurement.value} ${weightMeasurement.unit}` : "—"}
              </span>
            </div>
            <div className="ui-client-chart__metric">
              <span className="ui-client-chart__metric-label">Height</span>
              <span className="ui-client-chart__metric-value">
                {heightMeasurement ? `${heightMeasurement.value} ${heightMeasurement.unit}` : "—"}
              </span>
            </div>
            <div className="ui-client-chart__metric">
              <span className="ui-client-chart__metric-label">BMI</span>
              <span className="ui-client-chart__metric-value">{portfolio.bmi ?? "—"}</span>
            </div>
            <div className="ui-client-chart__metric">
              <span className="ui-client-chart__metric-label">Primary goal</span>
              <span className="ui-client-chart__metric-value">
                {portfolio.primaryGoal?.title ?? "—"}
                {portfolio.activeGoalsCount > 0 ? (
                  <span className="ui-muted"> ({portfolio.activeGoalsCount} active)</span>
                ) : null}
              </span>
            </div>
            <div className="ui-client-chart__metric">
              <span className="ui-client-chart__metric-label">Latest assessment</span>
              <span className="ui-client-chart__metric-value">
                {portfolio.latestAssessment
                  ? `${portfolio.latestAssessment.templateName} · ${humanizeLabel(portfolio.latestAssessment.status)}`
                  : "—"}
              </span>
            </div>
            <div className="ui-client-chart__metric">
              <span className="ui-client-chart__metric-label">Meal plan</span>
              <span className="ui-client-chart__metric-value">
                {portfolio.activeMealPlan
                  ? `${portfolio.activeMealPlan.name}${
                      portfolio.activeMealPlan.publishedVersion
                        ? ` · v${portfolio.activeMealPlan.publishedVersion.versionNumber}`
                        : ""
                    }`
                  : "—"}
              </span>
            </div>
            <div className="ui-client-chart__metric">
              <span className="ui-client-chart__metric-label">Upcoming appointment</span>
              <span className="ui-client-chart__metric-value">
                {portfolio.upcomingAppointment
                  ? `${portfolio.upcomingAppointment.title} · ${formatDate(portfolio.upcomingAppointment.startAt)}`
                  : "—"}
              </span>
            </div>
            <div className="ui-client-chart__metric">
              <span className="ui-client-chart__metric-label">Unread messages</span>
              <span className="ui-client-chart__metric-value">{portfolio.recentMessages.unreadCount}</span>
            </div>
            <div className="ui-client-chart__metric">
              <span className="ui-client-chart__metric-label">Evolution</span>
              <span className="ui-client-chart__metric-value">
                {portfolio.evolutionSummary
                  ? `Δ weight ${portfolio.evolutionSummary.weightDelta ?? "—"} ${
                      portfolio.evolutionSummary.weightUnit ?? ""
                    }`.trim()
                  : "Need 2+ weights"}
              </span>
              {portfolio.evolutionSummary?.bmiCurrent != null ? (
                <span className="ui-muted">
                  BMI {portfolio.evolutionSummary.bmiBaseline ?? "—"} → {portfolio.evolutionSummary.bmiCurrent}
                </span>
              ) : null}
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
                <Button variant="danger" onClick={() => setConfirmArchive(true)}>
                  Archive client
                </Button>
              </div>
            </Section>
          ) : null}
        </div>
      ) : null}

      {/* ── EVOLUTION ── */}
      {tab === "evolution" ? (
        <ClientEvolutionPanel base={base} allowManage={allowManage} onError={setError} />
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
                    value={clientForm.phone}
                    onChange={(event) => setClientForm({ ...clientForm, phone: event.target.value })}
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
              <Button type="submit" disabled={!allowManage}>
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
              <Button type="submit" disabled={!allowManage}>
                Save profile
              </Button>
            </form>
          </Section>

          <Section title="Tags">
            {orgTags.length === 0 ? (
              <EmptyState title="No practice tags yet" />
            ) : (
              <form
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
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
                  {orgTags.map((tag) => (
                    <Checkbox
                      key={tag.id}
                      label={tag.name}
                      checked={selectedTagIds.includes(tag.id)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setSelectedTagIds((prev) =>
                          checked ? [...prev, tag.id] : prev.filter((id) => id !== tag.id),
                        );
                      }}
                    />
                  ))}
                </div>
                <Button type="submit" disabled={!allowManage}>
                  Save tags
                </Button>
              </form>
            )}
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
                <Button type="submit" size="sm" disabled={!allowManage}>
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
              <Button type="submit" disabled={!allowManage || !goalTitle.trim()}>
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
                            variant="danger"
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
                <Link href={`/practice/${dietitianAccountId}/meal-plans`} className="ui-btn ui-btn--primary">
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
          <Section title="Tracking day">
            <div className="ui-client-chart__toolbar">
              <Field label="Date">
                <Input type="date" value={trackingDate} onChange={(event) => setTrackingDate(event.target.value)} />
              </Field>
            </div>
          </Section>

          {trackingSummary ? (
            <>
              <div className="ui-client-chart__metrics">
                <div className="ui-client-chart__metric">
                  <span className="ui-client-chart__metric-label">Calories</span>
                  <span className="ui-client-chart__metric-value">
                    {nutritionLabel(trackingSummary.food.presented.energyKcal, "kcal")}
                  </span>
                </div>
                <div className="ui-client-chart__metric">
                  <span className="ui-client-chart__metric-label">Protein</span>
                  <span className="ui-client-chart__metric-value">
                    {nutritionLabel(trackingSummary.food.presented.proteinG, "g")}
                  </span>
                </div>
                <div className="ui-client-chart__metric">
                  <span className="ui-client-chart__metric-label">Water</span>
                  <span className="ui-client-chart__metric-value">
                    {trackingSummary.water.totalLiters.toFixed(1)} L
                  </span>
                </div>
                <div className="ui-client-chart__metric">
                  <span className="ui-client-chart__metric-label">Exercise</span>
                  <span className="ui-client-chart__metric-value">
                    {trackingSummary.exercise.totalDurationMinutes} min
                  </span>
                </div>
              </div>

              {trackingFood.length > 0 ? (
                <Section title="Food log">
                  <Table>
                    <thead>
                      <tr>
                        <th>Food</th>
                        <th>Quantity</th>
                        <th>Calories</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trackingFood.map((row) => (
                        <tr key={row.id}>
                          <Td label="Food">{row.foodName}</Td>
                          <Td label="Quantity">
                            {row.quantity} {humanizeLabel(row.unit)}
                          </Td>
                          <Td label="Calories">
                            {row.presented.energyKcal != null ? `${row.presented.energyKcal} kcal` : "—"}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Section>
              ) : (
                <EmptyState title="No food logged for this day" />
              )}
            </>
          ) : (
            <div className="ui-client-chart__metrics">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} style={{ height: 76, borderRadius: 14 }} />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* ── MESSAGES ── */}
      {tab === "messages" ? (
        <div className="ui-client-chart__panel ui-stack">
          <Section title="Conversation">
            <div className="ui-client-chart__chat">
              {chatMessages.length === 0 ? (
                <EmptyState title="No messages yet" />
              ) : (
                chatMessages.map((message) => (
                  <div key={message.id} className="ui-client-chart__bubble">
                    <div className="ui-client-chart__bubble-body">{message.body}</div>
                    <div className="ui-hint">{formatDate(message.createdAt)}</div>
                  </div>
                ))
              )}
            </div>
          </Section>
          <Section title="New message">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void api(`${base}/conversation/messages`, {
                  method: "POST",
                  body: JSON.stringify({ body: messageBody }),
                })
                  .then(() => {
                    setMessageBody("");
                    return api<typeof chatMessages>(`${base}/conversation/messages`);
                  })
                  .then(setChatMessages)
                  .catch((err) => setError(errorMessage(err, "Unable to send message")));
              }}
            >
              <Field label="Message">
                <Textarea
                  value={messageBody}
                  onChange={(event) => setMessageBody(event.target.value)}
                  placeholder="Type a message to the client…"
                  style={{ minHeight: 100 }}
                />
              </Field>
              <Button type="submit" disabled={!messageBody.trim()}>
                Send message
              </Button>
            </form>
          </Section>
        </div>
      ) : null}

      {/* ── DOCUMENTS ── */}
      {tab === "documents" ? (
        <div className="ui-client-chart__panel ui-stack">
          <Section title="Upload document">
            <form
              className="ui-client-chart__toolbar"
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const fileInput = form.elements.namedItem("file") as HTMLInputElement;
                const visibilityInput = form.elements.namedItem("visibility") as HTMLSelectElement;
                const file = fileInput.files?.[0];
                if (!file) return;
                const body = new FormData();
                body.append("file", file);
                body.append("visibility", visibilityInput.value);
                void fetch(apiUrl(`${base}/documents`), { method: "POST", body, credentials: "include" })
                  .then((res) => {
                    if (!res.ok) throw new Error("Upload failed");
                    fileInput.value = "";
                    return api<typeof clientDocuments>(`${base}/documents`).then(setClientDocuments);
                  })
                  .catch((err) => setError(errorMessage(err, "Unable to upload document")));
              }}
            >
              <input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx" style={{ flex: 1 }} />
              <Select name="visibility" defaultValue="INTERNAL" style={{ width: "auto" }}>
                <option value="INTERNAL">Internal only</option>
                <option value="SHARED">Shared with client</option>
              </Select>
              <Button type="submit">Upload</Button>
            </form>
          </Section>

          <Section title="Documents">
            {clientDocuments.length === 0 ? (
              <EmptyState title="No documents yet" />
            ) : (
              <ul className="ui-client-chart__list">
                {clientDocuments.map((doc) => (
                  <li key={doc.id}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ fontWeight: 500 }}>{doc.filename}</span>
                      <a
                        href={apiUrl(`${base}/documents/${doc.id}/download`)}
                        className="ui-link"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download
                      </a>
                    </div>
                    <Badge tone={doc.visibility === "SHARED" ? "info" : "neutral"}>
                      {humanizeLabel(doc.visibility)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Section>
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
              <Button type="submit">Schedule</Button>
            </form>
          </Section>

          <Section title="Appointments">
            {appointments.length === 0 ? (
              <EmptyState title="No appointments yet" />
            ) : (
              <ul className="ui-client-chart__list">
                {appointments.map((row) => (
                  <li key={row.id}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{row.title}</div>
                      <div className="ui-hint">{formatDate(row.startAt)}</div>
                    </div>
                    <StatusBadge status={row.status} label={humanizeLabel(row.status)} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      ) : null}

      {/* ── TIMELINE ── */}
      {tab === "timeline" ? (
        <div className="ui-client-chart__panel ui-stack">
          <Section title="Clinical notes">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void api(`${base}/profile`, {
                  method: "PATCH",
                  body: JSON.stringify({ notes: timelineNotes }),
                })
                  .then(() => loadPortfolio())
                  .catch((err) => setError(errorMessage(err, "Unable to save notes")));
              }}
            >
              <Field label="Notes">
                <Textarea
                  value={timelineNotes}
                  onChange={(event) => setTimelineNotes(event.target.value)}
                  style={{ minHeight: 120 }}
                  disabled={!allowManage}
                />
              </Field>
              <Button type="submit" disabled={!allowManage}>
                Save notes
              </Button>
            </form>
          </Section>

          <Section title="Timeline">
            {timeline.length === 0 && !timelineLoading ? (
              <EmptyState title="No timeline events yet" />
            ) : (
              <>
                <ul className="ui-client-chart__list">
                  {timeline.map((row) => (
                    <li key={row.id}>
                      <span>{activityLabel(row.type)}</span>
                      <span className="ui-muted">{formatDate(row.occurredAt)}</span>
                    </li>
                  ))}
                </ul>
                {timelineHasMore ? (
                  <div style={{ marginTop: 12 }}>
                    <Button
                      variant="secondary"
                      disabled={timelineLoading}
                      onClick={() => {
                        const last = timeline[timeline.length - 1];
                        if (!last) return;
                        void loadTimeline(last.occurredAt).catch((err) =>
                          setError(errorMessage(err, "Unable to load more timeline")),
                        );
                      }}
                    >
                      {timelineLoading ? "Loading…" : "Load more"}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </Section>
        </div>
      ) : null}

      {/* ── AI ── */}
      {tab === "ai" ? (
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
          description="Use this only for an existing chart. New clients create their own account and join with the practice code from the Clients page."
          connectionStatus={connectionStatus}
          plainJoinCode={plainJoinCode}
          hint={portalAccount?.joinCode?.hint ?? null}
          expiresAt={portalAccount?.joinCode?.expiresAt ?? null}
          allowManage={allowManage}
          portalBusy={portalBusy}
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
        />
      ) : null}

      <ConfirmDialog
        open={confirmArchive}
        title="Archive this client?"
        description="The chart stays in the practice but is no longer active."
        confirmLabel="Archive"
        danger
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
        danger
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
        title="Deactivate this portal connection?"
        confirmLabel="Deactivate"
        danger
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
