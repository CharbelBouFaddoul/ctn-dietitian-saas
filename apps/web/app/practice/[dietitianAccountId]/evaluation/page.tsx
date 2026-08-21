"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  EmptyState,
  FilterBar,
  PageHeader,
  SearchInput,
  Select,
  StatusBadge,
} from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import {
  countActiveQuestions,
  emptyEvaluationSchema,
  type EvaluationTemplate,
} from "../../../../lib/evaluation";
import { errorMessage } from "../../../../lib/humanize-error";
import { usePractice } from "../practice-shell";

export default function EvaluationFormsPage() {
  const { dietitianAccountId } = usePractice();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromClient = searchParams.get("fromClient");
  const fromClientQs = fromClient ? `?fromClient=${encodeURIComponent(fromClient)}` : "";
  const base = `/practice/${dietitianAccountId}/evaluation`;
  const apiBase = `/api/v1/dietitian/${dietitianAccountId}`;
  const clientEvalsHref = fromClient
    ? `/practice/${dietitianAccountId}/clients/${fromClient}?tab=assessments`
    : null;
  const [templates, setTemplates] = useState<EvaluationTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE" | "ALL">("ACTIVE");
  const [busy, setBusy] = useState(false);

  async function load() {
    const rows = await api<EvaluationTemplate[]>(`${apiBase}/assessment-templates?includeInactive=true`);
    setTemplates(rows);
  }

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load form library")));
  }, [dietitianAccountId]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return templates.filter((row) => {
      const rowStatus = row.status ?? "ACTIVE";
      if (status === "ACTIVE" && rowStatus !== "ACTIVE") return false;
      if (status === "INACTIVE" && rowStatus === "ACTIVE") return false;
      if (!query) return true;
      return row.name.toLowerCase().includes(query) || (row.description ?? "").toLowerCase().includes(query);
    });
  }, [templates, q, status]);

  async function createForm() {
    setBusy(true);
    setError(null);
    try {
      const row = await api<EvaluationTemplate>(`${apiBase}/assessment-templates`, {
        method: "POST",
        body: JSON.stringify({
          name: "Patient Evaluation",
          schema: emptyEvaluationSchema(),
        }),
      });
      router.push(`${base}/${row.id}${fromClientQs}`);
    } catch (err) {
      setError(errorMessage(err, "Unable to create form"));
      setBusy(false);
    }
  }

  async function setTemplateStatus(id: string, next: "ACTIVE" | "INACTIVE") {
    setBusy(true);
    setError(null);
    try {
      await api(`${apiBase}/assessment-templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to update form"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ui-eval">
      <PageHeader
        eyebrow="Clinic"
        title="Form library"
        description="Reusable evaluation templates. Assign them to a client from that client’s Evaluation tab."
        actions={
          <div className="ui-eval__header-actions">
            {clientEvalsHref ? (
              <Link href={clientEvalsHref} className="ui-btn ui-btn--secondary ui-btn--sm">
                Back to client
              </Link>
            ) : null}
            <Button type="button" disabled={busy} onClick={() => void createForm()}>
              New form
            </Button>
          </div>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <FilterBar>
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search forms…"
          aria-label="Search form library"
        />
        <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status filter">
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="ALL">All statuses</option>
        </Select>
      </FilterBar>

      {filtered.length === 0 ? (
        <EmptyState
          title={templates.length === 0 ? "No forms in the library yet" : "No forms match these filters"}
          action={
            templates.length === 0 ? (
              <Button type="button" disabled={busy} onClick={() => void createForm()}>
                Create your first form
              </Button>
            ) : undefined
          }
        >
          {templates.length === 0
            ? "Create a form, add questions, then assign it from a client’s Evaluation tab."
            : "Try clearing search or switching status."}
        </EmptyState>
      ) : (
        <div className="ui-eval__grid">
          {filtered.map((row) => {
            const questions = countActiveQuestions(row.schema);
            const rowStatus = row.status ?? "ACTIVE";
            return (
              <article key={row.id} className="ui-eval__card">
                <div className="ui-eval__card-head">
                  <h2>{row.name}</h2>
                  <StatusBadge status={rowStatus} label={rowStatus === "ACTIVE" ? "Active" : "Inactive"} />
                </div>
                <p className="ui-eval__card-meta">
                  {questions} question{questions === 1 ? "" : "s"}
                  {row.description ? ` · ${row.description}` : ""}
                </p>
                <div className="ui-eval__card-actions">
                  <Link href={`${base}/${row.id}${fromClientQs}`} className="ui-btn ui-btn--primary ui-btn--sm">
                    Edit questions
                  </Link>
                  <Link
                    href={`${base}/${row.id}/preview${fromClientQs}`}
                    className="ui-btn ui-btn--secondary ui-btn--sm"
                  >
                    Preview
                  </Link>
                  {rowStatus === "ACTIVE" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void setTemplateStatus(row.id, "INACTIVE")}
                    >
                      Deactivate
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void setTemplateStatus(row.id, "ACTIVE")}
                    >
                      Activate
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
