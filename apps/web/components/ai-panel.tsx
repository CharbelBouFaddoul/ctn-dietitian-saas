"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Field, Input, Section, Textarea } from "@nutrition-saas/ui";
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

function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  return (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"));
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        fontWeight: 600,
        marginBottom: 6,
        marginTop: 0,
        fontSize: "0.8125rem",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: "var(--color-muted)",
      }}
    >
      {children}
    </p>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
      {items.map((item, i) => (
        <li key={i} style={{ lineHeight: 1.55, fontSize: "0.9375rem" }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

function renderResult(result: Record<string, unknown>): ReactNode {
  const sections: ReactNode[] = [];

  // ── Prose paragraphs ──────────────────────────────────────────────
  const proseKeys: Array<[string, string?]> = [
    ["overview"],
    ["explanation"],
    ["summary"],
    ["insights"],
    ["assessment"],
    ["narrative"],
    ["conclusion"],
  ];
  for (const [key] of proseKeys) {
    if (typeof result[key] === "string" && !looksLikeJson(result[key] as string)) {
      sections.push(
        <p key={key} style={{ lineHeight: 1.6, marginTop: 0 }}>
          {result[key] as string}
        </p>,
      );
    }
  }

  // ── Email/message shape ───────────────────────────────────────────
  if (typeof result.subject === "string") {
    sections.push(
      <p key="subject" style={{ marginTop: 0 }}>
        <strong>Subject: {result.subject}</strong>
      </p>,
    );
  }
  if (typeof result.body === "string") {
    sections.push(
      <pre
        key="body"
        style={{
          whiteSpace: "pre-wrap",
          fontFamily: "inherit",
          lineHeight: 1.6,
          background: "var(--color-surface-raised, #f8f8f8)",
          padding: "12px 16px",
          borderRadius: 8,
          border: "1px solid var(--color-border)",
          margin: "8px 0",
          fontSize: "0.9375rem",
        }}
      >
        {result.body}
      </pre>,
    );
  }

  // ── Named bullet lists ────────────────────────────────────────────
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
    ["recommendations", "Recommendations"],
    ["concerns", "Concerns"],
    ["priorities", "Priorities"],
    ["highlights", "Highlights"],
    ["goals", "Goals"],
  ];

  for (const [key, label] of namedLists) {
    const items = asList(result[key]);
    if (items.length) {
      sections.push(
        <div key={key} style={{ marginTop: 14 }}>
          <SectionLabel>{label}</SectionLabel>
          <BulletList items={items} />
        </div>,
      );
    }
  }

  // ── Suggestions (structured objects) ─────────────────────────────
  if (Array.isArray(result.suggestions) && result.suggestions.length) {
    sections.push(
      <div key="suggestions" style={{ marginTop: 14 }}>
        <SectionLabel>Suggestions</SectionLabel>
        <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
          {result.suggestions.map((item, index) => {
            const row = item as { title?: string; meal?: string; notes?: string };
            return (
              <li key={index} style={{ lineHeight: 1.55, fontSize: "0.9375rem" }}>
                <strong>{row.title ?? "Suggestion"}</strong>
                {row.meal ? <span className="ui-muted"> · {row.meal}</span> : null}
                {row.notes ? <span className="ui-muted"> — {row.notes}</span> : null}
              </li>
            );
          })}
        </ul>
      </div>,
    );
  }

  // ── Substitutions ─────────────────────────────────────────────────
  if (Array.isArray(result.substitutions) && result.substitutions.length) {
    sections.push(
      <div key="subs" style={{ marginTop: 14 }}>
        <SectionLabel>Substitutions</SectionLabel>
        <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
          {result.substitutions.map((item, index) => {
            const row = item as { from?: string; to?: string; reason?: string };
            return (
              <li key={index} style={{ lineHeight: 1.55, fontSize: "0.9375rem" }}>
                <strong>{row.from}</strong>
                {" → "}
                <strong>{row.to}</strong>
                {row.reason ? <span className="ui-muted"> ({row.reason})</span> : null}
              </li>
            );
          })}
        </ul>
      </div>,
    );
  }

  // ── Fallback: render readable scalar fields only ──────────────────
  if (!sections.length) {
    const rendered = Object.entries(result)
      .filter(([, value]) => (typeof value === "string" || typeof value === "number") && !looksLikeJson(String(value)))
      .map(([key, value]) => (
        <p key={key} style={{ margin: "4px 0", fontSize: "0.9375rem" }}>
          <strong>{humanizeLabel(key)}:</strong> {String(value)}
        </p>
      ));

    if (!rendered.length) {
      return <p className="ui-muted">The AI returned a response but no readable content was found.</p>;
    }
    return rendered;
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
    setResult(null);
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
        .flatMap((value) =>
          Array.isArray(value)
            ? value.map((item) =>
                typeof item === "string"
                  ? item
                  : Object.values(item as Record<string, unknown>)
                      .filter((v) => typeof v === "string")
                      .join(" — "),
              )
            : typeof value === "string"
              ? [value]
              : [],
        )
        .join("\n")
    : "";

  const aiDisabled = usage?.enabled === false;
  const usageLine = usage?.enabled
    ? `${usage.used}${usage.limit !== null ? ` / ${usage.limit}` : ""} used this ${humanizeLabel(usage.periodKey)}${usage.remaining !== null ? ` · ${usage.remaining} remaining` : ""}`
    : null;

  return (
    <Card title={title}>
      <p className="ui-muted" style={{ marginBottom: 10 }}>
        {description}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <Badge tone="warning">AI-generated — review before use</Badge>
        {usage !== null ? (
          <Badge tone={aiDisabled ? "danger" : "neutral"}>
            {aiDisabled ? "AI not enabled for this practice" : usageLine}
          </Badge>
        ) : null}
      </div>

      {foodQuery ? (
        <Field label="Food search">
          <Input value={food} onChange={(e) => setFood(e.target.value)} placeholder="e.g. salmon, almonds…" />
        </Field>
      ) : null}

      <Field label={promptLabel}>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Leave blank for default behaviour, or add specific instructions…"
          style={{ minHeight: 80 }}
        />
      </Field>

      <div className="ui-row">
        <Button disabled={loading || aiDisabled} onClick={() => void generate()}>
          {loading ? "Generating…" : "Generate"}
        </Button>
        {result ? (
          <>
            <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(copyText)}>
              Copy all
            </Button>
            <Button variant="ghost" onClick={() => setResult(null)}>
              Clear
            </Button>
          </>
        ) : null}
      </div>

      {error ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      {result ? (
        <div style={{ marginTop: 16 }}>
          <Section tone="muted">
            {renderResult(result)}
            {meta?.model ? (
              <p className="ui-hint" style={{ marginTop: 14, marginBottom: 0 }}>
                Generated by {meta.model}
                {meta.provider && meta.provider !== meta.model ? ` (${meta.provider})` : ""}
              </p>
            ) : null}
          </Section>
        </div>
      ) : null}
    </Card>
  );
}
