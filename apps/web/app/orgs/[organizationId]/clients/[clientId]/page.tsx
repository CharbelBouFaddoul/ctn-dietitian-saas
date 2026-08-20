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
import { api, apiUrl } from "../../../../../lib/api";
import { formatDate, formatMoney, nutritionLabel } from "../../../../../lib/format";
import { errorMessage } from "../../../../../lib/humanize-error";
import { canManageClients } from "../../../../../lib/practice-access";
import { portalStatusLabel, statusLabel, activityLabel } from "../../../../../lib/practice-labels";
import { usePractice } from "../../practice-shell";

type Tab =
  | "overview"
  | "assessments"
  | "meal-plan"
  | "tracking"
  | "messages"
  | "documents"
  | "invoices"
  | "appointments"
  | "ai"
  | "portal";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "assessments", label: "Assessments" },
  { id: "meal-plan", label: "Meal Plan" },
  { id: "tracking", label: "Tracking" },
  { id: "messages", label: "Messages" },
  { id: "documents", label: "Documents" },
  { id: "invoices", label: "Invoices" },
  { id: "appointments", label: "Appointments" },
  { id: "ai", label: "AI" },
  { id: "portal", label: "Portal" },
];

function isTab(value: string | null): value is Tab {
  return tabs.some((item) => item.id === value);
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
  const params = useParams<{ organizationId: string; clientId: string }>();
  const { organizationId, clientId } = params;
  const searchParams = useSearchParams();
  const router = useRouter();
  const practice = usePractice();
  const allowManage = canManageClients(practice.role);
  const base = `/api/v1/organizations/${organizationId}/clients/${clientId}`;
  const tabFromQuery = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(isTab(tabFromQuery) ? tabFromQuery : "overview");
  const [client, setClient] = useState<{
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    status: string;
    connectionStatus?: string | null;
    assignments: Array<{ email: string; active: boolean }>;
    tags: Array<{ id: string; name: string }>;
  } | null>(null);
  const [profile, setProfile] = useState<Record<string, string | null> | null>(null);
  const [goals, setGoals] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [measurements, setMeasurements] = useState<Array<{ id: string; type: string; value: number; unit: string; measuredAt: string }>>([]);
  const [assessments, setAssessments] = useState<Array<{ id: string; status: string; templateName: string; templateVersion: number }>>([]);
  const [appointments, setAppointments] = useState<Array<{ id: string; title: string; startAt: string; status: string }>>([]);
  const [timeline, setTimeline] = useState<Array<{ id: string; type: string; occurredAt: string }>>([]);
  const [, setTags] = useState<Array<{ id: string; name: string }>>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; version: number }>>([]);
  const [members, setMembers] = useState<Array<{ id: string; email: string }>>([]);
  const [plans, setPlans] = useState<Array<{ id: string; name: string; status: string; client: { id: string } }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [goalTitle, setGoalTitle] = useState("");
  const [weight, setWeight] = useState("");
  const [appointmentTitle, setAppointmentTitle] = useState("Consultation");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [trackingSummary, setTrackingSummary] = useState<{
    date: string;
    food: { presented: { energyKcal: number | null; proteinG: number | null } };
    water: { totalLiters: number };
    exercise: { totalDurationMinutes: number };
  } | null>(null);
  const [trackingFood, setTrackingFood] = useState<Array<{ id: string; foodName: string; quantity: number; unit: string; presented: { energyKcal: number | null } }>>([]);
  const [trackingDate, setTrackingDate] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; body: string; createdAt: string }>>([]);
  const [messageBody, setMessageBody] = useState("");
  const [clientDocuments, setClientDocuments] = useState<Array<{ id: string; filename: string; visibility: string }>>([]);
  const [clientInvoices, setClientInvoices] = useState<Array<{ id: string; invoiceNumber: string | null; status: string; dueDate: string | null; total: number; currency: string }>>([]);
  const [portalAccount, setPortalAccount] = useState<{ connectionStatus: string; joinCode: { expiresAt: string; hint: string | null } | null } | null>(null);
  const [plainJoinCode, setPlainJoinCode] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  function selectTab(next: string) {
    const value = isTab(next) ? next : "overview";
    setTab(value);
    router.replace(`/orgs/${organizationId}/clients/${clientId}?tab=${value}`, { scroll: false });
  }

  async function load() {
    setError(null);
    try {
      const [detail, account, profileRow, goalRows, measurementRows, assessmentRows, appointmentRows, timelineRows, tagRows, templateRows, memberRows, planRows] =
        await Promise.all([
          api<NonNullable<typeof client>>(base),
          api<NonNullable<typeof portalAccount>>(`${base}/account`),
          api<Record<string, string | null>>(`${base}/profile`),
          api<typeof goals>(`${base}/goals`),
          api<typeof measurements>(`${base}/measurements`),
          api<typeof assessments>(`${base}/assessments`),
          api<typeof appointments>(`${base}/appointments`),
          api<typeof timeline>(`${base}/timeline`),
          api<Array<{ id: string; name: string }>>(`/api/v1/organizations/${organizationId}/tags`),
          api<typeof templates>(`/api/v1/organizations/${organizationId}/assessment-templates`),
          api<Array<{ id: string; email: string; status: string }>>(`/api/v1/organizations/${organizationId}/members`),
          api<{ items: typeof plans }>(`/api/v1/organizations/${organizationId}/meal-plans`),
        ]);
      setClient(detail);
      setPortalAccount(account);
      setProfile(profileRow);
      setGoals(goalRows);
      setMeasurements(measurementRows);
      setAssessments(assessmentRows);
      setAppointments(appointmentRows);
      setTimeline(timelineRows);
      setTags(tagRows);
      setTemplates(templateRows);
      setMembers(memberRows.filter((row) => row.status === "ACTIVE"));
      setPlans(planRows.items.filter((plan) => plan.client.id === clientId));
      if (!templateId && templateRows[0]) setTemplateId(templateRows[0].id);
    } catch (err) {
      setError(errorMessage(err, "Unable to load client"));
    }
  }

  useEffect(() => {
    void load();
  }, [organizationId, clientId]);

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

  const name = client ? `${client.firstName} ${client.lastName}` : "Client";
  const connectionStatus = client?.connectionStatus ?? portalAccount?.connectionStatus;
  const activeAssignee = client?.assignments.find((row) => row.active)?.email;

  return (
    <section className="ui-client-chart">
      <Breadcrumbs
        items={[
          { label: "Clients", href: `/orgs/${organizationId}/clients` },
          { label: name },
        ]}
      />
      <PageHeader
        eyebrow="Client chart"
        title={name}
        description={
          client ? (
            <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <StatusBadge status={client.status} label={statusLabel(client.status)} />
              <StatusBadge status={connectionStatus ?? undefined} label={portalStatusLabel(connectionStatus)} />
              {client.email ? <span>{client.email}</span> : null}
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
      {tab === "overview" && client && profile ? (
        <div className="ui-client-chart__panel ui-stack">
          <div className="ui-client-chart__metrics">
            <div className="ui-client-chart__metric">
              <span className="ui-client-chart__metric-label">Status</span>
              <span className="ui-client-chart__metric-value">
                <StatusBadge status={client.status} label={statusLabel(client.status)} />
              </span>
            </div>
            <div className="ui-client-chart__metric">
              <span className="ui-client-chart__metric-label">Portal</span>
              <span className="ui-client-chart__metric-value">
                <StatusBadge status={connectionStatus ?? undefined} label={portalStatusLabel(connectionStatus)} />
              </span>
            </div>
            <div className="ui-client-chart__metric">
              <span className="ui-client-chart__metric-label">Assigned</span>
              <span className="ui-client-chart__metric-value">{activeAssignee ?? "—"}</span>
            </div>
            {client.phone ? (
              <div className="ui-client-chart__metric">
                <span className="ui-client-chart__metric-label">Phone</span>
                <span className="ui-client-chart__metric-value">{client.phone}</span>
              </div>
            ) : null}
            {client.tags.length > 0 ? (
              <div className="ui-client-chart__metric">
                <span className="ui-client-chart__metric-label">Tags</span>
                <span className="ui-client-chart__metric-value" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {client.tags.map((tag) => (
                    <Badge key={tag.id} tone="neutral">
                      {tag.name}
                    </Badge>
                  ))}
                </span>
              </div>
            ) : null}
          </div>

          {allowManage ? (
            <Section title="Chart management">
              <div className="ui-client-chart__toolbar">
                <form
                  className="ui-client-chart__toolbar"
                  style={{ flex: "1 1 18rem" }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void api(`${base}/assignments`, {
                      method: "POST",
                      body: JSON.stringify({ organizationMemberId: assignTo }),
                    }).then(() => load());
                  }}
                >
                  <Field label="Reassign to">
                    <Select value={assignTo} onChange={(event) => setAssignTo(event.target.value)} required>
                      <option value="">Select member…</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.email}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button type="submit" disabled={!assignTo}>
                    Assign
                  </Button>
                </form>
                {client.status === "ACTIVE" ? (
                  <Button variant="danger" onClick={() => setConfirmArchive(true)}>
                    Archive client
                  </Button>
                ) : null}
              </div>
            </Section>
          ) : null}

          <Section
            title="Goals"
            actions={
              <form
                className="ui-client-chart__toolbar"
                onSubmit={(event) => {
                  event.preventDefault();
                  void api(`${base}/goals`, { method: "POST", body: JSON.stringify({ title: goalTitle }) }).then(() => {
                    setGoalTitle("");
                    return load();
                  });
                }}
              >
                <Input
                  value={goalTitle}
                  onChange={(event) => setGoalTitle(event.target.value)}
                  placeholder="New goal…"
                  required
                />
                <Button type="submit" size="sm">
                  Add
                </Button>
              </form>
            }
          >
            {goals.length === 0 ? (
              <EmptyState title="No goals yet" />
            ) : (
              <ul className="ui-client-chart__list">
                {goals.map((goal) => (
                  <li key={goal.id}>
                    <span>{goal.title}</span>
                    <StatusBadge status={goal.status} label={humanizeLabel(goal.status)} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Dietary profile">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void api(`${base}/profile`, { method: "PATCH", body: JSON.stringify(profile) }).then(() => load());
              }}
            >
              <div className="ui-client-chart__form-grid">
                {(["allergies", "intolerances", "dietaryPreferences", "notes"] as const).map((key) => (
                  <Field key={key} label={humanizeLabel(key)}>
                    <Textarea
                      value={profile[key] ?? ""}
                      onChange={(event) => setProfile({ ...profile, [key]: event.target.value })}
                      style={{ minHeight: 80 }}
                    />
                  </Field>
                ))}
              </div>
              <Button type="submit">Save profile</Button>
            </form>
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
                  }).then(() => {
                    setWeight("");
                    return load();
                  });
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
                />
                <Button type="submit" size="sm">
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

          <Section title="Recent activity">
            {timeline.length === 0 ? (
              <EmptyState title="No activity yet" />
            ) : (
              <ul className="ui-client-chart__list">
                {timeline.slice(0, 20).map((row) => (
                  <li key={row.id}>
                    <span>{activityLabel(row.type)}</span>
                    <span className="ui-muted">{formatDate(row.occurredAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      ) : null}

      {/* ── ASSESSMENTS ── */}
      {tab === "assessments" ? (
        <div className="ui-client-chart__panel ui-stack">
          {templates.length > 0 ? (
            <Section title="Start an assessment">
              <form
                className="ui-client-chart__toolbar"
                onSubmit={(event) => {
                  event.preventDefault();
                  void api(`${base}/assessments`, { method: "POST", body: JSON.stringify({ templateId }) }).then(() => load());
                }}
              >
                <Field label="Template">
                  <Select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} (v{template.version})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button type="submit" disabled={!templateId}>
                  Start assessment
                </Button>
              </form>
            </Section>
          ) : null}

          <Section title="Assessments">
            {assessments.length === 0 ? (
              <EmptyState title="No assessments yet" />
            ) : (
              <ul className="ui-client-chart__list">
                {assessments.map((row) => (
                  <li key={row.id}>
                    <span>
                      {row.templateName} <span className="ui-muted">v{row.templateVersion}</span>
                    </span>
                    <StatusBadge status={row.status} label={humanizeLabel(row.status)} />
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
            <Link href={`/orgs/${organizationId}/meal-plans`} className="ui-btn ui-btn--secondary ui-btn--sm">
              All meal plans
            </Link>
          }
        >
          {plans.length === 0 ? (
            <EmptyState
              title="No meal plans for this client"
              action={
                <Link href={`/orgs/${organizationId}/meal-plans`} className="ui-btn ui-btn--primary">
                  Open meal plans
                </Link>
              }
            />
          ) : (
            <ul className="ui-client-chart__list">
              {plans.map((plan) => (
                <li key={plan.id}>
                  <Link href={`/orgs/${organizationId}/meal-plans/${plan.id}`} className="ui-link" style={{ fontWeight: 500 }}>
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
                  <span className="ui-client-chart__metric-value">{trackingSummary.water.totalLiters.toFixed(1)} L</span>
                </div>
                <div className="ui-client-chart__metric">
                  <span className="ui-client-chart__metric-label">Exercise</span>
                  <span className="ui-client-chart__metric-value">{trackingSummary.exercise.totalDurationMinutes} min</span>
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
                void api(`${base}/conversation/messages`, { method: "POST", body: JSON.stringify({ body: messageBody }) })
                  .then(() => {
                    setMessageBody("");
                    return api<typeof chatMessages>(`${base}/conversation/messages`);
                  })
                  .then(setChatMessages);
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
                void fetch(apiUrl(`${base}/documents`), { method: "POST", body, credentials: "include" }).then((res) => {
                  if (!res.ok) throw new Error("Upload failed");
                  fileInput.value = "";
                  return api<typeof clientDocuments>(`${base}/documents`).then(setClientDocuments);
                });
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
                    <span style={{ fontWeight: 500 }}>{doc.filename}</span>
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
                      <Link href={`/orgs/${organizationId}/invoices/${row.id}`} className="ui-link">
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
                }).then(() => load());
              }}
            >
              <div className="ui-client-chart__form-grid">
                <Field label="Title">
                  <Input value={appointmentTitle} onChange={(event) => setAppointmentTitle(event.target.value)} required />
                </Field>
                <Field label="Start">
                  <Input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} required />
                </Field>
                <Field label="End">
                  <Input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} required />
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

      {/* ── AI ── */}
      {tab === "ai" ? (
        <div className="ui-client-chart__ai">
          <AiPanel organizationId={organizationId} clientId={clientId} action="client-summary" title="Client summary" description="Concise overview from profile, goals, tracking, and meal-plan context." />
          <AiPanel organizationId={organizationId} clientId={clientId} action="meal-plan-assistance" title="Meal plan assistance" description="Suggestions only — review and apply manually in the meal-plan editor." />
          <AiPanel organizationId={organizationId} clientId={clientId} action="nutrition-assistance" title="Nutrition assistance" description="Explain foods using values from your food database." foodQuery />
          <AiPanel organizationId={organizationId} clientId={clientId} action="consultation-summary" title="Consultation summary" description="Draft summary and follow-up questions for your next visit." />
          <AiPanel organizationId={organizationId} clientId={clientId} action="message-draft" title="Message draft" description="Draft only — send manually from Messages when ready." />
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
            allowManage && connectionStatus === "connected"
              ? () => setConfirmDeactivate(true)
              : undefined
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
          void api(`${base}/archive`, { method: "POST" }).then(() => {
            setConfirmArchive(false);
            return load();
          });
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
