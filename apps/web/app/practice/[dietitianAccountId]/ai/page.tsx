"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, Badge, Card, PageHeader, Section, humanizeLabel } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";

interface Usage {
  enabled: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  periodKey: string;
}

const AI_TOOLS = [
  {
    key: "client-summary",
    title: "Client summary",
    description:
      "A concise overview of a client's health profile, goals, and recent activity — ready to share in a consultation.",
  },
  {
    key: "meal-plan-assistance",
    title: "Meal plan suggestions",
    description:
      "AI-generated meal plan ideas personalised to a client's dietary goals, restrictions, and logged history.",
  },
  {
    key: "message-draft",
    title: "Message draft",
    description:
      "A drafted follow-up message or coaching note — edit before sending. Never goes to the client automatically.",
  },
  {
    key: "consultation-summary",
    title: "Consultation notes",
    description:
      "Talking points, key observations, and follow-up actions summarised after a session.",
  },
] as const;

export default function PracticeAiPage() {
  const params = useParams<{ dietitianAccountId: string }>();
  const dietitianAccountId = params.dietitianAccountId;
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Usage>(`/api/v1/dietitian/${dietitianAccountId}/ai/usage`)
      .then(setUsage)
      .catch((err) => setError(errorMessage(err, "Unable to load AI usage")));
  }, [dietitianAccountId]);

  const aiEnabled = usage === null || usage.enabled;
  const usageText =
    usage && usage.enabled
      ? `${usage.used}${usage.limit !== null ? ` / ${usage.limit}` : ""} used this ${humanizeLabel(usage.periodKey)}${usage.remaining !== null ? ` · ${usage.remaining} remaining` : ""}`
      : null;

  return (
    <section>
      <PageHeader
        title="AI assist"
        description="Every AI output is a draft you review — nothing reaches a client without your approval. Open any client workspace to run the tools below."
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
        ) : (
          <Badge tone="neutral">Checking…</Badge>
        )}
        {usageText ? <Badge tone="neutral">{usageText}</Badge> : null}
      </div>

      <Section
        title="Available tools"
        description="All tools run inside a client workspace. Select a client, then look for the AI assist tab."
      >
        <div className="ui-grid">
          {AI_TOOLS.map((tool) => (
            <Card key={tool.key}>
              <h3 style={{ margin: "0 0 6px", fontSize: "0.9375rem", fontWeight: 600 }}>{tool.title}</h3>
              <p className="ui-muted" style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.55 }}>
                {tool.description}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      {!aiEnabled ? (
        <Alert tone="warning">
          AI is not currently enabled for this clinic. Contact support to enable the feature.
        </Alert>
      ) : (
        <Section tone="muted">
          <p style={{ margin: 0, fontSize: "0.875rem" }}>
            AI tools open inside a client's workspace — not on this page.{" "}
            <Link href={`/practice/${dietitianAccountId}/clients`} className="ui-link">
              Browse clients →
            </Link>
          </p>
        </Section>
      )}
    </section>
  );
}
