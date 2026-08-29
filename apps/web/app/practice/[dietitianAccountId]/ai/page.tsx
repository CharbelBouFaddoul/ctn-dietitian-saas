"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  DonutChart,
  EmptyState,
  LoadingState,
  Section,
  Table,
  Td,
  TrendChart,
  humanizeLabel,
  type DonutSlice,
  type TrendPoint,
} from "@nutrition-saas/ui";
import { AiAnswer } from "../../../../components/ai-panel";
import { ListPager } from "../../../../components/list-filters";
import { SearchableSelect } from "../../../../components/searchable-select";
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
  previousPeriodKey?: string;
  currentPeriodKey?: string;
  requests?: { used: number; limit: number | null; remaining: number | null };
  tokens?: { used: number; limit: number | null; remaining: number | null; input: number; output: number };
  costUsd?: number;
  byDay?: Array<{ date: string; requests: number; tokens: number; costUsd: number }>;
  byAction?: Array<{ action: string; requests: number; tokens: number; costUsd: number }>;
  recent?: Array<{
    id: string;
    requestedAt: string;
    action: string;
    status: string;
    clientId: string | null;
    clientName: string | null;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    latencyMs: number | null;
  }>;
}

interface ClientRow {
  id: string;
  firstName: string;
  lastName: string;
  displayName?: string | null;
}

interface DraftRow {
  id: string;
  clientId: string;
  clientName: string;
  action: string;
  userInput: string | null;
  foodQuery: string | null;
  createdAt: string;
}

interface DraftTurn {
  userInput: string | null;
  foodQuery: string | null;
  result: Record<string, unknown>;
  createdAt: string;
}

interface DraftDetail extends DraftRow {
  result: Record<string, unknown>;
  messages?: DraftTurn[];
}

type ToolId =
  | "client-summary"
  | "consultation-summary"
  | "meal-plan-assistance"
  | "nutrition-assistance"
  | "message-draft";

const TOOLS: Array<{
  id: ToolId;
  title: string;
  blurb: string;
  description: string;
  apply?: "note" | "message";
  foodQuery?: boolean;
}> = [
  {
    id: "client-summary",
    title: "Client summary",
    blurb: "Overview for the chart",
    description: "Overview from the clinical chart, goals, measurements, and evaluations.",
    apply: "note",
  },
  {
    id: "consultation-summary",
    title: "Consultation",
    blurb: "Visit recap and follow-ups",
    description: "Draft summary and follow-up questions for your next visit.",
    apply: "note",
  },
  {
    id: "meal-plan-assistance",
    title: "Meal plan",
    blurb: "Ideas to review on a draft day",
    description: "Suggestions only — apply as meal notes from the meal-plan editor.",
  },
  {
    id: "nutrition-assistance",
    title: "Nutrition",
    blurb: "Explain a food from your database",
    description: "Explain foods using values from your food database.",
    foodQuery: true,
  },
  {
    id: "message-draft",
    title: "Message",
    blurb: "Draft to send from Messages",
    description: "Draft only — send from Messages when ready.",
    apply: "message",
  },
];

const TOOL_IDS = new Set<string>(TOOLS.map((tool) => tool.id));

const ACTION_TO_TOOL: Record<string, ToolId> = {
  CLIENT_SUMMARY: "client-summary",
  CONSULTATION_SUMMARY: "consultation-summary",
  MEAL_PLAN_ASSISTANCE: "meal-plan-assistance",
  NUTRITION_ASSISTANCE: "nutrition-assistance",
  MESSAGE_DRAFT: "message-draft",
};

const ACTION_COLORS: Record<string, string> = {
  CLIENT_SUMMARY: "#0f766e",
  MEAL_PLAN_ASSISTANCE: "#3b82f6",
  NUTRITION_ASSISTANCE: "#8b5cf6",
  CONSULTATION_SUMMARY: "#f59e0b",
  MESSAGE_DRAFT: "#10b981",
};

function formatUsd(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function formatPeriodKey(key?: string): string {
  if (!key || !/^\d{4}-\d{2}$/.test(key)) return "This month";
  const [year, month] = key.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

function usedPct(used: number, limit: number | null | undefined): number | null {
  if (limit == null || limit <= 0) return null;
  return Math.min(100, Math.round((used / limit) * 100));
}

function meterTone(pct: number | null, remaining: number | null | undefined): "ok" | "warn" | "danger" {
  if (remaining === 0) return "danger";
  if (pct != null && pct >= 90) return "danger";
  if (pct != null && pct >= 75) return "warn";
  return "ok";
}

function toolFromAction(action: string): ToolId {
  return ACTION_TO_TOOL[action] ?? "client-summary";
}

function dayBucket(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startThat = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((startToday - startThat) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function YouMessage({ text }: { text: string }) {
  return (
    <div className="ui-ai-msg ui-ai-msg--you">
      <div className="ui-ai-msg__bubble">{text}</div>
      <div className="ui-ai-msg__actions ui-ai-msg__actions--you">
        <button
          type="button"
          className="ui-ai-msg__icon"
          aria-label="Copy"
          title="Copy"
          onClick={() => void navigator.clipboard.writeText(text)}
        >
          <CopyIcon />
        </button>
      </div>
    </div>
  );
}

function ToolIcon({ id }: { id: ToolId }) {
  const paths: Record<ToolId, ReactNode> = {
    "client-summary": (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    "consultation-summary": (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
      </>
    ),
    "meal-plan-assistance": (
      <>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </>
    ),
    "nutrition-assistance": (
      <>
        <path d="M12 22c4 0 7-3.5 7-8V7H5v7c0 4.5 3 8 7 8z" />
        <path d="M8 7V4M12 7V2M16 7V5" />
      </>
    ),
    "message-draft": <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  };
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      {paths[id]}
    </svg>
  );
}

function UsageMeter({
  label,
  used,
  limit,
  remaining,
}: {
  label: string;
  used: number;
  limit: number | null | undefined;
  remaining: number | null | undefined;
}) {
  const pct = usedPct(used, limit);
  const tone = meterTone(pct, remaining);
  return (
    <div className={`ui-ai-meter${tone === "ok" ? "" : ` is-${tone}`}`}>
      <div className="ui-ai-meter__head">
        <span>{label}</span>
        <strong>
          {used.toLocaleString()}
          {limit != null ? ` / ${limit.toLocaleString()}` : ""}
        </strong>
      </div>
      {pct != null ? (
        <div className="ui-ai-meter__track" aria-hidden="true">
          <span className="ui-ai-meter__fill" style={{ width: `${pct}%` }} />
        </div>
      ) : remaining != null ? (
        <p className="ui-hint" style={{ margin: 0 }}>
          {remaining.toLocaleString()} remaining
        </p>
      ) : null}
    </div>
  );
}

export default function PracticeAiPage() {
  const params = useParams<{ dietitianAccountId: string }>();
  const dietitianAccountId = params.dietitianAccountId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { aiAvailable } = usePractice();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [period, setPeriod] = useState("current");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [openDraft, setOpenDraft] = useState<DraftDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [food, setFood] = useState("");
  const [generating, setGenerating] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [recentPage, setRecentPage] = useState(1);
  const [pickedClientId, setPickedClientId] = useState("");
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const pickedClientRef = useRef("");
  const plusRef = useRef<HTMLDivElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const usageOpen = searchParams.get("usage") === "1" || searchParams.get("view") === "usage";
  const draftId = searchParams.get("draftId") ?? "";
  const clientId = searchParams.get("clientId") ?? "";
  const toolParam = searchParams.get("tool");
  const toolId: ToolId | "" = toolParam && TOOL_IDS.has(toolParam) ? (toolParam as ToolId) : "";
  const activeTool = TOOLS.find((tool) => tool.id === toolId) ?? null;

  const replaceQuery = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("view");
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(`/practice/${dietitianAccountId}/ai${query ? `?${query}` : ""}`, { scroll: false });
    },
    [dietitianAccountId, router, searchParams],
  );

  const loadDrafts = useCallback(async () => {
    const listed = await api<{ items: DraftRow[] }>(`/api/v1/dietitian/${dietitianAccountId}/ai/drafts`);
    setDrafts(listed.items);
  }, [dietitianAccountId]);

  useEffect(() => {
    if (!aiAvailable) {
      router.replace(`/practice/${dietitianAccountId}`);
      return;
    }
    void api<Usage>(`/api/v1/dietitian/${dietitianAccountId}/ai/usage?period=${encodeURIComponent(period)}`)
      .then((data) => {
        const available = data.available ?? (data.enabled && data.providerConfigured !== false);
        if (!available) {
          router.replace(`/practice/${dietitianAccountId}`);
          return;
        }
        setUsage(data);
      })
      .catch((err) => setError(errorMessage(err, "Unable to load AI usage")));
  }, [dietitianAccountId, aiAvailable, router, period]);

  useEffect(() => {
    if (!aiAvailable) return;
    let cancelled = false;
    void Promise.all([
      api<{ items: ClientRow[] }>(`/api/v1/dietitian/${dietitianAccountId}/clients?pageSize=50`),
      api<{ items: DraftRow[] }>(`/api/v1/dietitian/${dietitianAccountId}/ai/drafts`),
    ])
      .then(([clientList, draftList]) => {
        if (cancelled) return;
        setClients(clientList.items);
        setDrafts(draftList.items);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, "Unable to load AI drafts"));
      });
    return () => {
      cancelled = true;
    };
  }, [aiAvailable, dietitianAccountId]);

  useEffect(() => {
    if (!draftId) {
      setOpenDraft(null);
      return;
    }
    let cancelled = false;
    void api<DraftDetail>(`/api/v1/dietitian/${dietitianAccountId}/ai/drafts/${draftId}`)
      .then((row) => {
        if (!cancelled) {
          setOpenDraft(row);
          setFood(row.foodQuery ?? "");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, "Unable to open this draft"));
      });
    return () => {
      cancelled = true;
    };
  }, [dietitianAccountId, draftId]);

  useEffect(() => {
    const next = openDraft?.clientId || clientId;
    if (next) {
      pickedClientRef.current = next;
      setPickedClientId(next);
    }
  }, [clientId, openDraft?.clientId]);

  useEffect(() => {
    if (!plusOpen) return;
    function onPointer(event: MouseEvent) {
      if (!plusRef.current?.contains(event.target as Node)) setPlusOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPlusOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [plusOpen]);

  const onUsageChange = useCallback((next: { used: number; limit: number | null; remaining: number | null; tokens?: Usage["tokens"] }) => {
    setUsage((current) =>
      current
        ? {
            ...current,
            used: next.used,
            limit: next.limit,
            remaining: next.remaining,
            requests: { used: next.used, limit: next.limit, remaining: next.remaining },
            tokens: next.tokens
              ? { ...current.tokens, ...next.tokens, input: current.tokens?.input ?? 0, output: current.tokens?.output ?? 0 }
              : current.tokens,
          }
        : current,
    );
  }, []);

  const trendPoints: TrendPoint[] = useMemo(
    () =>
      (usage?.byDay ?? []).map((row) => ({
        at: `${row.date}T00:00:00.000Z`,
        primary: row.tokens,
        compare: row.costUsd,
      })),
    [usage],
  );

  const actionSlices: DonutSlice[] = useMemo(
    () =>
      (usage?.byAction ?? [])
        .filter((row) => row.tokens > 0)
        .map((row) => ({
          id: row.action,
          label: humanizeLabel(row.action),
          value: row.tokens,
          color: ACTION_COLORS[row.action] ?? "#64748b",
        })),
    [usage],
  );

  const historyGroups = useMemo(() => {
    const groups: Array<{ label: string; items: DraftRow[] }> = [];
    for (const row of drafts) {
      const label = dayBucket(row.createdAt);
      const last = groups[groups.length - 1];
      if (last?.label === label) last.items.push(row);
      else groups.push({ label, items: [row] });
    }
    return groups;
  }, [drafts]);

  const RECENT_PAGE_SIZE = 8;
  const recentRows = usage?.recent ?? [];
  const recentPageCount = Math.max(1, Math.ceil(recentRows.length / RECENT_PAGE_SIZE));
  const recentSlice = recentRows.slice((recentPage - 1) * RECENT_PAGE_SIZE, recentPage * RECENT_PAGE_SIZE);

  useEffect(() => {
    setRecentPage(1);
  }, [period, usage?.periodKey]);

  const requests = usage?.requests ?? { used: usage?.used ?? 0, limit: usage?.limit ?? null, remaining: usage?.remaining ?? null };
  const tokens = usage?.tokens;
  const hasUsage = (usage?.recent?.length ?? 0) > 0 || (usage?.used ?? 0) > 0;
  const sessionClientId = openDraft?.clientId || clientId || pickedClientId;
  const selectedClient = clients.find((client) => client.id === sessionClientId);
  const sessionTool = openDraft ? (TOOLS.find((tool) => tool.id === toolFromAction(openDraft.action)) ?? TOOLS[0]!) : activeTool;
  const sessionClientName =
    openDraft?.clientName ?? (selectedClient ? clientDisplayName(selectedClient) : sessionClientId ? "Selected client" : "");
  const clientOptions = [
    { id: "", label: "Select a client" },
    ...(clientId && !selectedClient ? [{ id: clientId, label: "Selected client" }] : []),
    ...clients.map((client) => ({ id: client.id, label: clientDisplayName(client) })),
  ];
  const ready = Boolean(sessionClientId && sessionTool);
  const aiDisabled = usage?.enabled === false;
  const budgetGone =
    (requests.remaining !== null && requests.remaining === 0) ||
    (tokens?.remaining !== null && tokens?.remaining === 0);
  const canGenerate = ready && !generating && !aiDisabled && !budgetGone;
  const threadTurns: DraftTurn[] =
    openDraft?.messages?.length
      ? openDraft.messages
      : openDraft
        ? [{ userInput: openDraft.userInput, foodQuery: openDraft.foodQuery, result: openDraft.result, createdAt: openDraft.createdAt }]
        : [];
  const inThread = Boolean(openDraft || pendingPrompt);
  const lastTurn = threadTurns[threadTurns.length - 1];
  const showPending = Boolean(pendingPrompt && lastTurn?.userInput !== pendingPrompt);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [threadTurns.length, pendingPrompt, generating]);

  async function generate() {
    if (!sessionClientId || !sessionTool || !canGenerate) return;
    const sent = prompt.trim();
    setPendingPrompt(sent || "Generate");
    setPrompt("");
    setGenerating(true);
    setError(null);
    try {
      const response = await api<{
        draftId?: string;
        result: Record<string, unknown>;
        usage: { used: number; limit: number | null; remaining: number | null; periodKey: string; tokens?: Usage["tokens"] };
      }>(`/api/v1/dietitian/${dietitianAccountId}/clients/${sessionClientId}/ai/${sessionTool.id}`, {
        method: "POST",
        body: JSON.stringify({
          prompt: sent,
          draftId: openDraft?.id || undefined,
          ...(sessionTool.foodQuery ? { foodQuery: food } : {}),
        }),
      });
      onUsageChange({
        used: response.usage.used,
        limit: response.usage.limit,
        remaining: response.usage.remaining,
        tokens: response.usage.tokens,
      });
      if (response.draftId) {
        const row = await api<DraftDetail>(`/api/v1/dietitian/${dietitianAccountId}/ai/drafts/${response.draftId}`);
        setOpenDraft(row);
        if (response.draftId !== draftId) {
          replaceQuery({ draftId: response.draftId, usage: null, clientId: null, tool: null });
        }
      }
      void loadDrafts();
    } catch (err) {
      setError(errorMessage(err, "Unable to generate a draft"));
    } finally {
      setPendingPrompt(null);
      setGenerating(false);
    }
  }

  function onComposerKey(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void generate();
    }
  }

  function startNewDraft() {
    setPrompt("");
    setFood("");
    setOpenDraft(null);
    setPlusOpen(false);
    setPendingPrompt(null);
    setPickedClientId(clientId);
    replaceQuery({ draftId: null, tool: null, usage: null });
  }

  if (!aiAvailable) {
    return <LoadingState>Opening clinic…</LoadingState>;
  }

  return (
    <section className="ui-ai-workspace">
      <aside className="ui-ai-workspace__sidebar">
        <button type="button" className="ui-ai-chat__new" onClick={startNewDraft}>
          New chat
        </button>
        <div className="ui-ai-chat__history">
          {historyGroups.length === 0 ? (
            <p className="ui-ai-chat__empty">No drafts yet</p>
          ) : (
            historyGroups.map((group) => (
              <div key={group.label} className="ui-ai-chat__group">
                <p className="ui-ai-chat__day">{group.label}</p>
                {group.items.map((row) => {
                  const tool = TOOLS.find((item) => item.id === toolFromAction(row.action));
                  return (
                    <button
                      key={row.id}
                      type="button"
                      className={`ui-ai-chat__item${row.id === draftId ? " is-active" : ""}`}
                      onClick={() => replaceQuery({ draftId: row.id, usage: null, clientId: null, tool: null })}
                    >
                      <span className="ui-ai-chat__item-title">{row.clientName}</span>
                      <span className="ui-ai-chat__item-meta">{tool?.title ?? humanizeLabel(row.action)}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <button
          type="button"
          className="ui-ai-workspace__usage"
          onClick={() => replaceQuery({ usage: usageOpen ? null : "1" })}
        >
          <span>
            <span className="ui-ai-workspace__usage-label">Usage</span>
            <span className="ui-ai-workspace__usage-line">
              {requests.used.toLocaleString()}
              {requests.limit != null ? ` / ${requests.limit.toLocaleString()}` : ""} requests
            </span>
          </span>
          <span className="ui-ai-workspace__usage-chevron" aria-hidden="true">
            ›
          </span>
        </button>
      </aside>

      <div className="ui-ai-workspace__thread">
        {inThread && sessionTool ? (
          <div className="ui-ai-workspace__context">
            <p>
              <strong>{sessionClientName}</strong>
              <span className="ui-muted"> · {sessionTool.title}</span>
            </p>
            {openDraft ? (
              <button
                type="button"
                className="ui-btn ui-btn--ghost ui-btn--sm"
                onClick={() => {
                  void api(`/api/v1/dietitian/${dietitianAccountId}/ai/drafts/${openDraft.id}`, { method: "DELETE" })
                    .then(() => {
                      startNewDraft();
                      void loadDrafts();
                    })
                    .catch((err) => setError(errorMessage(err, "Unable to delete this draft")));
                }}
              >
                Delete
              </button>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="ui-ai-workspace__alert">
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}

        <div className="ui-ai-workspace__scroll">
          {inThread && sessionTool ? (
            <div className="ui-ai-workspace__messages">
              {threadTurns.map((turn, index) => (
                <div key={`${openDraft?.id ?? "pending"}-${turn.createdAt}-${index}`} className="ui-ai-turn">
                  {turn.userInput ? <YouMessage text={turn.userInput} /> : null}
                  {turn.result && typeof turn.result === "object" ? (
                    <AiAnswer
                      result={turn.result}
                      apply={sessionTool.apply}
                      dietitianAccountId={dietitianAccountId}
                      clientId={openDraft?.clientId || sessionClientId}
                    />
                  ) : null}
                </div>
              ))}
              {showPending && pendingPrompt ? (
                <div className="ui-ai-turn">
                  <YouMessage text={pendingPrompt} />
                  <p className="ui-ai-msg__pending">Generating…</p>
                </div>
              ) : null}
              <div ref={threadEndRef} />
            </div>
          ) : (
            <div className="ui-ai-workspace__hello">
              <h1>What should we draft?</h1>
              <p className="ui-muted">Start by choosing a client and a tool. Then add optional instructions.</p>
            </div>
          )}
        </div>

        <div className="ui-ai-workspace__dock">
          {inThread ? null : (
            <div className="ui-ai-setup">
              <button type="button" className={`ui-ai-setup__chip${sessionClientName ? " is-set" : ""}`} onClick={() => setPlusOpen(true)}>
                {sessionClientName || "Choose client"}
              </button>
              <button type="button" className={`ui-ai-setup__chip${sessionTool ? " is-set" : ""}`} onClick={() => setPlusOpen(true)}>
                {sessionTool?.title || "Choose tool"}
              </button>
            </div>
          )}
          {sessionTool?.foodQuery ? (
            <input
              className="ui-ai-workspace__food"
              value={food}
              onChange={(event) => setFood(event.target.value)}
              placeholder="Food to explain — e.g. salmon, almonds…"
              aria-label="Food search"
            />
          ) : null}
          <p className="ui-ai-workspace__hint">
            {ready
              ? "Review before use. Nothing is saved to the chart until you apply it."
              : "Use + or the chips above to choose a client and a tool."}
          </p>
          <div className="ui-ai-pill">
            <div className="ui-ai-plus" ref={plusRef}>
              <button
                type="button"
                className={`ui-ai-pill__icon${plusOpen ? " is-open" : ""}${ready ? "" : " is-choose"}`}
                aria-label="Choose client and tool"
                aria-expanded={plusOpen}
                onClick={() => setPlusOpen((open) => !open)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {ready ? null : <span>Client & tool</span>}
              </button>
              {plusOpen ? (
                <div className="ui-ai-plus__menu">
                  <p className="ui-ai-plus__intro">Pick a client, then the kind of draft you want.</p>
                  <p className="ui-ai-plus__label">Client</p>
                  <SearchableSelect
                    value={sessionClientId}
                    onChange={(id) => {
                      pickedClientRef.current = id;
                      setPickedClientId(id);
                      replaceQuery({
                        clientId: id || null,
                        tool: sessionTool?.id || toolId || null,
                        draftId: null,
                        usage: null,
                      });
                    }}
                    options={clientOptions}
                    placeholder="Select a client"
                    searchPlaceholder="Search clients"
                    emptyLabel="No clients match"
                    aria-label="Client"
                  />
                  <p className="ui-ai-plus__label">Tool</p>
                  <div className="ui-ai-plus__tools">
                    {TOOLS.map((tool) => (
                      <button
                        key={tool.id}
                        type="button"
                        className={`ui-ai-plus__tool${sessionTool?.id === tool.id ? " is-active" : ""}`}
                        onClick={() => {
                          replaceQuery({
                            tool: tool.id,
                            draftId: null,
                            usage: null,
                            clientId: pickedClientRef.current || pickedClientId || sessionClientId || clientId || null,
                          });
                          setPlusOpen(false);
                        }}
                      >
                        <span className="ui-ai-tool__icon">
                          <ToolIcon id={tool.id} />
                        </span>
                        <span>
                          <strong>{tool.title}</strong>
                          <span className="ui-muted">{tool.blurb}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <textarea
              className="ui-ai-pill__input"
              rows={1}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={onComposerKey}
              placeholder={ready ? "Ask anything" : "Choose a client and a tool first"}
              aria-label="Message"
            />
            <button
              type="button"
              className="ui-ai-pill__send"
              disabled={!canGenerate}
              aria-label="Send"
              onClick={() => void generate()}
            >
              {generating ? (
                <span className="ui-ai-pill__dots" aria-hidden="true" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {usageOpen ? (
        <div className="ui-ai-usage">
          <button type="button" className="ui-ai-usage__backdrop" aria-label="Close usage" onClick={() => replaceQuery({ usage: null })} />
          <aside className="ui-ai-usage__panel" role="dialog" aria-label="AI usage">
            <header className="ui-ai-usage__head">
              <div>
                <p className="ui-ai-chat__kicker">This clinic</p>
                <h2>Usage</h2>
                <p className="ui-muted">{formatPeriodKey(usage?.periodKey)}</p>
              </div>
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => replaceQuery({ usage: null })}>
                Close
              </button>
            </header>

            <div className="ui-ai-bar ui-ai-bar--plain ui-ai-usage__period">
              <div className="ui-segment" role="group" aria-label="Usage period">
                <button
                  type="button"
                  className={`ui-segment__btn${period === "current" ? " is-active" : ""}`}
                  aria-pressed={period === "current"}
                  onClick={() => setPeriod("current")}
                >
                  This month
                </button>
                <button
                  type="button"
                  className={`ui-segment__btn${period === usage?.previousPeriodKey ? " is-active" : ""}`}
                  aria-pressed={period === usage?.previousPeriodKey}
                  disabled={!usage?.previousPeriodKey}
                  onClick={() => usage?.previousPeriodKey && setPeriod(usage.previousPeriodKey)}
                >
                  Previous month
                </button>
              </div>
            </div>

            <div className="ui-kpi-strip ui-kpi-strip--3">
              <div className="ui-kpi ui-ai-kpi">
                <span className="ui-kpi__label">Requests</span>
                <span className="ui-kpi__value">
                  {requests.used}
                  {requests.limit != null ? <span className="ui-kpi__meta"> / {requests.limit}</span> : null}
                </span>
                <UsageMeter label="Used" used={requests.used} limit={requests.limit} remaining={requests.remaining} />
              </div>
              <div className="ui-kpi ui-ai-kpi">
                <span className="ui-kpi__label">Tokens</span>
                <span className="ui-kpi__value">
                  {(tokens?.used ?? 0).toLocaleString()}
                  {tokens?.limit != null ? <span className="ui-kpi__meta"> / {tokens.limit.toLocaleString()}</span> : null}
                </span>
                <UsageMeter label="Used" used={tokens?.used ?? 0} limit={tokens?.limit} remaining={tokens?.remaining} />
              </div>
              <div className="ui-kpi">
                <span className="ui-kpi__label">Estimated cost</span>
                <span className="ui-kpi__value">{formatUsd(usage?.costUsd ?? 0)}</span>
                <span className="ui-kpi__meta">List-price estimate for completed calls</span>
              </div>
            </div>

            <div className="ui-analytics__charts ui-ai-usage__charts">
              <Section className="ui-analytics__wide" title="Daily tokens and cost" description="Completed generations only.">
                {hasUsage && trendPoints.length ? (
                  <TrendChart
                    points={trendPoints}
                    primaryLabel="Tokens"
                    compareLabel="Cost"
                    formatValue={(value) => (value < 2 ? formatUsd(value) : value.toLocaleString())}
                    height={176}
                  />
                ) : (
                  <TrendChart points={[]} primaryLabel="Tokens" emptyTitle="No AI use this period" height={176} />
                )}
              </Section>
              <Section title="By action" description="Share of tokens.">
                {actionSlices.length ? (
                  <DonutChart
                    slices={actionSlices}
                    size={168}
                    thickness={22}
                    center={
                      <div style={{ textAlign: "center" }}>
                        <div className="ui-kpi__label">Tokens</div>
                        <strong>{(tokens?.used ?? 0).toLocaleString()}</strong>
                      </div>
                    }
                  />
                ) : (
                  <p className="ui-muted" style={{ margin: 0 }}>
                    No completed requests this period.
                  </p>
                )}
              </Section>
            </div>

            <Section className="ui-ai-usage__recent" title="Recent requests" description="Last 50 completed generations. Prompts are not stored.">
              {!recentRows.length ? (
                <EmptyState title="No AI use this period">Generate a draft to see usage here.</EmptyState>
              ) : (
                <>
                  <Table>
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Client</th>
                        <th>Action</th>
                        <th>Tokens</th>
                        <th>Cost</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentSlice.map((row) => (
                        <tr key={row.id}>
                          <Td label="When">{new Date(row.requestedAt).toLocaleString()}</Td>
                          <Td label="Client">
                            {row.clientId ? (
                              <button
                                type="button"
                                className="ui-ai-link"
                                onClick={() => replaceQuery({ usage: null, clientId: row.clientId, draftId: null })}
                              >
                                {row.clientName ?? "Open"}
                              </button>
                            ) : (
                              (row.clientName ?? "—")
                            )}
                          </Td>
                          <Td label="Action">{humanizeLabel(row.action)}</Td>
                          <Td label="Tokens">{(row.inputTokens + row.outputTokens).toLocaleString()}</Td>
                          <Td label="Cost">{formatUsd(row.costUsd)}</Td>
                          <Td label="Status">{humanizeLabel(row.status)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  <ListPager
                    page={Math.min(recentPage, recentPageCount)}
                    pageCount={recentPageCount}
                    onPrev={() => setRecentPage((page) => Math.max(1, page - 1))}
                    onNext={() => setRecentPage((page) => Math.min(recentPageCount, page + 1))}
                  />
                </>
              )}
            </Section>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
