"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Alert,
  EmptyState,
  Section,
  Skeleton,
} from "@nutrition-saas/ui";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";
import { formatDate, formatEnergyKcal } from "../../../lib/format";
import { PORTAL_FORMS_CHANGED } from "../../../lib/portal-forms";
import { useMessagingRealtime } from "../../../lib/realtime";
import { PatientAccents } from "./patient-accents";

interface PortalDashboard {
  me: {
    client: { firstName: string; lastName: string; displayName: string | null };
    practiceName?: string | null;
    dietitian?: { name: string | null; title: string | null; specialization: string | null };
    dietitianDisplayName?: string | null;
    portalPresets?: { messaging: boolean; tracking: boolean; mealPlans: boolean };
    energyUnit?: "kcal" | "kj" | string;
    goals?: Array<{ id: string; title: string; targetValue: number | null; targetUnit: string | null }>;
  };
  upcomingAppointment: {
    id: string;
    title: string;
    startAt: string;
    endAt: string;
    status: string;
  } | null;
  messages: {
    preview: Array<{ id: string; body: string; createdAt: string }>;
    unreadCount: number;
  };
  notifications: {
    recent: Array<{ id: string; title: string; body: string; readAt: string | null; createdAt: string }>;
    unreadCount: number;
  };
  tracking: {
    food: { presented: { energyKcal: number | null; proteinG: number | null } };
    water: { totalLiters: number };
    exercise: { totalDurationMinutes: number };
    sleep: { durationMinutes: number | null } | null;
    habits: { completed: number; total: number };
    goals?: Array<{ title: string; targetValue: number | null; targetUnit: string | null }>;
  };
  mealPlan: { name: string; description: string | null } | null;
  pendingAssessmentsCount?: number;
  quickLinks: Array<{ href: string; label: string }>;
}

function greetingForNow(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function sleepLabel(minutes: number | null | undefined): string {
  if (!minutes) return "Not logged";
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function todayLabel(now = new Date()): string {
  return now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function ClientHomePage() {
  const [data, setData] = useState<PortalDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    const next = await api<PortalDashboard>("/api/v1/portal/dashboard");
    setData(next);
    return next;
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadDashboard()
      .catch((err) => setError(errorMessage(err, "Unable to load your home")))
      .finally(() => setLoading(false));
  }, [loadDashboard]);

  useEffect(() => {
    function onMessagesRead() {
      setData((prev) =>
        prev
          ? {
              ...prev,
              messages: { ...prev.messages, unreadCount: 0 },
            }
          : prev,
      );
      void loadDashboard().catch(() => undefined);
    }
    window.addEventListener("portal-messages-read", onMessagesRead);
    return () => window.removeEventListener("portal-messages-read", onMessagesRead);
  }, [loadDashboard]);

  useEffect(() => {
    function onFormsChanged(event: Event) {
      const count = (event as CustomEvent<{ count?: number }>).detail?.count;
      if (typeof count === "number") {
        setData((prev) => (prev ? { ...prev, pendingAssessmentsCount: count } : prev));
        return;
      }
      void loadDashboard().catch(() => undefined);
    }
    window.addEventListener(PORTAL_FORMS_CHANGED, onFormsChanged);
    return () => window.removeEventListener(PORTAL_FORMS_CHANGED, onFormsChanged);
  }, [loadDashboard]);

  useMessagingRealtime(true, {
    onUnreadUpdated: (event) => {
      setData((prev) =>
        prev
          ? {
              ...prev,
              messages: {
                ...prev.messages,
                unreadCount: typeof event.unreadCount === "number" ? event.unreadCount : prev.messages.unreadCount,
              },
            }
          : prev,
      );
      void loadDashboard().catch(() => undefined);
    },
    onMessageCreated: () => {
      void loadDashboard().catch(() => undefined);
    },
  });

  const greeting = useMemo(() => greetingForNow(), []);
  const dateLabel = useMemo(() => todayLabel(), []);
  const me = data?.me ?? null;
  const presets = me?.portalPresets ?? { messaging: true, tracking: true, mealPlans: true };
  const tracking = data?.tracking ?? null;
  const name =
    me?.client.displayName?.trim() ||
    `${me?.client.firstName ?? ""} ${me?.client.lastName ?? ""}`.trim() ||
    "there";
  const firstName = name.split(" ")[0] ?? name;
  const latestMessage = [...(data?.messages.preview ?? [])]
    .reverse()
    .find((row) => row.body.trim().length > 0);
  const dietitian = me?.dietitian ?? null;
  const dietitianName = dietitian?.name?.trim() || me?.dietitianDisplayName?.trim() || "";
  const dietitianMeta = [dietitian?.title, dietitian?.specialization].filter(Boolean).join(" · ");

  const energyUnit = me?.energyUnit ?? "kcal";
  const pendingForms = data?.pendingAssessmentsCount ?? 0;
  const goals = (me?.goals ?? tracking?.goals ?? []).slice(0, 2);
  const metrics = [
    {
      tone: "food" as const,
      label: "Food",
      value: formatEnergyKcal(tracking?.food.presented.energyKcal, energyUnit),
      hint: tracking?.food.presented.proteinG != null ? `${tracking.food.presented.proteinG} g protein` : undefined,
      icon: PatientAccents.food,
    },
    {
      tone: "water" as const,
      label: "Water",
      value: tracking ? `${tracking.water.totalLiters.toFixed(1)} L` : "—",
      icon: PatientAccents.water,
    },
    {
      tone: "exercise" as const,
      label: "Exercise",
      value: tracking ? `${tracking.exercise.totalDurationMinutes} min` : "—",
      icon: PatientAccents.exercise,
    },
    {
      tone: "sleep" as const,
      label: "Sleep",
      value: sleepLabel(tracking?.sleep?.durationMinutes),
      icon: PatientAccents.sleep,
    },
    {
      tone: "habits" as const,
      label: "Habits",
      value: tracking
        ? `${tracking.habits.completed} of ${tracking.habits.total || tracking.habits.completed} done`
        : "—",
      hint: tracking?.habits.total ? `${tracking.habits.completed}/${tracking.habits.total}` : undefined,
      icon: PatientAccents.habits,
    },
  ];

  return (
    <section className="ui-client-home">
      <header className="ui-client-welcome">
        <div className="ui-client-welcome__copy">
          <p className="ui-client-welcome__eyebrow">{dateLabel}</p>
          <h1>
            {greeting}, {firstName}
          </h1>
          <p>
            {dietitianName
              ? `Your nutrition day with ${dietitianName}.`
              : me?.practiceName
                ? `Your nutrition day with ${me.practiceName}.`
                : "Your nutrition day — plan, tracking, and messages in one place."}
          </p>
          <div className="ui-client-welcome__actions">
            {presets.tracking ? (
              <Link href="/client/tracking" className="ui-btn ui-btn--primary ui-btn--sm">
                Log today
              </Link>
            ) : null}
            {presets.mealPlans ? (
              <Link href="/client/plan" className="ui-btn ui-btn--secondary ui-btn--sm">
                Open plan
              </Link>
            ) : null}
          </div>
        </div>
        <div className="ui-client-welcome__orb" aria-hidden="true" />
      </header>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {goals.length ? (
        <Section title="What we’re working on" tone="mint">
          <ul className="ui-portal-goal-list">
            {goals.map((goal, index) => (
              <li key={"id" in goal && goal.id ? goal.id : `${goal.title}-${index}`}>
                <strong>{goal.title}</strong>
                {goal.targetValue != null ? (
                  <span className="ui-muted">
                    {" "}
                    · {goal.targetValue}
                    {goal.targetUnit ? ` ${goal.targetUnit}` : ""}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {dietitianName ? (
        <Section title="Your dietitian">
          <div className="ui-client-dietitian">
            <strong>{dietitianName}</strong>
            {dietitianMeta ? <p className="ui-muted">{dietitianMeta}</p> : null}
          </div>
        </Section>
      ) : null}

      <Section
        title="Upcoming appointment"
        description="Your next scheduled visit with this clinic."
        actions={
          <Link href="/client" className="ui-link">
            Home
          </Link>
        }
      >
        {loading ? (
          <Skeleton style={{ height: 40, width: "70%" }} />
        ) : data?.upcomingAppointment ? (
          <div className="ui-client-spotlight">
            <span className="ui-client-spotlight__badge">
              {data.upcomingAppointment.status === "REQUESTED" ? "Waiting for clinic" : "Scheduled"}
            </span>
            <h3>{data.upcomingAppointment.title}</h3>
            <p className="ui-muted">{formatDate(data.upcomingAppointment.startAt)}</p>
          </div>
        ) : (
          <EmptyState title="No upcoming appointment">Nothing scheduled with this clinic yet.</EmptyState>
        )}
      </Section>

      {presets.tracking ? (
      <Section title="Today’s tracking" description="A quick pulse on what you’ve logged so far." tone="mint">
        {loading ? (
          <div className="ui-client-metrics">
            <Skeleton style={{ height: 88 }} />
            <Skeleton style={{ height: 88 }} />
            <Skeleton style={{ height: 88 }} />
          </div>
        ) : (
          <>
            <div className="ui-client-metrics">
              {metrics.map((metric) => (
                <div key={metric.tone} className="ui-client-metric" data-tone={metric.tone}>
                  <span className="ui-client-metric__icon">{metric.icon}</span>
                  <span className="ui-client-metric__label">{metric.label}</span>
                  <strong className="ui-client-metric__value">{metric.value}</strong>
                  {metric.hint ? <span className="ui-client-metric__hint">{metric.hint}</span> : null}
                </div>
              ))}
            </div>
            <div className="ui-client-actions">
              <Link href="/client/tracking" className="ui-btn ui-btn--primary ui-btn--sm">
                Log tracking
              </Link>
              <Link href="/client/progress" className="ui-btn ui-btn--secondary ui-btn--sm">
                View progress
              </Link>
            </div>
          </>
        )}
      </Section>
      ) : null}

      <nav className="ui-client-quick" aria-label="Quick links">
        {(data?.quickLinks ?? [
          ...(presets.mealPlans ? [{ href: "/client/plan", label: "My Plan" }] : []),
          ...(presets.tracking ? [{ href: "/client/tracking", label: "Daily log" }] : []),
          ...(presets.messaging ? [{ href: "/client/messages", label: "Messages" }] : []),
          { href: "/client/documents", label: "Documents" },
          { href: "/client/assessments", label: "Forms" },
        ])
          .map((link) =>
            link.href === "/client/assessments"
              ? { ...link, label: pendingForms ? `Forms · ${pendingForms}` : "Forms" }
              : link,
          )
          .map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="ui-client-quick__item"
            data-tone={link.label.toLowerCase().includes("plan") ? "plan" : "food"}
          >
            <span className="ui-client-quick__icon">
              {link.href.includes("plan")
                ? PatientAccents.plan
                : link.href.includes("track")
                  ? PatientAccents.food
                  : link.href.includes("message")
                    ? PatientAccents.messages
                    : PatientAccents.documents}
            </span>
            <span>
              <strong>{link.label}</strong>
            </span>
          </Link>
        ))}
      </nav>

      <div className="ui-client-home__grid">
        {presets.mealPlans ? (
        <Section
          title="My current plan"
          actions={
            <Link href="/client/plan" className="ui-link">
              View full plan
            </Link>
          }
        >
          {loading ? (
            <Skeleton style={{ height: 48, width: "80%" }} />
          ) : data?.mealPlan ? (
            <div className="ui-client-spotlight">
              <span className="ui-client-spotlight__badge">Active</span>
              <h3>{data.mealPlan.name}</h3>
              {data.mealPlan.description ? (
                <p className="ui-muted">{data.mealPlan.description}</p>
              ) : (
                <p className="ui-muted">Your published meal plan from your dietitian.</p>
              )}
            </div>
          ) : (
            <EmptyState title="No meal plan yet">
              When your dietitian publishes a plan, it will appear here.
            </EmptyState>
          )}
        </Section>
        ) : null}

        {presets.messaging ? (
        <Section
          title="Messages"
          description={
            data?.messages.unreadCount
              ? `${data.messages.unreadCount} unread`
              : "Recent conversation preview"
          }
          actions={
            <Link href="/client/messages" className="ui-link">
              Open
            </Link>
          }
        >
          {loading ? (
            <Skeleton style={{ height: 40, width: "90%" }} />
          ) : latestMessage ? (
            <div className="ui-client-preview-bubble">
              <p>
                “{latestMessage.body.slice(0, 140)}
                {latestMessage.body.length > 140 ? "…" : ""}”
              </p>
            </div>
          ) : (
            <EmptyState title="No messages yet">
              Reach out to your dietitian when you have a question.
            </EmptyState>
          )}
        </Section>
        ) : null}

        <Section
          title="Notifications"
          description={
            data?.notifications.unreadCount
              ? `${data.notifications.unreadCount} unread`
              : "Recent updates"
          }
        >
          {loading ? (
            <Skeleton style={{ height: 40, width: "90%" }} />
          ) : (data?.notifications.recent ?? []).length === 0 ? (
            <EmptyState title="No notifications">You’re all caught up.</EmptyState>
          ) : (
            <ul className="ui-client-invoice-list">
              {data!.notifications.recent.map((row) => (
                <li key={row.id}>
                  <div>
                    <strong>{row.title}</strong>
                    <div className="ui-muted">{row.body}</div>
                  </div>
                  {!row.readAt ? <span className="ui-muted">New</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </section>
  );
}
