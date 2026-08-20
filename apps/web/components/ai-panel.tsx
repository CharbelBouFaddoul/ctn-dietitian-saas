"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Alert, Button, Card, Field, Input, Textarea } from "@nutrition-saas/ui";
import { api } from "../lib/api";
import { errorMessage } from "../lib/humanize-error";
import { humanizeLabel } from "@nutrition-saas/ui";

interface Usage {
  enabled: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  periodKey: string;
}

interface AiPanelProps {
  organizationId: string;
  clientId: string;
  action:
    | "client-summary"
    | "meal-plan-assistance"
    | "nutrition-assistance"
    | "consultation-summary"
    | "message-draft";
  title: string;
  description: string;
  promptLabel?: string;
  foodQuery?: boolean;
}

function asList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function renderResult(result: Record<string, unknown>): ReactNode {
  const sections: ReactNode[] = [];
  if (typeof result.overview === "string") sections.push(<p key="overview">{result.overview}</p>);
  if (typeof result.explanation === "string") sections.push(<p key="explanation">{result.explanation}</p>);
  if (typeof result.summary === "string") sections.push(<p key="summary">{result.summary}</p>);
  if (typeof result.subject === "string") sections.push(<p key="subject"><strong>{result.subject}</strong></p>);
  if (typeof result.body === "string") sections.push(<p key="body" style={{ whiteSpace: "pre-wrap" }}>{result.body}</p>);

  const namedLists: Array<[string, string]> = [
    ["observations", "Observations"],
    ["adherence", "Adherence"],
    ["areas_to_review", "Areas to review"],
    ["suggested_questions", "Suggested questions"],
    ["notes", "Notes"],
    ["talking_points", "Talking points"],
    ["key_points", "Key points"],
    ["follow_up_questions", "Follow-up questions"],
    ["action_items", "Action items"],
  ];
  for (const [key, title] of namedLists) {
    const items = asList(result[key]);
    if (items.length) {
      sections.push(
        <div key={key}>
          <h4>{title}</h4>
          <ul>
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>,
      );
    }
  }

  if (Array.isArray(result.suggestions)) {
    sections.push(
      <div key="suggestions">
        <h4>Suggestions</h4>
        <ul>
          {result.suggestions.map((item, index) => {
            const row = item as { title?: string; meal?: string; notes?: string };
            return (
              <li key={index}>
                <strong>{row.title ?? "Suggestion"}</strong>
                {row.meal ? ` · ${row.meal}` : ""}
                {row.notes ? ` — ${row.notes}` : ""}
              </li>
            );
          })}
        </ul>
      </div>,
    );
  }

  if (Array.isArray(result.substitutions)) {
    sections.push(
      <div key="subs">
        <h4>Substitutions</h4>
        <ul>
          {result.substitutions.map((item, index) => {
            const row = item as { from?: string; to?: string; reason?: string };
            return (
              <li key={index}>
                {row.from} → {row.to}
                {row.reason ? ` (${row.reason})` : ""}
              </li>
            );
          })}
        </ul>
      </div>,
    );
  }

  if (!sections.length) {
    const leftover = Object.entries(result).filter(([, value]) => typeof value === "string" || typeof value === "number");
    if (!leftover.length) return <p className="ui-muted">No readable draft was returned.</p>;
    return leftover.map(([key, value]) => (
      <p key={key}>
        <strong>{humanizeLabel(key)}:</strong> {String(value)}
      </p>
    ));
  }
  return sections;
}

export function AiPanel({
  organizationId,
  clientId,
  action,
  title,
  description,
  promptLabel = "Optional instructions",
  foodQuery = false,
}: AiPanelProps) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [prompt, setPrompt] = useState("");
  const [food, setFood] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [meta, setMeta] = useState<{ provider?: string; model?: string } | null>(null);

  useEffect(() => {
    void api<Usage>(`/api/v1/organizations/${organizationId}/ai/usage`)
      .then(setUsage)
      .catch(() => setUsage(null));
  }, [organizationId]);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const response = await api<{
        result: Record<string, unknown>;
        provider: string;
        model: string;
        generatedAt: string;
        usage: Usage;
      }>(`/api/v1/organizations/${organizationId}/clients/${clientId}/ai/${action}`, {
        method: "POST",
        body: JSON.stringify({ prompt, ...(foodQuery ? { foodQuery: food } : {}) }),
      });
      setResult(response.result);
      setMeta({ provider: response.provider, model: response.model });
      setUsage({
        enabled: true,
        limit: response.usage.limit,
        used: response.usage.used,
        remaining: response.usage.remaining,
        periodKey: response.usage.periodKey,
      });
    } catch (err) {
      setError(errorMessage(err, "Unable to generate a draft"));
    } finally {
      setLoading(false);
    }
  }

  const copyText = result
    ? Object.values(result)
        .flatMap((value) => (Array.isArray(value) ? value.map((item) => (typeof item === "string" ? item : JSON.stringify(item))) : [String(value)]))
        .join("\n")
    : "";

  return (
    <Card title={title}>
      <p className="ui-muted">{description}</p>
      <p className="ui-hint">AI-generated — review before use. Not a diagnosis.</p>
      {usage ? (
        <p className="ui-hint">
          {usage.used}
          {usage.limit !== null ? ` / ${usage.limit}` : ""} used
          {usage.remaining !== null ? ` · ${usage.remaining} remaining this ${humanizeLabel(usage.periodKey)}` : ""}
          {!usage.enabled ? " · AI is not enabled for this practice" : ""}
        </p>
      ) : null}
      {foodQuery ? (
        <Field label="Food search">
          <Input value={food} onChange={(event) => setFood(event.target.value)} placeholder="e.g. salmon" />
        </Field>
      ) : null}
      <Field label={promptLabel}>
        <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      </Field>
      <div className="ui-row">
        <Button disabled={loading || usage?.enabled === false} onClick={() => void generate()}>
          {loading ? "Generating…" : "Generate"}
        </Button>
        {result ? (
          <>
            <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(copyText)}>
              Copy
            </Button>
            <Button variant="ghost" onClick={() => setResult(null)}>
              Dismiss
            </Button>
          </>
        ) : null}
      </div>
      {error ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}
      {result ? <div style={{ marginTop: 16 }}>{renderResult(result)}</div> : null}
      {meta?.model ? <p className="ui-hint">{meta.model}</p> : null}
    </Card>
  );
}
