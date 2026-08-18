"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { buttonStyle, fieldStyle, inputStyle } from "../app/orgs/[organizationId]/practice-shell";

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
  const [meta, setMeta] = useState<{ provider?: string; model?: string; generatedAt?: string } | null>(null);

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
        disclaimer: string;
        usage: Usage;
      }>(`/api/v1/organizations/${organizationId}/clients/${clientId}/ai/${action}`, {
        method: "POST",
        body: JSON.stringify({ prompt, ...(foodQuery ? { foodQuery: food } : {}) }),
      });
      setResult(response.result);
      setMeta({ provider: response.provider, model: response.model, generatedAt: response.generatedAt });
      setUsage({
        enabled: true,
        limit: response.usage.limit,
        used: response.usage.used,
        remaining: response.usage.remaining,
        periodKey: response.usage.periodKey,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 16 }}>
      <h3>{title}</h3>
      <p style={{ color: "var(--color-muted)", fontSize: 14 }}>{description}</p>
      <p style={{ fontSize: 13, color: "var(--color-muted)" }}>
        AI-generated — review before use. Not a diagnosis or autonomous treatment decision.
      </p>
      {usage ? (
        <p style={{ fontSize: 13 }}>
          Usage: {usage.used}
          {usage.limit !== null ? ` / ${usage.limit}` : ""}
          {usage.remaining !== null ? ` (${usage.remaining} remaining this ${usage.periodKey})` : ""}
          {!usage.enabled ? " · AI disabled for this organization" : ""}
        </p>
      ) : null}
      {foodQuery ? (
        <label style={fieldStyle}>
          Food search
          <input style={inputStyle} value={food} onChange={(event) => setFood(event.target.value)} placeholder="e.g. salmon" />
        </label>
      ) : null}
      <label style={fieldStyle}>
        {promptLabel}
        <textarea style={{ ...inputStyle, minHeight: 80 }} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={buttonStyle} disabled={loading || usage?.enabled === false} onClick={() => void generate()}>
          {loading ? "Generating…" : "Generate"}
        </button>
        {result ? (
          <>
            <button type="button" style={buttonStyle} onClick={() => void navigator.clipboard.writeText(JSON.stringify(result, null, 2))}>
              Copy
            </button>
            <button type="button" style={buttonStyle} onClick={() => setResult(null)}>
              Dismiss
            </button>
          </>
        ) : null}
      </div>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
      {result ? (
        <pre style={{ marginTop: 12, background: "var(--color-surface)", padding: 12, borderRadius: 8, overflow: "auto", fontSize: 13 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
      {meta ? (
        <p style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 8 }}>
          {meta.provider} · {meta.model} · {meta.generatedAt ? new Date(meta.generatedAt).toLocaleString() : ""}
        </p>
      ) : null}
    </section>
  );
}
