"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  LoadingState,
  PageHeader,
  StatusBadge,
  Switch,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { AutomationRuleDialog } from "../../../../components/automation-rule-dialog";
import { api } from "../../../../lib/api";
import {
  humanRuleSummary,
  type AutomationClientOption,
  type AutomationRuleRecord,
  type AutomationUsageSummary,
} from "../../../../lib/automation-rule-form";
import { errorMessage } from "../../../../lib/humanize-error";

export default function AutomationsPage() {
  const params = useParams<{ dietitianAccountId: string }>();
  const dietitianAccountId = params.dietitianAccountId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");

  const [rules, setRules] = useState<AutomationRuleRecord[]>([]);
  const [usage, setUsage] = useState<AutomationUsageSummary | null>(null);
  const [clients, setClients] = useState<AutomationClientOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [editingRule, setEditingRule] = useState<AutomationRuleRecord | null>(null);
  const [initialTemplateId, setInitialTemplateId] = useState<string | null>(null);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  const visibleRules = useMemo(() => rules.filter((rule) => rule.status !== "ARCHIVED"), [rules]);
  const editingFromQuery = useMemo(
    () => (editId ? rules.find((rule) => rule.id === editId) ?? null : null),
    [editId, rules],
  );
  const atRuleLimit = usage != null && usage.rulesRemaining === 0;
  const canAdd = Boolean(usage?.enabled) && !atRuleLimit;

  async function load() {
    const [ruleList, usageSummary, clientPage] = await Promise.all([
      api<AutomationRuleRecord[]>(`/api/v1/dietitian/${dietitianAccountId}/automations`),
      api<AutomationUsageSummary>(`/api/v1/dietitian/${dietitianAccountId}/automations/usage/summary`),
      api<{ items: AutomationClientOption[] }>(`/api/v1/dietitian/${dietitianAccountId}/clients?pageSize=50`),
    ]);
    setRules(ruleList);
    setUsage(usageSummary);
    setClients(clientPage.items);
  }

  useEffect(() => {
    setLoading(true);
    void load()
      .catch((err) => setError(errorMessage(err, "Unable to load automations")))
      .finally(() => setLoading(false));
  }, [dietitianAccountId]);

  useEffect(() => {
    if (!editId || !editingFromQuery) return;
    setDialogMode("edit");
    setEditingRule(editingFromQuery);
    setInitialTemplateId(null);
    setDialogOpen(true);
  }, [editId, editingFromQuery]);

  function openCreate() {
    if (editId) router.replace(`/practice/${dietitianAccountId}/automations`);
    setDialogMode("create");
    setEditingRule(null);
    setInitialTemplateId(null);
    setDialogOpen(true);
  }

  function openEdit(rule: AutomationRuleRecord) {
    setDialogMode("edit");
    setEditingRule(rule);
    setInitialTemplateId(null);
    setDialogOpen(true);
    router.replace(`/practice/${dietitianAccountId}/automations?edit=${rule.id}`);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingRule(null);
    setInitialTemplateId(null);
    if (editId) router.replace(`/practice/${dietitianAccountId}/automations`);
  }

  async function setStatus(id: string, action: "activate" | "pause") {
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/automations/${id}/${action}`, { method: "POST" });
      await load();
      return true;
    } catch (err) {
      setError(errorMessage(err, "Unable to update rule"));
      return false;
    }
  }

  async function deleteRule(id: string) {
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/automations/${id}`, { method: "DELETE" });
      await load();
      return true;
    } catch (err) {
      setError(errorMessage(err, "Unable to delete rule"));
      return false;
    }
  }

  return (
    <section className="ui-automations">
      <PageHeader
        title="Automations"
        description="When something happens in the clinic, send a reminder, message, or task — you stay in control of every action."
        actions={
          <div className="ui-row">
            <Link href={`/practice/${dietitianAccountId}/automation-runs`} className="ui-btn ui-btn--secondary">
              Run history
            </Link>
            <Button disabled={!canAdd} onClick={() => openCreate()}>
              Add automation
            </Button>
          </div>
        }
      />

      {error ? (
        <div className="ui-automations__alert">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      {usage ? (
        <div className="ui-automations__chips">
          <span className={`ui-automations__chip${!usage.enabled ? " is-warn" : ""}`}>
            {usage.enabled ? "Automations on" : "Not on this plan"}
          </span>
          <span className="ui-automations__chip">
            Active rules {usage.activeRules}
            {usage.ruleLimit != null ? ` / ${usage.ruleLimit}` : ""}
          </span>
          <span className="ui-automations__chip">
            Runs this month {usage.executionCount}
            {usage.executionLimit != null ? ` / ${usage.executionLimit}` : ""}
          </span>
        </div>
      ) : null}

      {usage && !usage.enabled ? (
        <Alert tone="warning">Automations are not included on this plan. Upgrade to add rules.</Alert>
      ) : usage && atRuleLimit ? (
        <Alert tone="warning">You have used all rule slots on this plan.</Alert>
      ) : null}

      {loading ? (
        <LoadingState>Loading automations…</LoadingState>
      ) : visibleRules.length === 0 ? (
        <EmptyState title="No automations yet">
          Use Add automation to create a reminder, follow-up, or check-in.
        </EmptyState>
      ) : (
        <ul className="ui-automation-cards">
          {visibleRules.map((rule) => (
            <li key={rule.id} className="ui-automation-card">
              <div className="ui-automation-card__top">
                <div>
                  <Link href={`/practice/${dietitianAccountId}/automations/${rule.id}`} className="ui-automation-card__name">
                    {rule.name}
                  </Link>
                  <p className="ui-muted ui-automation-card__summary">{humanRuleSummary(rule)}</p>
                </div>
                <StatusBadge status={rule.status} label={humanizeLabel(rule.status)} />
              </div>
              <div className="ui-automation-card__meta">
                <span>
                  Last run{" "}
                  {rule.lastRunAt ? (
                    <time dateTime={rule.lastRunAt}>{new Date(rule.lastRunAt).toLocaleDateString()}</time>
                  ) : (
                    "Never"
                  )}
                </span>
                <Switch
                  checked={rule.status === "ACTIVE"}
                  label={rule.status === "ACTIVE" ? "On" : "Off"}
                  onCheckedChange={(next) => void setStatus(rule.id, next ? "activate" : "pause")}
                />
              </div>
              <div className="ui-automation-card__actions">
                <Button size="sm" variant="secondary" onClick={() => openEdit(rule)}>
                  Edit
                </Button>
                <Link href={`/practice/${dietitianAccountId}/automations/${rule.id}`} className="ui-btn ui-btn--ghost ui-btn--sm">
                  View runs
                </Link>
                <Button size="sm" variant="ghost" onClick={() => setArchiveId(rule.id)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AutomationRuleDialog
        open={dialogOpen}
        mode={dialogMode}
        dietitianAccountId={dietitianAccountId}
        rule={editingRule}
        usage={usage}
        clients={clients}
        initialTemplateId={initialTemplateId}
        onClose={closeDialog}
        onSaved={() => load()}
      />

      <ConfirmDialog
        open={archiveId != null}
        title="Delete this automation?"
        description="This cannot be undone. The rule and its run history will be removed."
        confirmLabel="Delete"
        danger
        pending={archiving}
        onCancel={() => setArchiveId(null)}
        onConfirm={() => {
          if (!archiveId) return;
          setArchiving(true);
          void deleteRule(archiveId)
            .then((ok) => {
              if (ok) setArchiveId(null);
            })
            .finally(() => setArchiving(false));
        }}
      />
    </section>
  );
}
