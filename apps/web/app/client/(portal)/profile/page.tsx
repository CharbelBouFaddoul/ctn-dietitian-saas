"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Section,
  Select,
  StatusBadge,
  Tabs,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { statusLabel } from "../../../../lib/practice-labels";

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
    status: string;
  };
  profile: {
    allergies: string | null;
    intolerances: string | null;
    dietaryPreferences: string | null;
    lifestyle: string | null;
  } | null;
  practiceName?: string | null;
}

type PersonalForm = {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  sex: string;
};

type ProfileTab = "personal" | "clinic-notes" | "account";

const PROFILE_TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: "personal", label: "Personal" },
  { id: "clinic-notes", label: "Clinic notes" },
  { id: "account", label: "Account" },
];

function isProfileTab(value: string | null): value is ProfileTab {
  return value === "personal" || value === "clinic-notes" || value === "account";
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
  };
}

function row(label: string, value: string | null | undefined) {
  if (!value?.trim()) return null;
  return (
    <div className="ui-client-focus-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
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
  const tabParam = searchParams.get("tab");
  const tab: ProfileTab = isProfileTab(tabParam) ? tabParam : "personal";

  const [data, setData] = useState<PortalMe | null>(null);
  const [form, setForm] = useState<PersonalForm | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api<PortalMe>("/api/v1/portal/me")
      .then((me) => {
        setData(me);
        setForm(formFromData(me));
      })
      .catch((err) => setError(errorMessage(err, "Unable to load profile")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setEditing(false);
    setSaved(null);
  }, [tab]);

  const headerCopy = useMemo(() => {
    if (tab === "clinic-notes") {
      return {
        title: "Clinic notes",
        description: "Dietary and lifestyle notes recorded by your dietitian for this clinic.",
      };
    }
    if (tab === "account") {
      return {
        title: "Account",
        description: "Clinic connection and sign-in security.",
      };
    }
    return {
      title: "Personal details",
      description: "Your contact and identity details for the active clinic connection.",
    };
  }, [tab]);

  function selectTab(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "personal") params.delete("tab");
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
  }

  async function onSave(event: FormEvent) {
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
        }),
      });
      setData(updated);
      setForm(formFromData(updated));
      setEditing(false);
      setSaved("Personal details saved.");
    } catch (err) {
      setError(errorMessage(err, "Unable to save profile"));
    } finally {
      setSaving(false);
    }
  }

  const name =
    data?.client.displayName?.trim() ||
    `${data?.client.firstName ?? ""} ${data?.client.lastName ?? ""}`.trim() ||
    "—";

  return (
    <section>
      <PageHeader
        eyebrow="Account"
        title={headerCopy.title}
        description={headerCopy.description}
        actions={
          !loading && data && tab === "personal" && !editing ? (
            <Button type="button" size="sm" variant="secondary" onClick={startEdit}>
              Edit
            </Button>
          ) : null
        }
      />

      <Tabs items={PROFILE_TABS} value={tab} onChange={selectTab} />

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {saved ? <Alert tone="success">{saved}</Alert> : null}
      {loading ? <LoadingState>Loading profile…</LoadingState> : null}

      {!loading && data && tab === "personal" ? (
        <div className="ui-client-stack">
          <Section title="Personal information" tone="mint">
            {editing && form ? (
              <form className="ui-stack" onSubmit={(event) => void onSave(event)}>
                <div className="ui-client-chart__form-grid">
                  <Field label="First name">
                    <Input
                      value={form.firstName}
                      onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                      required
                      autoComplete="given-name"
                    />
                  </Field>
                  <Field label="Last name">
                    <Input
                      value={form.lastName}
                      onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                      required
                      autoComplete="family-name"
                    />
                  </Field>
                  <Field label="Display name">
                    <Input
                      value={form.displayName}
                      onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                      placeholder="Optional preferred name"
                      autoComplete="nickname"
                    />
                  </Field>
                  <Field label="Email">
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm({ ...form, email: event.target.value })}
                      autoComplete="email"
                    />
                  </Field>
                  <Field label="Phone">
                    <Input
                      type="tel"
                      value={form.phone}
                      onChange={(event) => setForm({ ...form, phone: event.target.value })}
                      placeholder="+961 71 123 456"
                      autoComplete="tel"
                    />
                  </Field>
                  <Field label="Date of birth">
                    <Input
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(event) => setForm({ ...form, dateOfBirth: event.target.value })}
                    />
                  </Field>
                  <Field label="Sex">
                    <Select
                      value={form.sex}
                      onChange={(event) => setForm({ ...form, sex: event.target.value })}
                    >
                      <option value="FEMALE">Female</option>
                      <option value="MALE">Male</option>
                      <option value="OTHER">Other</option>
                      <option value="UNSPECIFIED">Unspecified</option>
                    </Select>
                  </Field>
                </div>
                <div className="ui-client-focus-row">
                  <span>Status</span>
                  <StatusBadge status={data.client.status} label={statusLabel(data.client.status)} />
                </div>
                <div className="ui-row" style={{ gap: 8 }}>
                  <Button type="submit" size="sm" disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={cancelEdit}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <>
                {row("Name", name)}
                {row("Email", data.client.email)}
                {row("Phone", data.client.phone)}
                {row("Date of birth", data.client.dateOfBirth)}
                {row("Sex", data.client.sex ? humanizeLabel(data.client.sex) : null)}
                <div className="ui-client-focus-row">
                  <span>Status</span>
                  <StatusBadge status={data.client.status} label={statusLabel(data.client.status)} />
                </div>
              </>
            )}
          </Section>
        </div>
      ) : null}

      {!loading && data && tab === "clinic-notes" ? (
        <div className="ui-client-stack">
          <Section
            title="Dietary preferences & restrictions"
            description="Recorded by your dietitian. Contact them if something needs updating."
          >
            {row("Allergies", data.profile?.allergies)}
            {row("Intolerances", data.profile?.intolerances)}
            {row("Dietary preferences", data.profile?.dietaryPreferences)}
            {!data.profile?.allergies &&
            !data.profile?.intolerances &&
            !data.profile?.dietaryPreferences ? (
              <p className="ui-muted" style={{ margin: 0 }}>
                No dietary restrictions recorded yet.
              </p>
            ) : null}
          </Section>

          <Section
            title="Lifestyle"
            description="Activity, schedule, and day-to-day context your dietitian uses for planning."
          >
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

      {!loading && data && tab === "account" ? (
        <div className="ui-client-stack">
          <Section title="Your clinic" description="The dietitian clinic for this connection.">
            <div className="ui-client-focus-row">
              <span>Clinic</span>
              <strong>{data.practiceName?.trim() || "Connected to your dietitian"}</strong>
            </div>
            <p className="ui-muted" style={{ margin: "0.85rem 0 0", lineHeight: 1.55 }}>
              To connect with another practice, use{" "}
              <Link href="/client/join" className="ui-link">
                Join another clinic
              </Link>
              .
            </p>
          </Section>

          <Section title="Security" description="Password changes use the same account security flow as sign-in.">
            <p className="ui-muted" style={{ margin: "0 0 0.85rem", lineHeight: 1.55 }}>
              Need to update your password? Use forgot password from the sign-in screen.
            </p>
            <Link href="/auth/forgot-password" className="ui-btn ui-btn--secondary ui-btn--sm">
              Reset password
            </Link>
          </Section>
        </div>
      ) : null}
    </section>
  );
}
