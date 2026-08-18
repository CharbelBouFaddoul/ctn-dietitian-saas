"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AiPanel } from "../../../../../components/ai-panel";
import { api } from "../../../../../lib/api";
import { buttonStyle, cellStyle, fieldStyle, inputStyle, tableStyle } from "../../practice-shell";

type Tab =
  | "overview"
  | "profile"
  | "goals"
  | "measurements"
  | "assessments"
  | "appointments"
  | "timeline"
  | "tags"
  | "tracking"
  | "messages"
  | "documents"
  | "invoices"
  | "ai"
  | "portal";

interface ClientDetail {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  portalStatus: string | null;
  assignments: Array<{ id: string; membershipId: string; email: string; active: boolean }>;
  tags: Array<{ id: string; name: string }>;
}

interface Profile {
  nutritionContext: string | null;
  preferences: string | null;
  dietaryPreferences: string | null;
  allergies: string | null;
  intolerances: string | null;
  lifestyle: string | null;
  notes: string | null;
}

interface Goal {
  id: string;
  title: string;
  status: string;
  targetValue: number | null;
  targetUnit: string | null;
}

interface Measurement {
  id: string;
  type: string;
  value: number;
  unit: string;
  measuredAt: string;
}

interface Assessment {
  id: string;
  status: string;
  templateName: string;
  templateVersion: number;
}

interface Appointment {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  status: string;
}

interface TimelineEvent {
  id: string;
  type: string;
  occurredAt: string;
}

interface TrackingSummary {
  date: string;
  food: { presented: { energyKcal: number | null; proteinG: number | null } };
  water: { totalLiters: number };
  exercise: { totalDurationMinutes: number };
  sleep: { durationMinutes: number | null } | null;
  habits: { completed: number; total: number };
}

interface Tag {
  id: string;
  name: string;
}

interface Template {
  id: string;
  name: string;
  version: number;
}

interface Member {
  id: string;
  email: string;
  status: string;
}

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "profile", label: "Profile" },
  { id: "goals", label: "Goals" },
  { id: "measurements", label: "Measurements" },
  { id: "assessments", label: "Assessments" },
  { id: "appointments", label: "Appointments" },
  { id: "timeline", label: "Timeline" },
  { id: "tags", label: "Tags" },
  { id: "tracking", label: "Tracking" },
  { id: "messages", label: "Messages" },
  { id: "documents", label: "Documents" },
  { id: "invoices", label: "Invoices" },
  { id: "ai", label: "AI assist" },
  { id: "portal", label: "Portal" },
];

export default function ClientWorkspacePage() {
  const params = useParams<{ organizationId: string; clientId: string }>();
  const { organizationId, clientId } = params;
  const base = `/api/v1/organizations/${organizationId}/clients/${clientId}`;
  const [tab, setTab] = useState<Tab>("overview");
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [goalTitle, setGoalTitle] = useState("");
  const [weight, setWeight] = useState("");
  const [appointmentTitle, setAppointmentTitle] = useState("Consultation");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [newTag, setNewTag] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [assignTo, setAssignTo] = useState("");
  const [trackingSummary, setTrackingSummary] = useState<TrackingSummary | null>(null);
  const [trackingDate, setTrackingDate] = useState("");
  const [trackingFood, setTrackingFood] = useState<Array<{ id: string; foodName: string; quantity: number; unit: string; presented: { energyKcal: number | null } }>>([]);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; senderUserId: string; body: string; createdAt: string }>>([]);
  const [messageBody, setMessageBody] = useState("");
  const [clientDocuments, setClientDocuments] = useState<Array<{ id: string; filename: string; visibility: string; sizeBytes: number; createdAt: string }>>([]);
  const [clientInvoices, setClientInvoices] = useState<Array<{ id: string; invoiceNumber: string | null; status: string; dueDate: string | null; total: number; currency: string }>>([]);

  async function loadClient() {
    const detail = await api<ClientDetail>(base);
    setClient(detail);
    setSelectedTagIds(detail.tags.map((tag) => tag.id));
  }

  async function load() {
    setError(null);
    try {
      await loadClient();
      const [profileRow, goalRows, measurementRows, assessmentRows, appointmentRows, timelineRows, tagRows, templateRows, memberRows] =
        await Promise.all([
          api<Profile>(`${base}/profile`),
          api<Goal[]>(`${base}/goals`),
          api<Measurement[]>(`${base}/measurements`),
          api<Assessment[]>(`/api/v1/organizations/${organizationId}/clients/${clientId}/assessments`),
          api<Appointment[]>(`${base}/appointments`),
          api<TimelineEvent[]>(`${base}/timeline`),
          api<Tag[]>(`/api/v1/organizations/${organizationId}/tags`),
          api<Template[]>(`/api/v1/organizations/${organizationId}/assessment-templates`),
          api<Member[]>(`/api/v1/organizations/${organizationId}/members`),
        ]);
      setProfile(profileRow);
      setGoals(goalRows);
      setMeasurements(measurementRows);
      setAssessments(assessmentRows);
      setAppointments(appointmentRows);
      setTimeline(timelineRows);
      setTags(tagRows);
      setTemplates(templateRows);
      setMembers(memberRows.filter((row) => row.status === "ACTIVE"));
      if (!templateId && templateRows[0]) {
        setTemplateId(templateRows[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load client");
    }
  }

  useEffect(() => {
    void load();
  }, [organizationId, clientId]);

  useEffect(() => {
    if (tab !== "tracking") return;
    const query = trackingDate ? `?date=${trackingDate}` : "";
    void Promise.all([
      api<TrackingSummary>(`${base}/tracking/summary${query}`),
      api<Array<{ id: string; foodName: string; quantity: number; unit: string; presented: { energyKcal: number | null } }>>(
        `${base}/tracking/food-logs${query}`,
      ),
    ])
      .then(([summary, foods]) => {
        setTrackingSummary(summary);
        if (!trackingDate) setTrackingDate(summary.date);
        setTrackingFood(foods);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load tracking"));
  }, [tab, trackingDate, base]);

  useEffect(() => {
    if (tab !== "messages") return;
    void Promise.all([
      api<Array<{ id: string; senderUserId: string; body: string; createdAt: string }>>(`${base}/conversation/messages`),
    ])
      .then(([messages]) => {
        setChatMessages(messages);
        return api(`${base}/conversation/read`, { method: "POST", body: JSON.stringify({}) });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load messages"));
  }, [tab, base]);

  useEffect(() => {
    if (tab !== "documents") return;
    void reloadDocuments().catch((err) => setError(err instanceof Error ? err.message : "Unable to load documents"));
  }, [tab, base]);

  useEffect(() => {
    if (tab !== "invoices") return;
    void api<Array<{ id: string; invoiceNumber: string | null; status: string; dueDate: string | null; total: number; currency: string }>>(
      `/api/v1/organizations/${organizationId}/clients/${clientId}/invoices`,
    )
      .then(setClientInvoices)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load invoices"));
  }, [tab, organizationId, clientId]);

  async function reloadDocuments() {
    const rows = await api<Array<{ id: string; filename: string; visibility: string; sizeBytes: number; createdAt: string }>>(
      `${base}/documents`,
    );
    setClientDocuments(rows);
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    await api(`${base}/profile`, { method: "PATCH", body: JSON.stringify(profile) });
    await load();
  }

  async function addGoal(event: FormEvent) {
    event.preventDefault();
    await api(`${base}/goals`, { method: "POST", body: JSON.stringify({ title: goalTitle }) });
    setGoalTitle("");
    await load();
  }

  async function addMeasurement(event: FormEvent) {
    event.preventDefault();
    await api(`${base}/measurements`, {
      method: "POST",
      body: JSON.stringify({
        type: "WEIGHT",
        value: Number(weight),
        unit: "kg",
        measuredAt: new Date().toISOString(),
      }),
    });
    setWeight("");
    await load();
  }

  async function startAssessment(event: FormEvent) {
    event.preventDefault();
    await api(`${base}/assessments`, { method: "POST", body: JSON.stringify({ templateId }) });
    await load();
  }

  async function addAppointment(event: FormEvent) {
    event.preventDefault();
    await api(`${base}/appointments`, {
      method: "POST",
      body: JSON.stringify({
        title: appointmentTitle,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
      }),
    });
    await load();
  }

  return (
    <section>
      <h1>{client ? `${client.firstName} ${client.lastName}` : "Client"}</h1>
      <p>
        Status <strong>{client?.status}</strong> · portal <strong>{client?.portalStatus ?? "none"}</strong>
      </p>
      <nav style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            style={{
              ...buttonStyle,
              background: tab === item.id ? "var(--color-accent)" : "var(--color-surface)",
              color: tab === item.id ? "#fff" : "inherit",
              border: "1px solid var(--color-border)",
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && client ? (
        <div>
          <p>
            {client.email ?? "No email"} · {client.phone ?? "No phone"}
          </p>
          <p>Assigned: {client.assignments.find((row) => row.active)?.email ?? "None"}</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void api(`${base}/assignments`, {
                method: "POST",
                body: JSON.stringify({ organizationMemberId: assignTo }),
              }).then(() => load());
            }}
          >
            <label style={fieldStyle}>
              Reassign
              <select style={inputStyle} value={assignTo} onChange={(event) => setAssignTo(event.target.value)}>
                <option value="">Select member</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.email}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" style={buttonStyle} disabled={!assignTo}>
              Assign
            </button>
          </form>
          {client.status !== "ARCHIVED" ? (
            <button
              type="button"
              style={{ ...buttonStyle, marginTop: 12 }}
              onClick={() => void api(`${base}/archive`, { method: "POST" }).then(() => load())}
            >
              Archive client
            </button>
          ) : (
            <button
              type="button"
              style={{ ...buttonStyle, marginTop: 12 }}
              onClick={() => void api(`${base}/restore`, { method: "POST", body: JSON.stringify({ status: "ACTIVE" }) }).then(() => load())}
            >
              Restore client
            </button>
          )}
        </div>
      ) : null}

      {tab === "profile" && profile ? (
        <form onSubmit={(event) => void saveProfile(event)} style={{ maxWidth: 560 }}>
          {(
            [
              ["allergies", "Allergies"],
              ["intolerances", "Intolerances"],
              ["dietaryPreferences", "Dietary preferences"],
              ["preferences", "Preferences"],
              ["lifestyle", "Lifestyle"],
              ["nutritionContext", "Nutrition context"],
              ["notes", "Notes"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} style={fieldStyle}>
              {label}
              <textarea
                style={{ ...inputStyle, minHeight: 72 }}
                value={profile[key] ?? ""}
                onChange={(event) => setProfile({ ...profile, [key]: event.target.value })}
              />
            </label>
          ))}
          <button type="submit" style={buttonStyle}>
            Save profile
          </button>
        </form>
      ) : null}

      {tab === "goals" ? (
        <div>
          <form onSubmit={(event) => void addGoal(event)} style={{ maxWidth: 360 }}>
            <label style={fieldStyle}>
              Goal
              <input style={inputStyle} value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} required />
            </label>
            <button type="submit" style={buttonStyle}>
              Add goal
            </button>
          </form>
          <ul>
            {goals.map((goal) => (
              <li key={goal.id}>
                {goal.title} ({goal.status})
                {goal.status === "ACTIVE" ? (
                  <button
                    type="button"
                    style={{ ...buttonStyle, marginLeft: 8 }}
                    onClick={() => void api(`${base}/goals/${goal.id}/complete`, { method: "POST" }).then(() => load())}
                  >
                    Complete
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tab === "measurements" ? (
        <div>
          <form onSubmit={(event) => void addMeasurement(event)} style={{ maxWidth: 280 }}>
            <label style={fieldStyle}>
              Weight (kg)
              <input
                style={inputStyle}
                type="number"
                step="0.1"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
                required
              />
            </label>
            <button type="submit" style={buttonStyle}>
              Record
            </button>
          </form>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={cellStyle}>Type</th>
                <th style={cellStyle}>Value</th>
                <th style={cellStyle}>When</th>
              </tr>
            </thead>
            <tbody>
              {measurements.map((row) => (
                <tr key={row.id}>
                  <td style={cellStyle}>{row.type}</td>
                  <td style={cellStyle}>
                    {row.value} {row.unit}
                  </td>
                  <td style={cellStyle}>{new Date(row.measuredAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "assessments" ? (
        <div>
          <form onSubmit={(event) => void startAssessment(event)} style={{ maxWidth: 360 }}>
            <label style={fieldStyle}>
              Template
              <select style={inputStyle} value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} (v{template.version})
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" style={buttonStyle} disabled={!templateId}>
              Start assessment
            </button>
          </form>
          <ul>
            {assessments.map((row) => (
              <li key={row.id}>
                {row.templateName} v{row.templateVersion} · {row.status}
                {row.status !== "COMPLETED" ? (
                  <button
                    type="button"
                    style={{ ...buttonStyle, marginLeft: 8 }}
                    onClick={() =>
                      void api(`${base}/assessments/${row.id}/complete`, {
                        method: "POST",
                        body: JSON.stringify({ responses: {} }),
                      }).then(() => load())
                    }
                  >
                    Complete
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tab === "appointments" ? (
        <div>
          <form onSubmit={(event) => void addAppointment(event)} style={{ maxWidth: 360 }}>
            <label style={fieldStyle}>
              Title
              <input
                style={inputStyle}
                value={appointmentTitle}
                onChange={(event) => setAppointmentTitle(event.target.value)}
                required
              />
            </label>
            <label style={fieldStyle}>
              Start
              <input
                style={inputStyle}
                type="datetime-local"
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
                required
              />
            </label>
            <label style={fieldStyle}>
              End
              <input
                style={inputStyle}
                type="datetime-local"
                value={endAt}
                onChange={(event) => setEndAt(event.target.value)}
                required
              />
            </label>
            <button type="submit" style={buttonStyle}>
              Schedule
            </button>
          </form>
          <ul>
            {appointments.map((row) => (
              <li key={row.id}>
                {row.title} · {row.status} · {new Date(row.startAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tab === "timeline" ? (
        <ul>
          {timeline.map((row) => (
            <li key={row.id}>
              {row.type} · {new Date(row.occurredAt).toLocaleString()}
            </li>
          ))}
        </ul>
      ) : null}

      {tab === "tags" ? (
        <div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void api(`/api/v1/organizations/${organizationId}/tags`, {
                method: "POST",
                body: JSON.stringify({ name: newTag }),
              }).then(() => {
                setNewTag("");
                return load();
              });
            }}
            style={{ maxWidth: 280 }}
          >
            <label style={fieldStyle}>
              New tag
              <input style={inputStyle} value={newTag} onChange={(event) => setNewTag(event.target.value)} required />
            </label>
            <button type="submit" style={buttonStyle}>
              Create tag
            </button>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void api(`${base.replace(`/clients/${clientId}`, "")}/clients/${clientId}/tags`, {
                method: "PUT",
                body: JSON.stringify({ tagIds: selectedTagIds }),
              }).then(() => load());
            }}
          >
            {tags.map((tag) => (
              <label key={tag.id} style={{ display: "block", marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={selectedTagIds.includes(tag.id)}
                  onChange={(event) =>
                    setSelectedTagIds(
                      event.target.checked
                        ? [...selectedTagIds, tag.id]
                        : selectedTagIds.filter((id) => id !== tag.id),
                    )
                  }
                />{" "}
                {tag.name}
              </label>
            ))}
            <button type="submit" style={buttonStyle}>
              Save client tags
            </button>
          </form>
        </div>
      ) : null}

      {tab === "tracking" ? (
        <div>
          <p style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="date" value={trackingDate} onChange={(event) => setTrackingDate(event.target.value)} />
          </p>
          {trackingSummary ? (
            <>
              <p>
                Calories {trackingSummary.food.presented.energyKcal ?? "unknown"} · Protein{" "}
                {trackingSummary.food.presented.proteinG ?? "unknown"}g · Water {trackingSummary.water.totalLiters.toFixed(1)}L ·
                Exercise {trackingSummary.exercise.totalDurationMinutes} min · Sleep{" "}
                {trackingSummary.sleep?.durationMinutes
                  ? `${Math.floor(trackingSummary.sleep.durationMinutes / 60)}h ${trackingSummary.sleep.durationMinutes % 60}m`
                  : "—"}{" "}
                · Habits {trackingSummary.habits.completed}/{trackingSummary.habits.total}
              </p>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={cellStyle}>Food</th>
                    <th style={cellStyle}>Quantity</th>
                    <th style={cellStyle}>kcal</th>
                  </tr>
                </thead>
                <tbody>
                  {trackingFood.map((row) => (
                    <tr key={row.id}>
                      <td style={cellStyle}>{row.foodName}</td>
                      <td style={cellStyle}>
                        {row.quantity} {row.unit}
                      </td>
                      <td style={cellStyle}>{row.presented.energyKcal ?? "unknown"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p>Loading tracking…</p>
          )}
        </div>
      ) : null}

      {tab === "messages" ? (
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            {chatMessages.map((message) => (
              <div key={message.id} style={{ padding: 10, background: "var(--color-surface)", borderRadius: 8 }}>
                <div>{message.body}</div>
                <div style={{ fontSize: 12, color: "var(--color-muted)" }}>{new Date(message.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void api(`${base}/conversation/messages`, { method: "POST", body: JSON.stringify({ body: messageBody }) })
                .then(() => {
                  setMessageBody("");
                  return api<Array<{ id: string; senderUserId: string; body: string; createdAt: string }>>(
                    `${base}/conversation/messages`,
                  );
                })
                .then(setChatMessages)
                .catch((err) => setError(err instanceof Error ? err.message : "Send failed"));
            }}
          >
            <textarea value={messageBody} onChange={(event) => setMessageBody(event.target.value)} rows={3} style={{ width: "100%" }} />
            <button type="submit" style={buttonStyle}>
              Send
            </button>
          </form>
        </div>
      ) : null}

      {tab === "documents" ? (
        <div>
          <form
            style={{ marginBottom: 16 }}
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
              void fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}${base}/documents`, {
                method: "POST",
                body,
                credentials: "include",
              })
                .then((res) => {
                  if (!res.ok) throw new Error("Upload failed");
                  fileInput.value = "";
                  return api<Array<{ id: string; filename: string; visibility: string; sizeBytes: number; createdAt: string }>>(
                    `${base}/documents`,
                  );
                })
                .then(() => reloadDocuments())
                .catch((err) => setError(err instanceof Error ? err.message : "Upload failed"));
            }}
          >
            <input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx" />
            <select name="visibility" defaultValue="INTERNAL" style={{ marginLeft: 8 }}>
              <option value="INTERNAL">Internal</option>
              <option value="SHARED">Shared with client</option>
            </select>
            <button type="submit" style={{ ...buttonStyle, marginLeft: 8 }}>
              Upload
            </button>
          </form>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={cellStyle}>File</th>
                <th style={cellStyle}>Visibility</th>
                <th style={cellStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {clientDocuments.map((doc) => (
                <tr key={doc.id}>
                  <td style={cellStyle}>{doc.filename}</td>
                  <td style={cellStyle}>{doc.visibility}</td>
                  <td style={cellStyle}>
                    <a href={`${process.env.NEXT_PUBLIC_API_URL ?? ""}${base}/documents/${doc.id}/download`}>Download</a>
                    {doc.visibility === "INTERNAL" ? (
                      <button
                        type="button"
                        style={{ ...buttonStyle, marginLeft: 8 }}
                        onClick={() =>
                          void api(`${base}/documents/${doc.id}/visibility`, {
                            method: "PATCH",
                            body: JSON.stringify({ visibility: "SHARED" }),
                          }).then(() => reloadDocuments())
                        }
                      >
                        Share
                      </button>
                    ) : (
                      <button
                        type="button"
                        style={{ ...buttonStyle, marginLeft: 8 }}
                        onClick={() =>
                          void api(`${base}/documents/${doc.id}/visibility`, {
                            method: "PATCH",
                            body: JSON.stringify({ visibility: "INTERNAL" }),
                          }).then(() => reloadDocuments())
                        }
                      >
                        Unshare
                      </button>
                    )}
                    <button
                      type="button"
                      style={{ ...buttonStyle, marginLeft: 8 }}
                      onClick={() =>
                        void api(`${base}/documents/${doc.id}/archive`, { method: "POST" }).then(() => reloadDocuments())
                      }
                    >
                      Archive
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "invoices" ? (
        <div>
          <p style={{ color: "var(--color-muted)" }}>
            Client invoices.{" "}
            <Link href={`/orgs/${organizationId}/invoices`} style={{ color: "var(--color-accent)" }}>
              Open org invoices
            </Link>
          </p>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={cellStyle}>Invoice</th>
                <th style={cellStyle}>Status</th>
                <th style={cellStyle}>Due</th>
                <th style={cellStyle}>Total</th>
              </tr>
            </thead>
            <tbody>
              {clientInvoices.map((row) => (
                <tr key={row.id}>
                  <td style={cellStyle}>
                    <Link href={`/orgs/${organizationId}/invoices/${row.id}`} style={{ color: "var(--color-accent)" }}>
                      {row.invoiceNumber ?? "Draft"}
                    </Link>
                  </td>
                  <td style={cellStyle}>{row.status}</td>
                  <td style={cellStyle}>{row.dueDate ?? "—"}</td>
                  <td style={cellStyle}>
                    {row.total.toFixed(2)} {row.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {clientInvoices.length === 0 ? <p>No invoices for this client.</p> : null}
        </div>
      ) : null}

      {tab === "ai" ? (
        <div style={{ display: "grid", gap: 16 }}>
          <AiPanel
            organizationId={organizationId}
            clientId={clientId}
            action="client-summary"
            title="Client summary"
            description="Concise overview from profile, goals, tracking, and meal-plan context."
          />
          <AiPanel
            organizationId={organizationId}
            clientId={clientId}
            action="meal-plan-assistance"
            title="Meal plan assistance"
            description="Suggestions only — review and apply manually in the meal-plan editor."
          />
          <AiPanel
            organizationId={organizationId}
            clientId={clientId}
            action="nutrition-assistance"
            title="Nutrition assistance"
            description="Explain foods using application database values. AI does not replace FoodService."
            foodQuery
          />
          <AiPanel
            organizationId={organizationId}
            clientId={clientId}
            action="consultation-summary"
            title="Consultation summary"
            description="Draft summary and follow-up questions for your next visit."
          />
          <AiPanel
            organizationId={organizationId}
            clientId={clientId}
            action="message-draft"
            title="Message draft"
            description="Draft only — send manually from Messages when ready."
          />
        </div>
      ) : null}

      {tab === "portal" ? (
        <div>
          <p>Portal status: {client?.portalStatus ?? "none"}</p>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => void api(`${base}/account/invite`, { method: "POST" }).then(() => load())}
          >
            Invite / create portal account
          </button>
          {client?.portalStatus && client.portalStatus !== "DEACTIVATED" ? (
            <button
              type="button"
              style={{ ...buttonStyle, marginLeft: 8 }}
              onClick={() => void api(`${base}/account/deactivate`, { method: "POST" }).then(() => load())}
            >
              Deactivate portal
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
    </section>
  );
}
