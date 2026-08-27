"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Alert, Badge, EmptyState, Field, LoadingState, PageHeader, Select, humanizeLabel } from "@nutrition-saas/ui";
import { AiPanel } from "../../../../components/ai-panel";
import { api } from "../../../../lib/api";
import { clientDisplayName } from "../../../../lib/client-identity";
import { errorMessage } from "../../../../lib/humanize-error";
import { usePractice } from "../practice-shell";

interface Usage {
  enabled: boolean;
  available?: boolean;
  providerConfigured?: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  periodKey: string;
}

interface ClientRow {
  id: string;
  firstName: string;
  lastName: string;
  displayName?: string | null;
}

export default function PracticeAiPage() {
  const params = useParams<{ dietitianAccountId: string }>();
  const dietitianAccountId = params.dietitianAccountId;
  const router = useRouter();
  const { aiAvailable } = usePractice();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!aiAvailable) {
      router.replace(`/practice/${dietitianAccountId}`);
      return;
    }
    void api<Usage>(`/api/v1/dietitian/${dietitianAccountId}/ai/usage`)
      .then((data) => {
        const available = data.available ?? (data.enabled && data.providerConfigured !== false);
        if (!available) {
          router.replace(`/practice/${dietitianAccountId}`);
          return;
        }
        setUsage(data);
      })
      .catch((err) => setError(errorMessage(err, "Unable to load AI usage")));
  }, [dietitianAccountId, aiAvailable, router]);

  useEffect(() => {
    if (!aiAvailable) return;
    let cancelled = false;
    void api<{ items: ClientRow[] }>(`/api/v1/dietitian/${dietitianAccountId}/clients?pageSize=50`)
      .then((result) => {
        if (cancelled) return;
        setClients(result.items);
        const preset =
          typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("clientId") : null;
        if (preset) setClientId(preset);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, "Unable to load clients"));
      });
    return () => {
      cancelled = true;
    };
  }, [aiAvailable, dietitianAccountId]);

  if (!aiAvailable) {
    return <LoadingState>Opening clinic…</LoadingState>;
  }

  const usageText =
    usage && usage.enabled
      ? `${usage.used}${usage.limit !== null ? ` / ${usage.limit}` : ""} used this ${humanizeLabel(usage.periodKey)}${usage.remaining !== null ? ` · ${usage.remaining} remaining` : ""}`
      : null;

  return (
    <section>
      <PageHeader
        title="AI assist"
        description="Every AI output is a draft you review — nothing reaches a client without your approval. Choose a patient to generate notes, summaries, and message drafts."
        actions={
          <Link href={`/practice/${dietitianAccountId}/clients`} className="ui-btn ui-btn--primary">
            Open a client
          </Link>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {usage !== null ? (
          <Badge tone={usage.enabled ? "success" : "danger"}>
            {usage.enabled ? "AI enabled" : "AI not enabled for this clinic"}
          </Badge>
        ) : null}
        {usageText ? <Badge tone="neutral">{usageText}</Badge> : null}
      </div>

      <div style={{ maxWidth: "22rem", marginBottom: 20 }}>
        <Field label="Patient">
          <Select
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            aria-label="Select a patient for AI tools"
          >
            <option value="">Select a patient…</option>
            {clientId && !clients.some((client) => client.id === clientId) ? (
              <option value={clientId}>Selected patient</option>
            ) : null}
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {clientDisplayName(client)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {clientId ? (
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
            description="Draft only — send from Messages when ready."
          />
        </div>
      ) : (
        <EmptyState title="Select a patient">
          AI drafts use that person’s chart. Pick a client to generate a summary, meal-plan ideas, or a message.
        </EmptyState>
      )}
    </section>
  );
}
