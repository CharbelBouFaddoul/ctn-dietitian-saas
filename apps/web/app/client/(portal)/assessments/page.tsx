"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, EmptyState, PageHeader, Skeleton, StatusBadge } from "@nutrition-saas/ui";
import { ListFilters } from "../../../../components/list-filters";
import { api } from "../../../../lib/api";
import {
  evaluationStatusLabel,
  type EvaluationAssessment,
} from "../../../../lib/evaluation";
import { errorMessage } from "../../../../lib/humanize-error";
import { formatDate } from "../../../../lib/format";

export default function PortalAssessmentsPage() {
  const [rows, setRows] = useState<EvaluationAssessment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api<EvaluationAssessment[]>("/api/v1/portal/assessments");
      setRows(list);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to load assessments"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    function onSwitch() {
      void load();
    }
    window.addEventListener("portal-connection-changed", onSwitch);
    return () => window.removeEventListener("portal-connection-changed", onSwitch);
  }, [load]);

  const query = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      query
        ? rows.filter((row) => (row.templateName ?? "").toLowerCase().includes(query))
        : rows,
    [rows, query],
  );
  const openRows = filtered.filter((r) => r.status === "IN_PROGRESS" || r.status === "DRAFT");
  const doneRows = filtered.filter((r) => r.status === "COMPLETED");
  const hasSearch = Boolean(query);

  return (
    <section className="ui-eval ui-eval--portal">
      <PageHeader
        eyebrow="Questionnaires"
        title="Your forms"
        description="Complete questionnaires from your dietitian. These are separate from the clinic’s standard chart notes."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <ListFilters
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search form name"
        hasFilters={hasSearch}
        onClear={() => setSearch("")}
        count={filtered.length}
        countNoun="form"
        loading={loading}
      />
      {loading ? <Skeleton style={{ height: 140, borderRadius: 14 }} /> : null}

      {!loading && openRows.length === 0 && doneRows.length === 0 ? (
        <EmptyState title={hasSearch ? "No forms match" : "No evaluations yet"}>
          {hasSearch
            ? "Try a different search, or clear the filter."
            : "When your dietitian starts a patient evaluation for you, it will appear here."}
        </EmptyState>
      ) : null}

      {!loading && openRows.length > 0 ? (
        <div className="ui-eval__portal-block">
          <h2 className="ui-eval__portal-heading">To complete</h2>
          <div className="ui-eval__list-cards">
            {openRows.map((row) => (
              <Link key={row.id} href={`/client/assessments/${row.id}`} className="ui-eval__list-card ui-eval__list-card--action">
                <div>
                  <strong>{row.templateName}</strong>
                  <p className="ui-eval__card-meta">{evaluationStatusLabel(row.status)} · Continue where you left off</p>
                </div>
                <span className="ui-btn ui-btn--primary ui-btn--sm">Open</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {!loading && doneRows.length > 0 ? (
        <div className="ui-eval__portal-block">
          <h2 className="ui-eval__portal-heading">Submitted</h2>
          <div className="ui-eval__list-cards">
            {doneRows.map((row) => (
              <Link key={row.id} href={`/client/assessments/${row.id}`} className="ui-eval__list-card">
                <div>
                  <strong>{row.templateName}</strong>
                  <p className="ui-eval__card-meta">
                    {row.completedAt ? formatDate(row.completedAt) : formatDate(row.createdAt)}
                  </p>
                </div>
                <StatusBadge status={row.status} label={evaluationStatusLabel(row.status)} />
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
