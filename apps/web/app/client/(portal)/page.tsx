"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Alert,
  EmptyState,
  Section,
  Skeleton,
  StatusBadge,
} from "@nutrition-saas/ui";
import { api } from "../../../lib/api";
import { formatMoney } from "../../../lib/format";
import { errorMessage } from "../../../lib/humanize-error";
import { statusLabel } from "../../../lib/practice-labels";
import { PatientAccents } from "./patient-accents";

interface PortalMe {
  client: { firstName: string; lastName: string; displayName: string | null };
  practiceName?: string | null;
}

interface PortalPlan {
  plan: { name: string; description: string | null } | null;
}

interface Summary {
  food: { presented: { energyKcal: number | null; proteinG: number | null } };
  water: { totalLiters: number };
  exercise: { totalDurationMinutes: number };
  sleep: { durationMinutes: number | null } | null;
  habits: { completed: number; total: number };
}

interface Message {
  id: string;
  body: string;
  createdAt: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string | null;
  status: string;
  total: number;
  currency: string;
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
  const [me, setMe] = useState<PortalMe | null>(null);
  const [plan, setPlan] = useState<PortalPlan | null>(null);
  const [tracking, setTracking] = useState<Summary | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      api<PortalMe>("/api/v1/portal/me"),
      api<PortalPlan>("/api/v1/portal/meal-plan"),
      api<Summary>("/api/v1/portal/tracking/summary"),
      api<{ messages?: Message[] } | Message[]>("/api/v1/portal/conversation/messages").catch(() => []),
      api<Invoice[]>("/api/v1/portal/invoices").catch(() => []),
    ])
      .then(([meData, planData, trackingData, messageData, invoiceData]) => {
        setMe(meData);
        setPlan(planData);
        setTracking(trackingData);
        setMessages(Array.isArray(messageData) ? messageData : (messageData.messages ?? []));
        setInvoices(invoiceData);
      })
      .catch((err) => setError(errorMessage(err, "Unable to load your home")))
      .finally(() => setLoading(false));
  }, []);

  const greeting = useMemo(() => greetingForNow(), []);
  const dateLabel = useMemo(() => todayLabel(), []);
  const name =
    me?.client.displayName?.trim() ||
    `${me?.client.firstName ?? ""} ${me?.client.lastName ?? ""}`.trim() ||
    "there";
  const firstName = name.split(" ")[0] ?? name;
  const openInvoices = invoices.filter((row) => !["PAID", "CANCELLED", "VOID"].includes(row.status));
  const latestMessage = messages[messages.length - 1];

  const metrics = [
    {
      tone: "food" as const,
      label: "Food",
      value:
        tracking?.food.presented.energyKcal != null
          ? `${tracking.food.presented.energyKcal} kcal`
          : "Not logged",
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
            {me?.practiceName
              ? `Your nutrition day with ${me.practiceName} — plan, tracking, and messages in one place.`
              : "Your nutrition day — plan, tracking, and messages in one place."}
          </p>
        </div>
        <div className="ui-client-welcome__orb" aria-hidden="true" />
      </header>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Section title="Today’s focus" description="A quick pulse on what you’ve logged so far." tone="mint">
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

      <nav className="ui-client-quick" aria-label="Quick links">
        <Link href="/client/plan" className="ui-client-quick__item" data-tone="plan">
          <span className="ui-client-quick__icon">{PatientAccents.plan}</span>
          <span>
            <strong>My Plan</strong>
            <span className="ui-muted">Meals for the week</span>
          </span>
        </Link>
        <Link href="/client/tracking" className="ui-client-quick__item" data-tone="food">
          <span className="ui-client-quick__icon">{PatientAccents.food}</span>
          <span>
            <strong>Tracking</strong>
            <span className="ui-muted">Food, water & habits</span>
          </span>
        </Link>
        <Link href="/client/messages" className="ui-client-quick__item" data-tone="messages">
          <span className="ui-client-quick__icon">{PatientAccents.messages}</span>
          <span>
            <strong>Messages</strong>
            <span className="ui-muted">Chat with your dietitian</span>
          </span>
        </Link>
        <Link href="/client/documents" className="ui-client-quick__item" data-tone="documents">
          <span className="ui-client-quick__icon">{PatientAccents.documents}</span>
          <span>
            <strong>Documents</strong>
            <span className="ui-muted">Shared files</span>
          </span>
        </Link>
      </nav>

      <div className="ui-client-home__grid">
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
          ) : plan?.plan ? (
            <div className="ui-client-spotlight">
              <span className="ui-client-spotlight__badge">Active</span>
              <h3>{plan.plan.name}</h3>
              {plan.plan.description ? (
                <p className="ui-muted">{plan.plan.description}</p>
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

        <Section
          title="Messages"
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
      </div>

      {openInvoices.length > 0 ? (
        <Section title="Billing" description="Invoices that still need attention.">
          <ul className="ui-client-invoice-list">
            {openInvoices.slice(0, 3).map((invoice) => (
              <li key={invoice.id}>
                <div>
                  <strong>{invoice.invoiceNumber ?? "Invoice"}</strong>
                  <div className="ui-muted">{formatMoney(invoice.total, invoice.currency)}</div>
                </div>
                <StatusBadge status={invoice.status} label={statusLabel(invoice.status)} />
              </li>
            ))}
          </ul>
          <div className="ui-client-actions">
            <Link href="/client/invoices" className="ui-link">
              View all invoices
            </Link>
          </div>
        </Section>
      ) : null}
    </section>
  );
}
