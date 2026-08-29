"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Field, Input, Textarea } from "@nutrition-saas/ui";
import { api } from "../lib/api";
import { errorMessage } from "../lib/humanize-error";
import { humanizeLabel } from "@nutrition-saas/ui";

export const AI_MESSAGE_DRAFT_STORAGE_PREFIX = "ai-message-draft:";

export function aiMessageDraftStorageKey(clientId: string): string {
  return `${AI_MESSAGE_DRAFT_STORAGE_PREFIX}${clientId}`;
}

interface Usage {
  enabled: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  periodKey: string;
  tokens?: { used: number; limit: number | null; remaining: number | null };
}

export type AiDraftDay = {
  planId: string;
  versionId: string;
  dayId: string;
};

interface AiPanelProps {
  dietitianAccountId: string;
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
  compact?: boolean;
  apply?: "note" | "message" | "meal";
  draftDay?: AiDraftDay | null;
  showUsage?: boolean;
  showModel?: boolean;
  chrome?: "card" | "plain";
  hideHeader?: boolean;
  hideComposer?: boolean;
  initialResult?: Record<string, unknown> | null;
  initialPrompt?: string;
  initialFood?: string;
  onUsageChange?: (usage: Usage) => void;
  onGenerated?: (payload: {
    draftId?: string;
    result: Record<string, unknown>;
    usage: Usage & { tokens?: { used: number; limit: number | null; remaining: number | null } };
  }) => void;
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

function flattenResult(result: Record<string, unknown>): string {
  return Object.values(result)
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
    .join("\n");
}

function noteBodyFromResult(result: Record<string, unknown>): string {
  const text = flattenResult(result).trim();
  if (text.length <= 4000) return text;
  return `${text.slice(0, 3990).trimEnd()}…`;
}

export function flattenAiResult(result: Record<string, unknown>): string {
  return flattenResult(result);
}

export function AiAnswer({
  result,
  apply,
  dietitianAccountId,
  clientId,
  draftDay = null,
}: {
  result: Record<string, unknown>;
  apply?: "note" | "message" | "meal";
  dietitianAccountId: string;
  clientId: string;
  draftDay?: AiDraftDay | null;
}) {
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const copyText = flattenResult(result);

  async function applyDraft() {
    if (!apply) return;
    setApplying(true);
    setError(null);
    setNotice(null);
    try {
      if (apply === "note") {
        const body = noteBodyFromResult(result);
        await api(`/api/v1/dietitian/${dietitianAccountId}/clients/${clientId}/chart-notes`, {
          method: "POST",
          body: JSON.stringify({ kind: "CLINICAL", body }),
        });
        setNotice(body.length >= 4000 ? "Saved to clinical notes (truncated to 4,000 characters)." : "Saved to clinical notes.");
      } else if (apply === "message") {
        const subject = typeof result.subject === "string" ? result.subject : "";
        const body = typeof result.body === "string" ? result.body : flattenResult(result);
        sessionStorage.setItem(aiMessageDraftStorageKey(clientId), JSON.stringify({ subject, body }));
        window.location.href = `/practice/${dietitianAccountId}/messages?clientId=${encodeURIComponent(clientId)}`;
      } else if (apply === "meal") {
        if (!draftDay) {
          setError("Open a draft day first");
          return;
        }
        const suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
        const first = suggestions[0] && typeof suggestions[0] === "object" ? (suggestions[0] as Record<string, unknown>) : null;
        const name = typeof first?.title === "string" && first.title.trim() ? first.title.trim() : "AI suggestion";
        const notes = flattenResult(result);
        if (!window.confirm(`Add “${name}” as a meal on this draft day? Foods are not created automatically — review the notes.`)) {
          return;
        }
        await api(
          `/api/v1/dietitian/${dietitianAccountId}/meal-plans/${draftDay.planId}/versions/${draftDay.versionId}/days/${draftDay.dayId}/meals`,
          { method: "POST", body: JSON.stringify({ name, notes }) },
        );
        setNotice("Added as a meal with notes on the draft day.");
      }
    } catch (err) {
      setError(errorMessage(err, "Could not apply this draft"));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="ui-ai-msg ui-ai-msg--ai">
      <div className="ui-ai-msg__body">{renderResult(result)}</div>
      <div className="ui-ai-msg__actions">
        <button
          type="button"
          className="ui-ai-msg__icon"
          aria-label="Copy"
          title="Copy"
          onClick={() => void navigator.clipboard.writeText(copyText)}
        >
          <CopyIcon />
        </button>
        {apply ? (
          <button
            type="button"
            className="ui-ai-msg__action"
            disabled={applying || (apply === "meal" && !draftDay)}
            onClick={() => void applyDraft()}
          >
            {applying ? "Applying…" : apply === "message" ? "Use in Messages" : apply === "meal" ? "Add as meal notes" : "Save as note"}
          </button>
        ) : null}
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function AiPanel({
  dietitianAccountId,
  clientId,
  action,
  title,
  description,
  promptLabel = "Optional instructions",
  foodQuery = false,
  compact = false,
  apply,
  draftDay = null,
  showUsage = true,
  showModel = true,
  chrome = "card",
  hideHeader = false,
  hideComposer = false,
  initialResult = null,
  initialPrompt = "",
  initialFood = "",
  onUsageChange,
  onGenerated,
}: AiPanelProps) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [food, setFood] = useState(initialFood);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(initialResult);
  const [meta, setMeta] = useState<{ provider?: string; model?: string } | null>(null);
  const onUsageChangeRef = useRef(onUsageChange);
  onUsageChangeRef.current = onUsageChange;

  useEffect(() => {
    if (hideComposer && !showUsage) return;
    void api<Usage>(`/api/v1/dietitian/${dietitianAccountId}/ai/usage`)
      .then((data) => {
        setUsage(data);
        onUsageChangeRef.current?.(data);
      })
      .catch(() => setUsage(null));
  }, [dietitianAccountId, hideComposer, showUsage]);

  async function generate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await api<{
        draftId?: string;
        result: Record<string, unknown>;
        provider: string;
        model: string;
        generatedAt: string;
        usage: Usage & { tokens?: { used: number; limit: number | null; remaining: number | null } };
      }>(`/api/v1/dietitian/${dietitianAccountId}/clients/${clientId}/ai/${action}`, {
        method: "POST",
        body: JSON.stringify({ prompt, ...(foodQuery ? { foodQuery: food } : {}) }),
      });
      setResult(response.result);
      setMeta({ provider: response.provider, model: response.model });
      const nextUsage = {
        enabled: true,
        limit: response.usage.limit,
        used: response.usage.used,
        remaining: response.usage.remaining,
        periodKey: response.usage.periodKey,
        tokens: response.usage.tokens,
      };
      setUsage(nextUsage);
      onUsageChangeRef.current?.(nextUsage);
      onGenerated?.({ draftId: response.draftId, result: response.result, usage: response.usage });
    } catch (err) {
      setError(errorMessage(err, "Unable to generate a draft"));
    } finally {
      setLoading(false);
    }
  }

  async function applyDraft() {
    if (!result || !apply) return;
    setApplying(true);
    setError(null);
    setNotice(null);
    try {
      if (apply === "note") {
        const body = noteBodyFromResult(result);
        await api(`/api/v1/dietitian/${dietitianAccountId}/clients/${clientId}/chart-notes`, {
          method: "POST",
          body: JSON.stringify({ kind: "CLINICAL", body }),
        });
        setNotice(body.length >= 4000 ? "Saved to clinical notes (truncated to 4,000 characters)." : "Saved to clinical notes.");
      } else if (apply === "message") {
        const subject = typeof result.subject === "string" ? result.subject : "";
        const body = typeof result.body === "string" ? result.body : flattenResult(result);
        sessionStorage.setItem(aiMessageDraftStorageKey(clientId), JSON.stringify({ subject, body }));
        window.location.href = `/practice/${dietitianAccountId}/messages?clientId=${encodeURIComponent(clientId)}`;
      } else if (apply === "meal") {
        if (!draftDay) {
          setError("Open a draft day first");
          return;
        }
        const suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
        const first = suggestions[0] && typeof suggestions[0] === "object" ? (suggestions[0] as Record<string, unknown>) : null;
        const name = typeof first?.title === "string" && first.title.trim() ? first.title.trim() : "AI suggestion";
        const notes = flattenResult(result);
        if (!window.confirm(`Add “${name}” as a meal on this draft day? Foods are not created automatically — review the notes.`)) {
          return;
        }
        await api(
          `/api/v1/dietitian/${dietitianAccountId}/meal-plans/${draftDay.planId}/versions/${draftDay.versionId}/days/${draftDay.dayId}/meals`,
          { method: "POST", body: JSON.stringify({ name, notes }) },
        );
        setNotice("Added as a meal with notes on the draft day.");
      }
    } catch (err) {
      setError(errorMessage(err, "Could not apply this draft"));
    } finally {
      setApplying(false);
    }
  }

  const copyText = result ? flattenResult(result) : "";

  const aiDisabled = usage?.enabled === false;
  const budgetGone =
    (usage?.remaining !== null && usage?.remaining === 0) ||
    (usage?.tokens?.remaining !== null && usage?.tokens?.remaining === 0);
  const usageLine = usage?.enabled
    ? `${usage.used}${usage.limit !== null ? ` / ${usage.limit}` : ""} requests${usage.tokens ? ` · ${usage.tokens.used.toLocaleString()}${usage.tokens.limit != null ? ` / ${usage.tokens.limit.toLocaleString()}` : ""} tokens` : ""} this ${humanizeLabel(usage.periodKey)}`
    : null;

  const mockModel = meta?.provider === "mock" || meta?.model === "mock-model";
  const header = hideHeader ? null : chrome === "plain" ? (
    <header className="ui-ai-panel__head">
      <h2 className="ui-ai-panel__title">{title}</h2>
      <p className="ui-muted">{description}</p>
    </header>
  ) : (
    <>
      <h2 className="ui-card__title">{title}</h2>
      <p className="ui-muted" style={{ marginBottom: 10 }}>
        {description}
      </p>
    </>
  );

  const body = (
    <>
      {header}
      {!hideHeader ? (
        <div className="ui-ai-panel__badges">
          <Badge tone="warning">Review before use</Badge>
          {showUsage && usage !== null ? (
            <Badge tone={aiDisabled ? "danger" : "neutral"}>
              {aiDisabled ? "AI not enabled for this clinic" : usageLine}
            </Badge>
          ) : null}
        </div>
      ) : null}

      {result ? (
        <div className="ui-ai-bubble">
          {renderResult(result)}
          <div className="ui-ai-bubble__actions">
            <Button size="sm" variant="secondary" onClick={() => void navigator.clipboard.writeText(copyText)}>
              Copy all
            </Button>
            {apply ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={applying || (apply === "meal" && !draftDay)}
                title={apply === "meal" && !draftDay ? "Open a draft day first" : undefined}
                onClick={() => void applyDraft()}
              >
                {applying ? "Applying…" : apply === "message" ? "Use in Messages" : apply === "meal" ? "Add as meal notes" : "Save as note"}
              </Button>
            ) : null}
            {showModel && meta?.model && !mockModel ? <span className="ui-hint">{meta.model}</span> : null}
          </div>
        </div>
      ) : null}

      {!hideComposer ? (
        <div className="ui-ai-panel__composer">
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
              style={{ minHeight: compact ? 56 : 72 }}
            />
          </Field>
          <div className="ui-row">
            <Button disabled={loading || aiDisabled || budgetGone} onClick={() => void generate()}>
              {loading ? "Generating…" : result ? "Generate again" : "Generate"}
            </Button>
          </div>
          {apply === "meal" && !draftDay ? (
            <p className="ui-hint" style={{ marginTop: 8, marginBottom: 0 }}>
              Open a draft day first to apply a meal suggestion.
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}
      {notice ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="success">{notice}</Alert>
        </div>
      ) : null}
    </>
  );

  return chrome === "plain" ? <div className="ui-ai-panel">{body}</div> : <Card>{body}</Card>;
}
