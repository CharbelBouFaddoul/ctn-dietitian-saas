"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  DonutChart,
  PageHeader,
  Section,
  Skeleton,
  TrendChart,
  type DonutSlice,
  type TrendPoint,
} from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { formatMoney } from "../../../../lib/format";
import { errorMessage } from "../../../../lib/humanize-error";
import { statusLabel } from "../../../../lib/practice-labels";

const PERIODS = ["today", "this_week", "this_month", "last_30_days", "last_90_days"] as const;
type Period = (typeof PERIODS)[number];

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  this_week: "This week",
  this_month: "This month",
  last_30_days: "30 days",
  last_90_days: "90 days",
};

const STATUS_COLORS: Record<string, string> = {
  ISSUED: "#f59e0b",
  SENT: "#3b82f6",
  OVERDUE: "#dc2626",
};

const APPOINTMENT_COLORS: Record<string, string> = {
  COMPLETED: "#16a34a",
  SCHEDULED: "#3b82f6",
  CANCELLED: "#94a3b8",
  NO_SHOW: "#dc2626",
  RESCHEDULE_PENDING: "#f59e0b",
  CANCELLATION_PENDING: "#f59e0b",
  REQUESTED: "#f59e0b",
};

const APPOINTMENT_LABELS: Record<string, string> = {
  COMPLETED: "Completed",
  SCHEDULED: "Scheduled",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
  RESCHEDULE_PENDING: "Reschedule pending",
  CANCELLATION_PENDING: "Cancellation pending",
  REQUESTED: "Visit requested",
};

const TRACKING_META: Record<
  string,
  { label: string; color: string }
> = {
  food: { label: "Food", color: "#0f766e" },
  water: { label: "Water", color: "#3b82f6" },
  exercise: { label: "Exercise", color: "#f59e0b" },
  sleep: { label: "Sleep", color: "#8b5cf6" },
  habit: { label: "Habits", color: "#10b981" },
};

interface Overview {
  timezone?: string;
  start?: string;
  end?: string;
  appointments?: number;
  appointmentsByStatus?: Array<{ status: string; count: number }>;
  appointmentCompletionRate?: number | null;
  activityVolume?: number;
  collectionRate?: number | null;
  loggingCoverage?: number | null;
  invoicedAmount?: number;
  paidAmount?: number;
  clientsLogged?: number;
  activeClients?: number;
  newClients?: number;
  previous?: {
    collectionRate?: number | null;
    loggingCoverage?: number | null;
    appointments?: number;
    activityVolume?: number;
  };
}

interface Financial {
  currency?: string;
  outstanding?: { count: number; total: number };
  outstandingByStatus?: Array<{ status: string; count: number; total: number }>;
}

interface Activity {
  foodLogs?: number;
  waterLogs?: number;
  exerciseLogs?: number;
  sleepLogs?: number;
  habitLogs?: number;
  clientsLogged?: number;
  activeClients?: number;
  byType?: Array<{ type: string; logs: number; clients: number }>;
}

interface Series {
  grain?: "day" | "week";
  revenue?: Array<{ at: string; invoiced: number; paid: number }>;
}

type Delta = { text: string; dir: "up" | "down" | "flat" };

function rateDelta(current: number | null | undefined, previous: number | null | undefined): Delta | null {
  if (current == null || previous == null) return null;
  const diff = (current - previous) * 100;
  if (Math.abs(diff) < 0.05) return { text: "—", dir: "flat" };
  const dir = diff > 0 ? "up" : "down";
  return { text: `${dir === "up" ? "▲" : "▼"} ${Math.abs(diff).toFixed(1)} pts`, dir };
}

function countDelta(current: number | undefined, previous: number | undefined): Delta | null {
  if (current == null || previous == null) return null;
  const diff = current - previous;
  if (diff === 0) return { text: "—", dir: "flat" };
  const dir = diff > 0 ? "up" : "down";
  return { text: `${dir === "up" ? "▲" : "▼"} ${Math.abs(diff)}`, dir };
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

function formatRangeDate(iso: string | undefined, timeZone: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    timeZone: timeZone || undefined,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Human label for the clinic IANA timezone from practice settings. */
function formatClinicTimezone(timeZone: string | undefined): string | null {
  if (!timeZone) return null;
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZone,
      timeZoneName: "long",
    }).formatToParts(new Date());
    const name = parts.find((part) => part.type === "timeZoneName")?.value;
    if (name) return name;
  } catch {
    /* fall through */
  }
  return timeZone.replace(/_/g, " ");
}

function Kpi({
  label,
  value,
  delta,
  loading,
  hint,
}: {
  label: string;
  value: string;
  delta: Delta | null;
  loading: boolean;
  hint: string;
}) {
  return (
    <div className="ui-kpi ui-tooltip" data-tip={hint}>
      <span className="ui-kpi__label">{label}</span>
      <span className="ui-kpi__value">{loading ? "—" : value}</span>
      {!loading && delta ? (
        <span className="ui-kpi__meta">
          <span
            className={`ui-kpi__delta${delta.dir === "up" ? " is-up" : delta.dir === "down" ? " is-down" : ""}`}
          >
            {delta.text}
          </span>
          <span>vs last period</span>
        </span>
      ) : null}
    </div>
  );
}

export default function AnalyticsPage() {
  const params = useParams<{ dietitianAccountId: string }>();
  const dietitianAccountId = params.dietitianAccountId;
  const [period, setPeriod] = useState<Period>("this_month");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [financial, setFinancial] = useState<Financial | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const query = `?period=${period}`;
    Promise.all([
      api<Overview>(`/api/v1/dietitian/${dietitianAccountId}/analytics/overview${query}`),
      api<Financial>(`/api/v1/dietitian/${dietitianAccountId}/analytics/financial${query}`),
      api<Activity>(`/api/v1/dietitian/${dietitianAccountId}/analytics/activity${query}`),
      api<Series>(`/api/v1/dietitian/${dietitianAccountId}/analytics/series${query}`),
    ])
      .then(([overviewData, financialData, activityData, seriesData]) => {
        if (cancelled) return;
        setOverview(overviewData);
        setFinancial(financialData);
        setActivity(activityData);
        setSeries(seriesData);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, "Unable to load analytics"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dietitianAccountId, period]);

  const currency = financial?.currency ?? "USD";
  const timezone = overview?.timezone;
  const clinicTz = formatClinicTimezone(timezone);
  const caption =
    overview?.start && overview.end
      ? `${formatRangeDate(overview.start, timezone)} – ${formatRangeDate(overview.end, timezone)}${clinicTz ? ` · ${clinicTz}` : ""}`
      : "Dates use your practice timezone from Settings.";

  const revenuePoints: TrendPoint[] = (series?.revenue ?? []).map((point) => ({
    at: point.at,
    primary: point.invoiced,
    compare: point.paid,
  }));
  const hasRevenue = revenuePoints.some((point) => point.primary > 0 || (point.compare ?? 0) > 0);

  const appointmentSlices: DonutSlice[] = (overview?.appointmentsByStatus ?? []).map((row) => ({
    label: `${APPOINTMENT_LABELS[row.status] ?? statusLabel(row.status)} · ${row.count}`,
    value: row.count,
    color: APPOINTMENT_COLORS[row.status] ?? "#94a3b8",
  }));
  const appointmentTotal = overview?.appointments ?? 0;
  const appointmentCompletion = overview?.appointmentCompletionRate;
  const decidedAppointments = (overview?.appointmentsByStatus ?? []).reduce((sum, row) => {
    if (row.status === "COMPLETED" || row.status === "CANCELLED" || row.status === "NO_SHOW") {
      return sum + row.count;
    }
    return sum;
  }, 0);
  const completedAppointments =
    overview?.appointmentsByStatus?.find((row) => row.status === "COMPLETED")?.count ?? 0;
  const appointmentCaption = loading
    ? "Booked visits in this period by outcome."
    : appointmentTotal <= 0
      ? "No appointments in this period."
      : appointmentCompletion != null
        ? `${appointmentTotal} booked · ${completedAppointments} of ${decidedAppointments} decided completed (${formatPercent(appointmentCompletion)})`
        : `${appointmentTotal} booked · none completed, cancelled, or marked no-show yet`;

  const outstandingSlices: DonutSlice[] = (financial?.outstandingByStatus ?? []).map((row) => ({
    label: `${statusLabel(row.status)} · ${formatMoney(row.total, currency)}`,
    value: row.total,
    color: STATUS_COLORS[row.status] ?? "#94a3b8",
  }));
  const outstandingTotal = financial?.outstanding?.total ?? 0;
  const outstandingCount = financial?.outstanding?.count ?? 0;

  const trackingRows = (activity?.byType ?? [
    { type: "food", logs: activity?.foodLogs ?? 0, clients: 0 },
    { type: "water", logs: activity?.waterLogs ?? 0, clients: 0 },
    { type: "exercise", logs: activity?.exerciseLogs ?? 0, clients: 0 },
    { type: "sleep", logs: activity?.sleepLogs ?? 0, clients: 0 },
    { type: "habit", logs: activity?.habitLogs ?? 0, clients: 0 },
  ]).map((row) => ({
    ...row,
    meta: TRACKING_META[row.type] ?? { label: row.type, color: "#94a3b8" },
  }));
  const trackingTotal = trackingRows.reduce((sum, row) => sum + row.logs, 0);
  const trackingMax = trackingRows.reduce((peak, row) => Math.max(peak, row.logs), 0);
  const clientsLogged = activity?.clientsLogged ?? overview?.clientsLogged ?? 0;
  const activeClients = activity?.activeClients ?? overview?.activeClients ?? 0;
  const avgLogsPerLoggingClient =
    clientsLogged > 0 && trackingTotal > 0 ? Math.round((trackingTotal / clientsLogged) * 10) / 10 : null;

  const collectionDelta = rateDelta(overview?.collectionRate, overview?.previous?.collectionRate);
  const revenueSummary = loading
    ? null
    : [
        overview?.collectionRate != null ? `Collected ${formatPercent(overview.collectionRate)}` : null,
        overview?.invoicedAmount != null ? `Invoiced ${formatMoney(overview.invoicedAmount, currency)}` : null,
        overview?.paidAmount != null ? `Paid ${formatMoney(overview.paidAmount, currency)}` : null,
        collectionDelta && collectionDelta.dir !== "flat" ? `${collectionDelta.text} vs last period` : null,
      ]
        .filter(Boolean)
        .join(" · ");

  return (
    <section className="ui-analytics">
      <PageHeader
        title="Analytics"
        description={caption}
        actions={
          <div className="ui-segment" role="group" aria-label="Reporting period">
            {PERIODS.map((option) => (
              <button
                key={option}
                type="button"
                className={`ui-segment__btn${option === period ? " is-active" : ""}`}
                aria-pressed={option === period}
                onClick={() => setPeriod(option)}
              >
                {PERIOD_LABELS[option]}
              </button>
            ))}
          </div>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {loading && !overview ? (
        <div className="ui-kpi-strip ui-kpi-strip--3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} style={{ height: 96, width: "100%" }} />
          ))}
        </div>
      ) : (
        <div className="ui-kpi-strip ui-kpi-strip--3">
          <Kpi
            label="Clients logging"
            value={formatPercent(overview?.loggingCoverage)}
            delta={rateDelta(overview?.loggingCoverage, overview?.previous?.loggingCoverage)}
            loading={loading}
            hint="Share of active clients who logged food, water, exercise, sleep, or habits."
          />
          <Kpi
            label="Appointments"
            value={String(overview?.appointments ?? 0)}
            delta={countDelta(overview?.appointments, overview?.previous?.appointments)}
            loading={loading}
            hint="Appointments scheduled in this period. See the chart for completed, cancelled, and no-shows."
          />
          <Kpi
            label="New clients"
            value={String(overview?.newClients ?? 0)}
            delta={null}
            loading={loading}
            hint="Clients added during this period."
          />
        </div>
      )}

      <div className="ui-analytics__charts">
        <Section
          className="ui-analytics__wide"
          title="Revenue"
          description={
            revenueSummary
              ? revenueSummary
              : series?.grain === "week"
                ? "Invoiced and paid by week."
                : "Invoiced and paid by day."
          }
        >
          {loading && !series ? (
            <Skeleton style={{ height: 160, width: "100%" }} />
          ) : hasRevenue ? (
            <TrendChart
              points={revenuePoints}
              primaryLabel="Invoiced"
              compareLabel="Paid"
              formatValue={(value) => formatMoney(value, currency)}
              height={160}
            />
          ) : (
            <TrendChart
              points={[]}
              primaryLabel="Invoiced"
              emptyTitle="No invoices in this period"
              height={160}
            />
          )}
        </Section>

        <Section title="Appointments" description={appointmentCaption}>
          {loading && !overview ? (
            <Skeleton style={{ height: 160, width: "100%" }} />
          ) : appointmentSlices.length ? (
            <DonutChart
              slices={appointmentSlices}
              size={168}
              thickness={22}
              showPct={false}
              center={
                <div style={{ textAlign: "center" }}>
                  <div className="ui-kpi__label">Booked</div>
                  <strong>{appointmentTotal}</strong>
                </div>
              }
            />
          ) : (
            <p className="ui-muted">No appointments in this period.</p>
          )}
        </Section>

        <Section
          title="Open invoices"
          description="Current unpaid balance by status (not limited to this period)."
          actions={
            <Link href={`/practice/${dietitianAccountId}/invoices`} className="ui-link">
              View invoices
            </Link>
          }
        >
          {loading && !financial ? (
            <Skeleton style={{ height: 160, width: "100%" }} />
          ) : outstandingSlices.length ? (
            <DonutChart
              slices={outstandingSlices}
              size={168}
              thickness={22}
              valueUnit={currency}
              showPct={false}
              center={
                <div style={{ textAlign: "center" }}>
                  <div className="ui-kpi__label">
                    {outstandingCount} open
                  </div>
                  <strong>{formatMoney(outstandingTotal, currency)}</strong>
                </div>
              }
            />
          ) : (
            <p className="ui-muted">No open invoices.</p>
          )}
        </Section>

        <Section
          className="ui-analytics__wide"
          title="Client tracking"
          description={
            loading && !activity
              ? "Who is logging, and what they log."
              : activeClients > 0
                ? `${clientsLogged} of ${activeClients} active clients logged${avgLogsPerLoggingClient != null ? ` · ~${avgLogsPerLoggingClient} logs each` : ""}`
                : "Who is logging, and what they log."
          }
        >
          {loading && !activity ? (
            <Skeleton style={{ height: 160, width: "100%" }} />
          ) : trackingTotal <= 0 ? (
            <p className="ui-muted">No tracking logs in this period.</p>
          ) : (
            <ul className="ui-tracking-mix">
              {trackingRows.map((row) => {
                const share = trackingTotal > 0 ? Math.round((row.logs / trackingTotal) * 100) : 0;
                const width = trackingMax > 0 ? Math.max(row.logs > 0 ? 4 : 0, (row.logs / trackingMax) * 100) : 0;
                const avg = row.clients > 0 ? Math.round((row.logs / row.clients) * 10) / 10 : null;
                return (
                  <li key={row.type} className="ui-tracking-mix__row">
                    <div className="ui-tracking-mix__head">
                      <span className="ui-tracking-mix__label">{row.meta.label}</span>
                      <span className="ui-tracking-mix__stats">
                        <strong>{row.logs}</strong> logs
                        <span aria-hidden="true"> · </span>
                        {row.clients} {row.clients === 1 ? "client" : "clients"}
                        {avg != null ? (
                          <>
                            <span aria-hidden="true"> · </span>~{avg} each
                          </>
                        ) : null}
                        <span aria-hidden="true"> · </span>
                        {share}%
                      </span>
                    </div>
                    <span className="ui-tracking-mix__track">
                      <span
                        className="ui-tracking-mix__fill"
                        style={{ width: `${width}%`, background: row.meta.color }}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </section>
  );
}
