"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  StatusBadge,
  Tabs,
  Textarea,
} from "@nutrition-saas/ui";
import { ListFilters, LIST_SEARCH_DEBOUNCE_MS } from "../../../../components/list-filters";
import { api } from "../../../../lib/api";
import {
  countActiveQuestions,
  emptyEvaluationSchema,
  type EvaluationTemplate,
} from "../../../../lib/evaluation";
import { errorMessage } from "../../../../lib/humanize-error";
import { usePractice } from "../practice-shell";

const VIEWS = ["active", "inactive", "all"] as const;
type ViewKey = (typeof VIEWS)[number];

const VIEW_LABELS: Record<ViewKey, string> = {
  active: "Active",
  inactive: "Inactive",
  all: "All",
};

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

  const [templates, setTemplates] = useState<EvaluationTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewKey>("active");
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  async function load() {
    const rows = await api<EvaluationTemplate[]>(`${apiBase}/assessment-templates?includeInactive=true`);
    setTemplates(rows);
  }

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load form library")));
  }, [dietitianAccountId]);

  useEffect(() => {
    const next = searchDraft.trim();
    if (next === search) return;
    const timer = window.setTimeout(() => {
      setSearch(next);
    }, LIST_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search, searchDraft]);

  const allTemplates = templates ?? [];

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allTemplates.filter((row) => {
      const rowStatus = row.status ?? "ACTIVE";
      if (view === "active" && rowStatus !== "ACTIVE") return false;
      if (view === "inactive" && rowStatus === "ACTIVE") return false;
      if (!query) return true;
      return row.name.toLowerCase().includes(query) || (row.description ?? "").toLowerCase().includes(query);
    });
  }, [allTemplates, search, view]);

  const hasSearch = Boolean(search.trim());

  function openCreate() {
    setNewName("");
    setNewDescription("");
    setCreateError(null);
    setError(null);
    setShowCreate(true);
  }

  function closeCreate() {
    if (busy) return;
    setShowCreate(false);
    setCreateError(null);
  }

  function clearSearch() {
    setSearchDraft("");
    setSearch("");
  }

  async function createForm(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (name.length < 2) {
      setCreateError("Enter a form name (at least 2 characters).");
      return;
    }
    setBusy(true);
    setError(null);
    setCreateError(null);
    try {
      const row = await api<EvaluationTemplate>(`${apiBase}/assessment-templates`, {
        method: "POST",
        body: JSON.stringify({
          name,
          description: newDescription.trim() || undefined,
          schema: emptyEvaluationSchema(),
        }),
      });
      setShowCreate(false);
      router.push(`${base}/${row.id}${fromClientQs}`);
    } catch (err) {
      setCreateError(errorMessage(err, "Unable to create form"));
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
    <section className="ui-list-page">
      <PageHeader
        title="Form library"
        description="Reusable evaluation templates. Assign them to a client from that client’s Evaluation tab."
        actions={
          <div className="ui-row" style={{ gap: 10 }}>
            {clientEvalsHref ? (
              <Link href={clientEvalsHref} className="ui-btn ui-btn--secondary">
                Back to client
              </Link>
            ) : null}
            <Button onClick={openCreate}>New form</Button>
          </div>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Tabs
        items={VIEWS.map((id) => ({ id, label: VIEW_LABELS[id] }))}
        value={view}
        onChange={(id) => setView(id as ViewKey)}
      />

      <ListFilters
        search={searchDraft}
        onSearchChange={setSearchDraft}
        searchPlaceholder="Search forms"
        hasFilters={hasSearch}
        onClear={clearSearch}
        count={filtered.length}
        countNoun="form"
        loading={!templates && !error}
      />

      <div className="ui-list-results">
        {filtered.length === 0 ? (
          <EmptyState
            title={allTemplates.length === 0 ? "No forms yet" : "No forms in this view"}
            action={
              view === "active" && !hasSearch && allTemplates.length === 0 ? (
                <Button onClick={openCreate}>New form</Button>
              ) : hasSearch ? (
                <Button variant="secondary" onClick={clearSearch}>
                  Clear
                </Button>
              ) : undefined
            }
          >
            {hasSearch
              ? "Try a different search, or clear filters."
              : allTemplates.length === 0
                ? "Create a form, add questions, then assign it from a client’s Evaluation tab."
                : "Try switching to a different view or create a new form."}
          </EmptyState>
        ) : (
          <ul className="ui-list-cards">
            {filtered.map((row) => {
              const questions = countActiveQuestions(row.schema);
              const rowStatus = row.status ?? "ACTIVE";
              const meta = [
                `${questions} question${questions === 1 ? "" : "s"}`,
                row.description,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={row.id}>
                  <article className="ui-list-cards__item">
                    <Link
                      href={`${base}/${row.id}${fromClientQs}`}
                      className="ui-list-cards__main"
                      title={row.name}
                    >
                      <strong>{row.name}</strong>
                      <p>{meta}</p>
                    </Link>
                    <div className="ui-list-cards__aside">
                      <StatusBadge
                        status={rowStatus}
                        label={rowStatus === "ACTIVE" ? "Active" : "Inactive"}
                      />
                      <div className="ui-list-cards__actions">
                        <Link href={`${base}/${row.id}${fromClientQs}`} className="ui-list-cards__action">
                          Edit
                        </Link>
                        <Link
                          href={`${base}/${row.id}/preview${fromClientQs}`}
                          className="ui-list-cards__action"
                        >
                          Preview
                        </Link>
                        {rowStatus === "ACTIVE" ? (
                          <button
                            type="button"
                            className="ui-list-cards__action is-danger"
                            disabled={busy}
                            onClick={() => void setTemplateStatus(row.id, "INACTIVE")}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="ui-list-cards__action"
                            disabled={busy}
                            onClick={() => void setTemplateStatus(row.id, "ACTIVE")}
                          >
                            Activate
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={showCreate} title="New evaluation form" onClose={closeCreate}>
        <form className="ui-stack" style={{ gap: 14 }} onSubmit={(event) => void createForm(event)}>
          {createError ? <Alert tone="danger">{createError}</Alert> : null}
          <p className="ui-muted" style={{ margin: 0 }}>
            Saved to this clinic library. Assign it from a client’s Evaluation tab.
          </p>
          <Field label="Form name">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Initial intake"
              required
              minLength={2}
              maxLength={120}
              autoFocus
            />
          </Field>
          <Field label="Description" hint="Optional">
            <Textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="What this form is for…"
              rows={3}
              maxLength={500}
            />
          </Field>
          <div className="ui-row" style={{ gap: 10, justifyContent: "flex-end" }}>
            <Button type="button" variant="secondary" disabled={busy} onClick={closeCreate}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || newName.trim().length < 2}>
              {busy ? "Creating…" : "Create form"}
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
