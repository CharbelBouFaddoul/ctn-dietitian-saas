"use client";

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  Field,
  Input,
  LoadingState,
  PageHeader,
  PasswordInput,
  Section,
  Select,
  Tabs,
} from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";

interface PortalGoal {
  id: string;
  title: string;
  description: string | null;
  status: string;
  targetValue: number | null;
  targetUnit: string | null;
  startDate: string | null;
  targetDate: string | null;
}

interface PortalMe {
  client: {
    id: string;
    firstName: string;
    lastName: string;
    displayName: string | null;
    email: string | null;
    phone: string | null;
    dateOfBirth: string | null;
    sex: string | null;
  };
  profile: {
    allergies: string | null;
    intolerances: string | null;
    dietaryPreferences: string | null;
    lifestyle: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
  } | null;
  goals?: PortalGoal[];
  practiceName?: string | null;
  dietitianDisplayName?: string | null;
  disconnectRequestedAt?: string | null;
  disconnectRequestNote?: string | null;
}

interface PortalConnection {
  clientId: string;
  practiceName: string;
  dietitianDisplayName?: string | null;
}

type PersonalForm = {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  sex: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

type ProfileTab = "about" | "care" | "account";

const PROFILE_TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: "about", label: "About you" },
  { id: "care", label: "Care notes" },
  { id: "account", label: "Clinic and security" },
];

const PROFILE_FORM_ID = "portal-profile-form";

function isProfileTab(value: string | null): value is ProfileTab {
  return value === "about" || value === "care" || value === "account" || value === "personal" || value === "clinic-notes";
}

function normalizeTab(value: string | null): ProfileTab {
  if (value === "personal") return "about";
  if (value === "clinic-notes") return "care";
  if (isProfileTab(value) && (value === "about" || value === "care" || value === "account")) return value;
  return "about";
}

function formFromData(data: PortalMe): PersonalForm {
  return {
    firstName: data.client.firstName ?? "",
    lastName: data.client.lastName ?? "",
    displayName: data.client.displayName ?? "",
    email: data.client.email ?? "",
    phone: data.client.phone ?? "",
    dateOfBirth: data.client.dateOfBirth?.slice(0, 10) ?? "",
    sex: data.client.sex ?? "UNSPECIFIED",
    emergencyContactName: data.profile?.emergencyContactName ?? "",
    emergencyContactPhone: data.profile?.emergencyContactPhone ?? "",
  };
}

function initialsFor(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return letters.toUpperCase() || "P";
}

export default function ClientProfilePage() {
  return (
    <Suspense fallback={<LoadingState>Loading profile…</LoadingState>}>
      <ClientProfilePageInner />
    </Suspense>
  );
}

function ClientProfilePageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = normalizeTab(searchParams.get("tab"));

  const [data, setData] = useState<PortalMe | null>(null);
  const [connections, setConnections] = useState<PortalConnection[]>([]);
  const [form, setForm] = useState<PersonalForm | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [disconnectNote, setDisconnectNote] = useState("");
  const [disconnectBusy, setDisconnectBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const loadProfile = useCallback(async () => {
    const [me, links] = await Promise.all([
      api<PortalMe>("/api/v1/portal/me"),
      api<PortalConnection[]>("/api/v1/portal/connections").catch(() => [] as PortalConnection[]),
    ]);
    setData(me);
    setForm(formFromData(me));
    setConnections(links);
    return me;
  }, []);

  useEffect(() => {
    void loadProfile()
      .catch((err) => setError(errorMessage(err, "Unable to load profile")))
      .finally(() => setLoading(false));
  }, [loadProfile]);

  useEffect(() => {
    setEditing(false);
    setSaved(null);
    setCurrentPassword("");
    setNewPassword("");
  }, [tab]);

  const displayName = useMemo(() => {
    if (!data) return "Patient";
    return (
      data.client.displayName?.trim() ||
      `${data.client.firstName ?? ""} ${data.client.lastName ?? ""}`.trim() ||
      "Patient"
    );
  }, [data]);

  function selectTab(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "about") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function startEdit() {
    if (!data) return;
    setForm(formFromData(data));
    setSaved(null);
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    if (data) setForm(formFromData(data));
    setEditing(false);
    setError(null);
    setCurrentPassword("");
    setNewPassword("");
  }

  async function onSavePersonal(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const updated = await api<PortalMe>("/api/v1/portal/me", {
        method: "PATCH",
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          displayName: form.displayName.trim() || undefined,
          email: form.email.trim(),
          phone: form.phone.trim(),
          dateOfBirth: form.dateOfBirth || null,
          sex: form.sex || "UNSPECIFIED",
          emergencyContactName: form.emergencyContactName.trim() || null,
          emergencyContactPhone: form.emergencyContactPhone.trim() || null,
        }),
      });
      setData(updated);
      setForm(formFromData(updated));
      setEditing(false);
      setSaved("Profile saved.");
    } catch (err) {
      setError(errorMessage(err, "Unable to save profile"));
    } finally {
      setSaving(false);
    }
  }

  async function onChangePassword(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      await api("/api/v1/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setEditing(false);
      setSaved("Password updated.");
    } catch (err) {
      setError(errorMessage(err, "Unable to change password"));
    } finally {
      setSaving(false);
    }
  }

  async function onSwitchClinic(clientId: string) {
    if (!data || clientId === data.client.id || switching) return;
    setSwitching(true);
    setError(null);
    setSaved(null);
    try {
      await api("/api/v1/portal/connections/active", {
        method: "POST",
        body: JSON.stringify({ clientId }),
      });
      await loadProfile();
      window.dispatchEvent(new CustomEvent("portal-connection-changed"));
      router.refresh();
      setSaved("Active clinic updated.");
    } catch (err) {
      setError(errorMessage(err, "Unable to switch clinic"));
    } finally {
      setSwitching(false);
    }
  }

  async function requestLeave() {
    setDisconnectBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api("/api/v1/portal/connections/disconnect-request", {
        method: "POST",
        body: JSON.stringify({
          note: disconnectNote.trim() || undefined,
        }),
      });
      const me = await api<PortalMe>("/api/v1/portal/me");
      setData(me);
      setConfirmLeave(false);
      setDisconnectNote("");
      setSaved("Request sent. Your dietitian still needs to confirm before you leave this clinic.");
    } catch (err) {
      setError(errorMessage(err, "Unable to send leave request"));
    } finally {
      setDisconnectBusy(false);
    }
  }

  async function cancelLeaveRequest() {
    setDisconnectBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api("/api/v1/portal/connections/disconnect-request", {
        method: "DELETE",
        body: JSON.stringify({}),
      });
      const me = await api<PortalMe>("/api/v1/portal/me");
      setData(me);
      setSaved("Leave request cancelled. You remain connected.");
    } catch (err) {
      setError(errorMessage(err, "Unable to cancel leave request"));
    } finally {
      setDisconnectBusy(false);
    }
  }

  if (loading || !data || !form) {
    return (
      <section>
        <PageHeader title="Profile" />
        {error ? <Alert tone="danger">{error}</Alert> : <LoadingState>Loading profile…</LoadingState>}
      </section>
    );
  }

  const clinic = data.practiceName?.trim() || "Your clinic";
  const dietitian = data.dietitianDisplayName?.trim();
  const goals = data.goals ?? [];
  const canEdit = tab === "about" || tab === "account";

  return (
    <section className={`ui-profile-hub${editing ? " is-editing" : ""}`}>
      <PageHeader
        title="Profile"
        actions={
          canEdit ? (
            editing ? (
              <>
                <Button type="button" variant="ghost" disabled={saving} onClick={cancelEdit}>
                  Cancel
                </Button>
                <Button type="submit" form={PROFILE_FORM_ID} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </>
            ) : (
              <Button type="button" variant="secondary" onClick={startEdit}>
                Edit
              </Button>
            )
          ) : null
        }
      />

      <div className="ui-portal-identity">
        <span className="ui-avatar" aria-hidden="true">
          {initialsFor(displayName)}
        </span>
        <div>
          <strong>{displayName}</strong>
          <p className="ui-muted">
            {clinic}
            {dietitian ? ` · ${dietitian}` : ""}
          </p>
        </div>
      </div>

      <Tabs items={PROFILE_TABS} value={tab} onChange={selectTab} variant="line" />

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {saved ? <Alert tone="success">{saved}</Alert> : null}

      {tab === "about" ? (
        <form id={PROFILE_FORM_ID} className="ui-profile-hub__stack" onSubmit={(event) => void onSavePersonal(event)}>
          <Section title="Personal information" description="Your contact and identity details for this clinic connection.">
            <div className="ui-profile-grid ui-profile-grid--2">
              <Field label="First name">
                <Input
                  value={form.firstName}
                  onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                  required
                  autoComplete="given-name"
                  readOnly={!editing}
                />
              </Field>
              <Field label="Last name">
                <Input
                  value={form.lastName}
                  onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                  required
                  autoComplete="family-name"
                  readOnly={!editing}
                />
              </Field>
              <Field label="Display name">
                <Input
                  value={form.displayName}
                  onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                  placeholder="Optional preferred name"
                  autoComplete="nickname"
                  readOnly={!editing}
                />
              </Field>
              <Field label="Email" hint="Used for this clinic connection.">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  autoComplete="email"
                  readOnly={!editing}
                />
              </Field>
              <Field label="Phone">
                <Input
                  type="tel"
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  placeholder="+961 71 123 456"
                  autoComplete="tel"
                  readOnly={!editing}
                />
              </Field>
              <Field label="Date of birth">
                <Input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(event) => setForm({ ...form, dateOfBirth: event.target.value })}
                  readOnly={!editing}
                />
              </Field>
              <Field label="Sex">
                <Select
                  value={form.sex}
                  onChange={(event) => setForm({ ...form, sex: event.target.value })}
                  disabled={!editing}
                >
                  <option value="FEMALE">Female</option>
                  <option value="MALE">Male</option>
                  <option value="OTHER">Other</option>
                  <option value="UNSPECIFIED">Unspecified</option>
                </Select>
              </Field>
            </div>
          </Section>
          <Section title="Emergency contact" description="Who the clinic can reach in an emergency.">
            <div className="ui-profile-grid ui-profile-grid--2">
              <Field label="Name">
                <Input
                  value={form.emergencyContactName}
                  onChange={(event) => setForm({ ...form, emergencyContactName: event.target.value })}
                  autoComplete="name"
                  readOnly={!editing}
                />
              </Field>
              <Field label="Phone">
                <Input
                  type="tel"
                  value={form.emergencyContactPhone}
                  onChange={(event) => setForm({ ...form, emergencyContactPhone: event.target.value })}
                  autoComplete="tel"
                  readOnly={!editing}
                />
              </Field>
            </div>
          </Section>
        </form>
      ) : null}

      {tab === "care" ? (
        <div className="ui-profile-hub__stack">
          <Section
            title="What we’re working on"
            description="Goals your dietitian set for this clinic. Contact them if something should change."
          >
            {goals.length ? (
              <ul className="ui-portal-goal-list">
                {goals.map((goal) => (
                  <li key={goal.id}>
                    <strong>{goal.title}</strong>
                    {goal.targetValue != null ? (
                      <span className="ui-muted">
                        {" "}
                        · {goal.targetValue}
                        {goal.targetUnit ? ` ${goal.targetUnit}` : ""}
                      </span>
                    ) : null}
                    {goal.description ? <p className="ui-muted">{goal.description}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ui-muted" style={{ margin: 0 }}>
                No active goals yet.
              </p>
            )}
          </Section>
          <Section
            title="Dietary preferences and restrictions"
            description="Recorded by your dietitian. Contact them if something needs updating."
          >
            <div className="ui-profile-grid ui-profile-grid--2">
              <Field label="Allergies">
                <Input value={data.profile?.allergies ?? ""} readOnly />
              </Field>
              <Field label="Intolerances">
                <Input value={data.profile?.intolerances ?? ""} readOnly />
              </Field>
              <Field label="Dietary preferences">
                <Input value={data.profile?.dietaryPreferences ?? ""} readOnly />
              </Field>
            </div>
          </Section>
          <Section title="Lifestyle" description="Activity, schedule, and day-to-day context used for planning.">
            {data.profile?.lifestyle?.trim() ? (
              <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{data.profile.lifestyle}</p>
            ) : (
              <p className="ui-muted" style={{ margin: 0 }}>
                No lifestyle notes yet.
              </p>
            )}
          </Section>
        </div>
      ) : null}

      {tab === "account" ? (
        <div className="ui-profile-hub__stack">
          <Section title="Your clinic" description="Care for this connection is private to this clinic.">
            <div className="ui-profile-grid ui-profile-grid--2">
              <Field label="Clinic">
                <Input value={clinic} readOnly className="ui-profile-readonly" />
              </Field>
              <Field label="Dietitian">
                <Input value={dietitian || "—"} readOnly className="ui-profile-readonly" />
              </Field>
            </div>
            {connections.length > 1 ? (
              <Field label="Switch clinic" hint={switching ? "Updating…" : undefined}>
                <Select
                  value={data.client.id}
                  disabled={switching}
                  aria-label="Switch active clinic"
                  onChange={(event) => void onSwitchClinic(event.target.value)}
                >
                  {connections.map((link) => (
                    <option key={link.clientId} value={link.clientId}>
                      {link.dietitianDisplayName
                        ? `${link.practiceName} · ${link.dietitianDisplayName}`
                        : link.practiceName}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <p className="ui-muted" style={{ margin: 0, lineHeight: 1.55 }}>
              Joining another clinic does not remove this one. To add another practice, use{" "}
              <Link href="/client/join" className="ui-link">
                Join another clinic
              </Link>
              .
            </p>
          </Section>

          <Section title="Password" description="Change the password for this sign-in.">
            {editing ? (
              <form id={PROFILE_FORM_ID} className="ui-profile-grid ui-profile-grid--2" onSubmit={(event) => void onChangePassword(event)}>
                <Field label="Current password">
                  <PasswordInput
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </Field>
                <Field label="New password">
                  <PasswordInput
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </Field>
              </form>
            ) : (
              <p className="ui-muted" style={{ margin: 0 }}>
                Edit to change your password, or{" "}
                <Link href="/auth/forgot-password" className="ui-link">
                  reset it from the sign-in screen
                </Link>
                .
              </p>
            )}
          </Section>

          <Section
            title="End this clinic connection"
            description="Ask this clinic to disconnect you. Joining elsewhere will not end this link."
          >
            {data.disconnectRequestedAt ? (
              <>
                <Alert tone="neutral">
                  Leave request sent
                  {data.disconnectRequestedAt ? ` on ${new Date(data.disconnectRequestedAt).toLocaleString()}` : ""}.
                  Your dietitian still needs to confirm. Portal access stays active until then.
                  {data.disconnectRequestNote?.trim() ? ` Your note: “${data.disconnectRequestNote.trim()}”.` : null}
                </Alert>
                <div>
                  <Button size="sm" variant="secondary" disabled={disconnectBusy} onClick={() => void cancelLeaveRequest()}>
                    {disconnectBusy ? "Cancelling…" : "Cancel request"}
                  </Button>
                </div>
              </>
            ) : confirmLeave ? (
              <div className="ui-stack" style={{ gap: 12 }}>
                <Alert tone="warning">
                  This notifies your dietitian. You stay connected until they approve. Joining another clinic does not
                  remove this one.
                </Alert>
                <Field
                  label="Optional note"
                  hint={`${disconnectNote.trim() ? disconnectNote.trim().split(/\s+/).filter(Boolean).length : 0} / 50 words`}
                >
                  <Input
                    value={disconnectNote}
                    onChange={(event) => {
                      const next = event.target.value;
                      const words = next.trim() ? next.trim().split(/\s+/).filter(Boolean) : [];
                      if (words.length <= 50) {
                        setDisconnectNote(next);
                        return;
                      }
                      setDisconnectNote(words.slice(0, 50).join(" "));
                    }}
                    placeholder="Reason (optional, up to 50 words)"
                  />
                </Field>
                <div className="ui-row" style={{ gap: 8 }}>
                  <Button size="sm" disabled={disconnectBusy} onClick={() => void requestLeave()}>
                    {disconnectBusy ? "Sending…" : "Send request"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={disconnectBusy}
                    onClick={() => {
                      setConfirmLeave(false);
                      setDisconnectNote("");
                    }}
                  >
                    Never mind
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setConfirmLeave(true)}>
                Request to leave
              </Button>
            )}
          </Section>
        </div>
      ) : null}
    </section>
  );
}
