"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, LoadingState, PageHeader, Section, StatusBadge, humanizeLabel } from "@nutrition-saas/ui";
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
  const [data, setData] = useState<PortalMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api<PortalMe>("/api/v1/portal/me")
      .then(setData)
      .catch((err) => setError(errorMessage(err, "Unable to load profile")))
      .finally(() => setLoading(false));
  }, []);

  const name =
    data?.client.displayName?.trim() ||
    `${data?.client.firstName ?? ""} ${data?.client.lastName ?? ""}`.trim() ||
    "—";

  return (
    <section>
      <PageHeader
        eyebrow="Account"
        title="Profile"
        description="Your personal details for the active clinic connection. Contact your dietitian to update clinical information."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? <LoadingState>Loading profile…</LoadingState> : null}

      {!loading && data ? (
        <div className="ui-client-stack">
          <Section title="Personal information" tone="mint">
            {row("Name", name)}
            {row("Email", data.client.email)}
            {row("Phone", data.client.phone)}
            {row("Date of birth", data.client.dateOfBirth)}
            {row("Sex", data.client.sex ? humanizeLabel(data.client.sex) : null)}
            <div className="ui-client-focus-row">
              <span>Status</span>
              <StatusBadge status={data.client.status} label={statusLabel(data.client.status)} />
            </div>
          </Section>

          <Section title="Dietary preferences & restrictions" description="Recorded by your dietitian for this clinic.">
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

          <Section title="Lifestyle">
            {data.profile?.lifestyle?.trim() ? (
              <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{data.profile.lifestyle}</p>
            ) : (
              <p className="ui-muted" style={{ margin: 0 }}>
                No lifestyle notes yet.
              </p>
            )}
          </Section>

          <Section title="Your clinic" description="The dietitian clinic for this connection.">
            <div className="ui-client-focus-row">
              <span>Clinic</span>
              <strong>{data.practiceName?.trim() || "Connected to your dietitian"}</strong>
            </div>
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
