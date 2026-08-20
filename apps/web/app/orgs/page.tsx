"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, EmptyState, Field, Input, LoadingState, PageHeader } from "@nutrition-saas/ui";
import { humanizeLabel } from "@nutrition-saas/ui";
import { ApiError, api, logout } from "../../lib/api";
import { errorMessage } from "../../lib/humanize-error";
import { loginPathFor, resolveSessionHome } from "../../lib/session-home";

interface Org {
  id: string;
  name: string;
  slug: string;
  status: string;
  role: string;
}

const defaultSettings = {
  timezone: "UTC",
  locale: "en",
  currency: "USD",
  weightUnit: "kg",
  heightUnit: "cm",
  dateFormat: "YYYY-MM-DD",
};

export default function OrganizationsPage() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const home = await resolveSessionHome();
      if (home.kind === "unauthenticated") {
        router.replace(loginPathFor("dietitian"));
        return;
      }
      if (home.kind === "client") {
        router.replace("/client");
        return;
      }
      setOrgs(await api<Org[]>("/api/v1/organizations"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace(loginPathFor("dietitian"));
        return;
      }
      setError(errorMessage(err, "Unable to load organizations"));
      setOrgs([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const created = await api<Org>("/api/v1/organizations", {
        method: "POST",
        body: JSON.stringify({ name, settings: defaultSettings }),
      });
      router.replace(`/orgs/${created.id}`);
    } catch (err) {
      setError(errorMessage(err, "Create failed"));
    }
  }

  async function onLogout() {
    await logout();
    router.replace(loginPathFor("dietitian"));
  }

  if (orgs === null) {
    return <LoadingState>Loading practices…</LoadingState>;
  }

  return (
    <main className="ui-mkt__section">
      <PageHeader
        eyebrow="Practice"
        title="Your practices"
        description="Open a clinic workspace or create a new one."
        actions={
          <Button variant="ghost" onClick={() => void onLogout()}>
            Sign out
          </Button>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="ui-stack">
        {orgs.length === 0 ? (
          <EmptyState title="No practices yet">Create one to continue.</EmptyState>
        ) : (
          orgs.map((org) => (
            <Card key={org.id}>
              <Link href={`/orgs/${org.id}`} className="ui-link">
                {org.name}
              </Link>
              <p className="ui-muted">
                {humanizeLabel(org.role)} · {humanizeLabel(org.status)}
              </p>
            </Card>
          ))
        )}
        <Card title="Create a practice">
          <form onSubmit={(event) => void onSubmit(event)}>
            <Field label="Practice name">
              <Input value={name} onChange={(event) => setName(event.target.value)} minLength={2} required />
            </Field>
            <Button type="submit">Create</Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
