"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Alert, Badge, Card, LoadingState, PageHeader, Section, humanizeLabel } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
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
  const router = useRouter();
  const { aiAvailable } = usePractice();
  const [usage, setUsage] = useState<Usage | null>(null);
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
        ) : null}
        {usageText ? <Badge tone="neutral">{usageText}</Badge> : null}
      </div>

      <Section title="Available tools" description="Run these from a client chart under Clinic tools → AI.">
        <div className="ui-grid">
          {AI_TOOLS.map((tool) => (
            <Card key={tool.key} title={tool.title}>
              <p className="ui-muted" style={{ margin: 0 }}>
                {tool.description}
              </p>
            </Card>
          ))}
        </div>
      </Section>
    </section>
  );
}
