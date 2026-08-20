"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, LoadingState, PageHeader, Section } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";

interface PortalMe {
  client: {
    firstName: string;
    lastName: string;
    displayName: string | null;
  };
  practiceName?: string | null;
  user?: { email?: string | null };
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
      <PageHeader eyebrow="Account" title="Profile" description="Your account details and practice connection." />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? <LoadingState>Loading profile…</LoadingState> : null}

      {!loading ? (
        <div className="ui-client-stack">
          <Section title="Personal information" tone="mint">
            <div className="ui-client-focus-row">
              <span>Name</span>
              <strong>{name}</strong>
            </div>
            {data?.user?.email ? (
              <div className="ui-client-focus-row">
                <span>Email</span>
                <strong>{data.user.email}</strong>
              </div>
            ) : null}
          </Section>

          <Section title="Your practice" description="The dietitian practice you’re connected to.">
            <div className="ui-client-focus-row">
              <span>Practice</span>
              <strong>{data?.practiceName?.trim() || "Connected to your dietitian"}</strong>
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
