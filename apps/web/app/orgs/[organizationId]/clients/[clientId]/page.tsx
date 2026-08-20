"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Table,
  Tabs,
  Td,
  Textarea,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { AiPanel } from "../../../../../components/ai-panel";
import { JoinCodePanel } from "../../../../../components/join-code-panel";
import { api, apiUrl } from "../../../../../lib/api";
import { connectionStatusLabel } from "../../../../../lib/connection-status";
import { formatDate, formatMoney, nutritionLabel, statusTone } from "../../../../../lib/format";
import { errorMessage } from "../../../../../lib/humanize-error";
import { canManageClients } from "../../../../../lib/practice-access";
import { shortId } from "../../../../../lib/client-identity";
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
    <Suspense fallback={<p className="ui-muted">Loading client…</p>}>
      <ClientWorkspacePage />
    </Suspense>
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
  const [tags, setTags] = useState<Array<{ id: string; name: string }>>([]);
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
          api<typeof tags>(`/api/v1/organizations/${organizationId}/tags`),
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

  return (
    <section>
      <PageHeader
        eyebrow="Client workspace"
        title={name}
        description={`${client?.email ?? "No email"} · ${shortId(clientId)} · ${humanizeLabel(client?.status)} · ${connectionStatusLabel(client?.connectionStatus ?? portalAccount?.connectionStatus)}`}
      />
      <Tabs items={tabs} value={tab} onChange={selectTab} />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {tab === "overview" && client && profile ? (
        <div className="ui-stack">
          <Card title="Chart">
            <p>Assigned: {client.assignments.find((row) => row.active)?.email ?? "None"}</p>
            <p>Phone: {client.phone ?? "—"}</p>
            {allowManage ? (
              <form
                className="ui-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  void api(`${base}/assignments`, {
                    method: "POST",
                    body: JSON.stringify({ organizationMemberId: assignTo }),
                  }).then(() => load());
                }}
              >
                <Field label="Reassign">
                  <Select value={assignTo} onChange={(event) => setAssignTo(event.target.value)}>
                    <option value="">Select member</option>
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
            ) : null}
            {allowManage && client.status !== "ARCHIVED" ? (
              <Button variant="danger" onClick={() => setConfirmArchive(true)}>
                Archive client
              </Button>
            ) : null}
          </Card>
          <Card title="Profile">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void api(`${base}/profile`, { method: "PATCH", body: JSON.stringify(profile) }).then(() => load());
              }}
            >
              {(["allergies", "intolerances", "dietaryPreferences", "notes"] as const).map((key) => (
                <Field key={key} label={humanizeLabel(key)}>
                  <Textarea
                    value={profile[key] ?? ""}
                    onChange={(event) => setProfile({ ...profile, [key]: event.target.value })}
                  />
                </Field>
              ))}
              <Button type="submit">Save profile</Button>
            </form>
          </Card>
          <Card title="Goals">
            <form
              className="ui-row"
              onSubmit={(event) => {
                event.preventDefault();
                void api(`${base}/goals`, { method: "POST", body: JSON.stringify({ title: goalTitle }) }).then(() => {
                  setGoalTitle("");
                  return load();
                });
              }}
            >
              <Field label="Goal">
                <Input value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} required />
              </Field>
              <Button type="submit">Add</Button>
            </form>
            {goals.length === 0 ? <EmptyState title="No goals yet" /> : (
              <ul>
                {goals.map((goal) => (
                  <li key={goal.id}>
                    {goal.title} ({humanizeLabel(goal.status)})
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Measurements">
            <form
              className="ui-row"
              onSubmit={(event) => {
                event.preventDefault();
                void api(`${base}/measurements`, {
                  method: "POST",
                  body: JSON.stringify({ type: "WEIGHT", value: Number(weight), unit: "kg", measuredAt: new Date().toISOString() }),
                }).then(() => {
                  setWeight("");
                  return load();
                });
              }}
            >
              <Field label="Weight (kg)">
                <Input type="number" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} required />
              </Field>
              <Button type="submit">Record</Button>
            </form>
            {measurements.length === 0 ? <p className="ui-muted">No measurements yet.</p> : (
              <ul>
                {measurements.map((row) => (
                  <li key={row.id}>
                    {humanizeLabel(row.type)} {row.value} {row.unit} · {formatDate(row.measuredAt)}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Timeline">
            {timeline.length === 0 ? <p className="ui-muted">No activity yet.</p> : (
              <ul>
                {timeline.map((row) => (
                  <li key={row.id}>
                    {humanizeLabel(row.type)} · {formatDate(row.occurredAt)}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Tags">
            <p>{client.tags.map((tag) => tag.name).join(", ") || "No tags"}</p>
            <p className="ui-muted">{tags.length} tags in this practice.</p>
          </Card>
        </div>
      ) : null}

      {tab === "assessments" ? (
        <Card title="Assessments">
          <form
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
          {assessments.length === 0 ? <EmptyState title="No assessments yet" /> : (
            <ul>
              {assessments.map((row) => (
                <li key={row.id}>
                  {row.templateName} v{row.templateVersion} · {humanizeLabel(row.status)}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "meal-plan" ? (
        <Card title="Meal plans">
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
            <ul>
              {plans.map((plan) => (
                <li key={plan.id}>
                  <Link href={`/orgs/${organizationId}/meal-plans/${plan.id}`} className="ui-link">
                    {plan.name}
                  </Link>{" "}
                  · {humanizeLabel(plan.status)}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "tracking" ? (
        <Card title="Tracking">
          <Field label="Date">
            <Input type="date" value={trackingDate} onChange={(event) => setTrackingDate(event.target.value)} />
          </Field>
          {trackingSummary ? (
            <>
              <p>
                {nutritionLabel(trackingSummary.food.presented.energyKcal, "kcal")} · protein{" "}
                {nutritionLabel(trackingSummary.food.presented.proteinG, "g")} · water {trackingSummary.water.totalLiters.toFixed(1)} L
                · exercise {trackingSummary.exercise.totalDurationMinutes} min
              </p>
              <Table>
                <thead>
                  <tr>
                    <th>Food</th>
                    <th>Quantity</th>
                    <th>kcal</th>
                  </tr>
                </thead>
                <tbody>
                  {trackingFood.map((row) => (
                    <tr key={row.id}>
                      <Td label="Food">{row.foodName}</Td>
                      <Td label="Quantity">
                        {row.quantity} {humanizeLabel(row.unit)}
                      </Td>
                      <Td label="kcal">{row.presented.energyKcal ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          ) : (
            <p className="ui-muted">Loading tracking…</p>
          )}
        </Card>
      ) : null}

      {tab === "messages" ? (
        <Card title="Messages">
          <div className="ui-stack" style={{ marginBottom: 16 }}>
            {chatMessages.map((message) => (
              <div key={message.id} className="ui-card">
                <div>{message.body}</div>
                <div className="ui-hint">{formatDate(message.createdAt)}</div>
              </div>
            ))}
            {chatMessages.length === 0 ? <EmptyState title="No messages yet" /> : null}
          </div>
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
              <Textarea value={messageBody} onChange={(event) => setMessageBody(event.target.value)} />
            </Field>
            <Button type="submit">Send</Button>
          </form>
        </Card>
      ) : null}

      {tab === "documents" ? (
        <Card title="Documents">
          <form
            className="ui-row"
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
            <input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx" />
            <select name="visibility" defaultValue="INTERNAL" className="ui-select">
              <option value="INTERNAL">Internal</option>
              <option value="SHARED">Shared with client</option>
            </select>
            <Button type="submit">Upload</Button>
          </form>
          {clientDocuments.length === 0 ? <EmptyState title="No documents yet" /> : (
            <ul>
              {clientDocuments.map((doc) => (
                <li key={doc.id}>
                  {doc.filename} · {humanizeLabel(doc.visibility)}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "invoices" ? (
        <Card title="Invoices">
          {clientInvoices.length === 0 ? <EmptyState title="No invoices for this client" /> : (
            <Table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Status</th>
                  <th>Due</th>
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
                      <Badge tone={statusTone(row.status)}>{humanizeLabel(row.status)}</Badge>
                    </Td>
                    <Td label="Due">{row.dueDate ?? "—"}</Td>
                    <Td label="Total">{formatMoney(row.total, row.currency)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ) : null}

      {tab === "appointments" ? (
        <Card title="Appointments">
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
            <Field label="Title">
              <Input value={appointmentTitle} onChange={(event) => setAppointmentTitle(event.target.value)} required />
            </Field>
            <Field label="Start">
              <Input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} required />
            </Field>
            <Field label="End">
              <Input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} required />
            </Field>
            <Button type="submit">Schedule</Button>
          </form>
          {appointments.length === 0 ? <EmptyState title="No appointments yet" /> : (
            <ul>
              {appointments.map((row) => (
                <li key={row.id}>
                  {row.title} · {humanizeLabel(row.status)} · {formatDate(row.startAt)}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "ai" ? (
        <div className="ui-stack">
          <AiPanel organizationId={organizationId} clientId={clientId} action="client-summary" title="Client summary" description="Concise overview from profile, goals, tracking, and meal-plan context." />
          <AiPanel organizationId={organizationId} clientId={clientId} action="meal-plan-assistance" title="Meal plan assistance" description="Suggestions only — review and apply manually in the meal-plan editor." />
          <AiPanel organizationId={organizationId} clientId={clientId} action="nutrition-assistance" title="Nutrition assistance" description="Explain foods using values from your food database." foodQuery />
          <AiPanel organizationId={organizationId} clientId={clientId} action="consultation-summary" title="Consultation summary" description="Draft summary and follow-up questions for your next visit." />
          <AiPanel organizationId={organizationId} clientId={clientId} action="message-draft" title="Message draft" description="Draft only — send manually from Messages when ready." />
        </div>
      ) : null}

      {tab === "portal" ? (
        <JoinCodePanel
          title="Reconnect portal"
          description="Use this only for an existing chart. New clients create their own account and join with the practice code from the Clients page."
          connectionStatus={client?.connectionStatus ?? portalAccount?.connectionStatus}
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
            allowManage && (client?.connectionStatus ?? portalAccount?.connectionStatus) === "connected"
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
