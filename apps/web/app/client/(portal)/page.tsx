"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Card, PageHeader, StatCard } from "@nutrition-saas/ui";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";

interface PortalMe {
  client: { firstName: string; lastName: string; displayName: string | null };
}

interface PortalPlan {
  plan: { name: string } | null;
}

interface Summary {
  food: { presented: { energyKcal: number | null } };
  water: { totalLiters: number };
}

interface Message {
  id: string;
}

interface Invoice {
  id: string;
  status: string;
}

export default function ClientHomePage() {
  const [me, setMe] = useState<PortalMe | null>(null);
  const [plan, setPlan] = useState<PortalPlan | null>(null);
  const [tracking, setTracking] = useState<Summary | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      .catch((err) => setError(errorMessage(err, "Unable to load your home")));
  }, []);

  const name = me?.client.displayName ?? `${me?.client.firstName ?? ""} ${me?.client.lastName ?? ""}`.trim();

  return (
    <section>
      <PageHeader title={name ? `Hello, ${name}` : "Today"} description="Your plan, tracking, and messages in one place." />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="ui-grid">
        <StatCard label="Meal plan" value={plan?.plan?.name ?? "Not published yet"} />
        <StatCard label="Today’s calories" value={tracking?.food.presented.energyKcal ?? "—"} />
        <StatCard label="Water" value={tracking ? `${tracking.water.totalLiters.toFixed(1)} L` : "—"} />
        <StatCard label="Messages" value={messages.length} />
      </div>
      <div className="ui-stack" style={{ marginTop: 20 }}>
        <Card>
          <Link href="/client/plan" className="ui-link">
            Open meal plan
          </Link>
        </Card>
        <Card>
          <Link href="/client/tracking" className="ui-link">
            Log tracking
          </Link>
        </Card>
        <Card>
          <Link href="/client/invoices" className="ui-link">
            Invoices ({invoices.length})
          </Link>
        </Card>
      </div>
    </section>
  );
}
