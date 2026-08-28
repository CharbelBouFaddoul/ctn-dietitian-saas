"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  Field,
  Input,
  Select,
  Textarea,
} from "@nutrition-saas/ui";
import { api } from "../lib/api";
import {
  AUTOMATION_ACTIONS,
  CLIENT_NAME_FRIENDLY,
  buildAutomationConfiguration,
  clientLabel,
  defaultActionCopy,
  hydrateRuleForm,
  previewRuleSummary,
  toFriendlyTemplate,
  triggerMeta,
  type AutomationClientOption,
  type AutomationRecipientChoice,
  type AutomationRuleRecord,
  type AutomationUsageSummary,
  type ClientScope,
} from "../lib/automation-rule-form";
import { AUTOMATION_TEMPLATES, type AutomationTemplate } from "../lib/automation-templates";
import {
  automationRecipientLabel,
  defaultRecipientForAction,
  recipientModeForAction,
} from "../lib/automation-labels";
import { errorMessage } from "../lib/humanize-error";

type Step = "when" | "then" | "scope" | "review";

const CREATE_STEPS: Step[] = ["when", "then", "scope", "review"];
const EDIT_STEPS: Step[] = ["then", "scope", "review"];

const STEP_LABEL: Record<Step, string> = {
  when: "When",
  then: "Then",
  scope: "Apply to",
  review: "Review",
};

export function AutomationRuleDialog({
  open,
  mode,
  dietitianAccountId,
  rule,
  usage,
  clients,
  initialTemplateId,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  dietitianAccountId: string;
  rule?: AutomationRuleRecord | null;
  usage: AutomationUsageSummary | null;
  clients: AutomationClientOption[];
  initialTemplateId?: string | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const steps = mode === "edit" ? EDIT_STEPS : CREATE_STEPS;
  const [step, setStep] = useState<Step>(steps[0]!);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState("CLIENT_INACTIVE");
  const [actionType, setActionType] = useState("CREATE_TASK");
  const [timingValue, setTimingValue] = useState(3);
  const [recipient, setRecipient] = useState<AutomationRecipientChoice>("ASSIGNED_DIETITIAN");
  const [clientScope, setClientScope] = useState<ClientScope>("ALL");
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [clientFilter, setClientFilter] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState(defaultActionCopy("CREATE_TASK").taskTitle);
  const [notificationTitle, setNotificationTitle] = useState(defaultActionCopy("CREATE_TASK").notificationTitle);
  const [notificationBody, setNotificationBody] = useState(defaultActionCopy("CREATE_TASK").notificationBody);

  function applyTemplate(template: AutomationTemplate) {
    setSelectedTemplateId(template.id);
    setName(template.name);
    setTriggerType(template.triggerType);
    setActionType(template.actionType);
    setTimingValue(template.timingValue ?? triggerMeta(template.triggerType).timingDefault ?? 1);
    setRecipient(template.recipient);
    setTaskTitle(template.taskTitle);
    setNotificationTitle(template.notificationTitle);
    setNotificationBody(template.notificationBody);
  }

  function resetCreate(templateId?: string | null) {
    const template = AUTOMATION_TEMPLATES.find((row) => row.id === templateId);
    const copy = defaultActionCopy("CREATE_TASK");
    setName(template?.name ?? "");
    setTriggerType(template?.triggerType ?? "CLIENT_INACTIVE");
    setActionType(template?.actionType ?? "CREATE_TASK");
    setTimingValue(template?.timingValue ?? 3);
    setRecipient(template?.recipient ?? "ASSIGNED_DIETITIAN");
    setTaskTitle(template?.taskTitle ?? copy.taskTitle);
    setNotificationTitle(template?.notificationTitle ?? copy.notificationTitle);
    setNotificationBody(template?.notificationBody ?? copy.notificationBody);
    setSelectedTemplateId(template?.id ?? null);
    setClientScope("ALL");
    setSelectedClientIds([]);
    setClientFilter("");
    setError(null);
    setStep(template ? "then" : "when");
  }

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setError(null);
    if (mode === "edit" && rule) {
      const hydrated = hydrateRuleForm(rule);
      setName(hydrated.name);
      setTriggerType(hydrated.triggerType);
      setActionType(hydrated.actionType);
      setTimingValue(hydrated.timingValue);
      setRecipient(hydrated.recipient);
      setClientScope(hydrated.clientScope);
      setSelectedClientIds(hydrated.selectedClientIds);
      setClientFilter("");
      setTaskTitle(hydrated.taskTitle);
      setNotificationTitle(hydrated.notificationTitle);
      setNotificationBody(hydrated.notificationBody);
      setSelectedTemplateId(
        AUTOMATION_TEMPLATES.find((row) => row.triggerType === hydrated.triggerType)?.id ?? null,
      );
      setStep("then");
      return;
    }
    resetCreate(initialTemplateId);
  }, [open, mode, rule?.id, initialTemplateId]);

  const availableActions = useMemo(() => {
    const actions: Array<{ value: string; label: string; hint: string }> = [...AUTOMATION_ACTIONS];
    if (actionType === "CREATE_CLIENT_NOTIFICATION" && !actions.some((row) => row.value === actionType)) {
      actions.push({
        value: "CREATE_CLIENT_NOTIFICATION",
        label: "Send notification",
        hint: "Bell notification in the client portal.",
      });
    }
    if (!usage?.productEmailEnabled) {
      return actions.filter((action) => action.value !== "SEND_EMAIL");
    }
    return actions;
  }, [usage, actionType]);

  const filteredClients = useMemo(() => {
    const q = clientFilter.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((client) => clientLabel(client).toLowerCase().includes(q));
  }, [clients, clientFilter]);

  const selectedTrigger = triggerMeta(triggerType);
  const selectedAction = availableActions.find((row) => row.value === actionType) ?? AUTOMATION_ACTIONS[2];
  const whoMode = recipientModeForAction(actionType);
  const effectiveRecipient: AutomationRecipientChoice =
    whoMode === "locked-client" ? "CLIENT" : whoMode === "hidden" ? "ASSIGNED_DIETITIAN" : recipient;
  const preview = previewRuleSummary({
    triggerType,
    actionType,
    recipient: effectiveRecipient,
    clientScope,
    selectedClientIds,
  });

  function onActionChange(next: string) {
    setActionType(next);
    const modeForAction = recipientModeForAction(next);
    if (modeForAction === "locked-client") setRecipient("CLIENT");
    else if (modeForAction === "hidden") setRecipient("ASSIGNED_DIETITIAN");
    else if (next === "SEND_EMAIL" && recipient === "BOTH") setRecipient("ASSIGNED_DIETITIAN");
    else if (recipient !== "ASSIGNED_DIETITIAN" && recipient !== "CLIENT" && recipient !== "BOTH") {
      setRecipient(defaultRecipientForAction(next));
    }
  }

  function toggleClient(id: string) {
    setSelectedClientIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  const caretByField = useRef<Record<string, { start: number; end: number }>>({});

  function rememberCaret(id: string, el: HTMLInputElement | HTMLTextAreaElement) {
    caretByField.current[id] = {
      start: el.selectionStart ?? el.value.length,
      end: el.selectionEnd ?? el.value.length,
    };
  }

  function tokenFieldProps(id: string) {
    const save = (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
      rememberCaret(id, event.currentTarget);
    };
    return {
      "data-token-field": id,
      onSelect: save,
      onKeyUp: save,
      onMouseUp: save,
      onBlur: save,
    };
  }

  function insertClientName(id: string, current: string, setter: (next: string) => void) {
    const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-token-field="${id}"]`);
    const saved = caretByField.current[id];
    const live = field != null && document.activeElement === field;
    const start = live ? (field.selectionStart ?? current.length) : (saved?.start ?? current.length);
    const end = live ? (field.selectionEnd ?? current.length) : (saved?.end ?? current.length);
    const next = `${current.slice(0, start)}${CLIENT_NAME_FRIENDLY}${current.slice(end)}`;
    setter(next);
    caretByField.current[id] = { start: start + CLIENT_NAME_FRIENDLY.length, end: start + CLIENT_NAME_FRIENDLY.length };
    const caret = start + CLIENT_NAME_FRIENDLY.length;
    window.setTimeout(() => {
      field?.focus();
      field?.setSelectionRange(caret, caret);
    }, 0);
  }

  function canContinue(): boolean {
    if (step === "when" && !selectedTemplateId) return false;
    if (step === "scope" && clientScope === "SELECTED" && selectedClientIds.length === 0) return false;
    if (step === "then") {
      if (actionType === "CREATE_TASK" && !taskTitle.trim()) return false;
      if (actionType === "SEND_MESSAGE" && !notificationBody.trim()) return false;
      if (
        (actionType === "SEND_IN_APP_NOTIFICATION" ||
          actionType === "CREATE_CLIENT_NOTIFICATION" ||
          actionType === "SEND_EMAIL") &&
        (!notificationTitle.trim() || !notificationBody.trim())
      ) {
        return false;
      }
    }
    return true;
  }

  function goNext() {
    if (!canContinue()) {
      if (step === "scope") setError("Select at least one client, or choose All clients.");
      else setError("Fill in the required fields to continue.");
      return;
    }
    setError(null);
    const index = steps.indexOf(step);
    const next = steps[index + 1];
    if (next) setStep(next);
  }

  function goBack() {
    setError(null);
    const index = steps.indexOf(step);
    const prev = steps[index - 1];
    if (prev) setStep(prev);
  }

  async function save(activate: boolean) {
    if (clientScope === "SELECTED" && selectedClientIds.length === 0) {
      setError("Select at least one client, or choose All clients.");
      setStep("scope");
      return;
    }
    setSaving(true);
    setError(null);
    const configuration = buildAutomationConfiguration({
      triggerType,
      actionType,
      timingValue,
      recipient: effectiveRecipient,
      clientScope,
      selectedClientIds,
      taskTitle,
      notificationTitle,
      notificationBody,
    });
    const body = {
      name: name.trim() || "New automation rule",
      triggerType,
      actionType,
      configuration,
      conditions: triggerType === "CLIENT_INACTIVE" ? { clientStatus: "ACTIVE" } : undefined,
    };
    try {
      if (mode === "edit" && rule) {
        await api(`/api/v1/dietitian/${dietitianAccountId}/automations/${rule.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        if (activate && rule.status !== "ACTIVE") {
          await api(`/api/v1/dietitian/${dietitianAccountId}/automations/${rule.id}/activate`, { method: "POST" });
        }
        if (!activate && rule.status === "ACTIVE") {
          await api(`/api/v1/dietitian/${dietitianAccountId}/automations/${rule.id}/pause`, { method: "POST" });
        }
      } else {
        const created = await api<AutomationRuleRecord>(`/api/v1/dietitian/${dietitianAccountId}/automations`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (activate) {
          await api(`/api/v1/dietitian/${dietitianAccountId}/automations/${created.id}/activate`, { method: "POST" });
        }
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err, mode === "edit" ? "Unable to save rule" : "Unable to create rule"));
    } finally {
      setSaving(false);
    }
  }

  const stepIndex = steps.indexOf(step);

  return (
    <Dialog
      open={open}
      title={mode === "edit" ? "Edit automation" : "Add automation"}
      onClose={onClose}
      className="ui-dialog--wide ui-automation-dialog"
    >
      <ol className="ui-automation-steps" aria-label="Steps">
        {steps.map((item, index) => (
          <li
            key={item}
            className={`ui-automation-steps__item${item === step ? " is-active" : ""}${index < stepIndex ? " is-done" : ""}`}
          >
            <span>{index + 1}</span>
            {STEP_LABEL[item]}
          </li>
        ))}
      </ol>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {step === "when" ? (
        <div className="ui-automation-templates">
          {AUTOMATION_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              className={`ui-automation-template${selectedTemplateId === template.id ? " is-selected" : ""}`}
              onClick={() => {
                applyTemplate(template);
                setError(null);
                setStep("then");
              }}
            >
              <strong>{template.title}</strong>
              <span>{template.description}</span>
            </button>
          ))}
        </div>
      ) : null}

      {step === "then" ? (
        <div className="ui-automation-dialog__fields">
          <p className="ui-muted ui-rule-step__hint">
            When {selectedTrigger.label.toLowerCase()}
            {selectedTrigger.timingKey ? null : " — runs as soon as this happens."}
          </p>
          {selectedTrigger.timingKey ? (
            <Field label={selectedTrigger.timingLabel ?? "Timing"}>
              <Input
                type="number"
                min={selectedTrigger.timingKey === "daysBefore" ? 0 : 1}
                value={timingValue}
                onChange={(event) => setTimingValue(Number(event.target.value))}
              />
            </Field>
          ) : null}
          <Field label="Action">
            <Select value={actionType} onChange={(event) => onActionChange(event.target.value)}>
              {availableActions.map((row) => (
                <option key={row.value} value={row.value}>
                  {row.label}
                </option>
              ))}
            </Select>
          </Field>
          {selectedAction?.hint ? <p className="ui-muted ui-rule-step__hint">{selectedAction.hint}</p> : null}

          {whoMode === "locked-client" ? (
            <p className="ui-muted ui-rule-step__hint">
              This action always goes to the client’s portal ({automationRecipientLabel("CLIENT")}).
            </p>
          ) : whoMode === "hidden" ? (
            <p className="ui-muted ui-rule-step__hint">Creates a task on your clinic Tasks list.</p>
          ) : (
            <Field label="Recipient">
              <Select
                value={recipient}
                onChange={(event) => setRecipient(event.target.value as AutomationRecipientChoice)}
              >
                <option value="ASSIGNED_DIETITIAN">You (clinic)</option>
                <option value="CLIENT">Client (portal)</option>
                {actionType === "SEND_IN_APP_NOTIFICATION" ? (
                  <option value="BOTH">Clinic and client</option>
                ) : null}
              </Select>
            </Field>
          )}

          {actionType === "CREATE_TASK" ? (
            <Field
              label="Task title"
              hint="Adds the client's name at the cursor."
            >
              <Input
                value={toFriendlyTemplate(taskTitle)}
                onChange={(event) => setTaskTitle(toFriendlyTemplate(event.target.value))}
                {...tokenFieldProps("taskTitle")}
              />
              <div className="ui-token-chip">
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertClientName("taskTitle", taskTitle, setTaskTitle)}
                >
                  Insert client name
                </button>
              </div>
            </Field>
          ) : actionType === "SEND_MESSAGE" ? (
            <Field
              label="Message"
              hint="Adds the client's name at the cursor."
            >
              <Textarea
                value={toFriendlyTemplate(notificationBody)}
                onChange={(event) => setNotificationBody(toFriendlyTemplate(event.target.value))}
                className="ui-automation-dialog__message"
                {...tokenFieldProps("notificationBody")}
              />
              <div className="ui-token-chip">
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertClientName("notificationBody", notificationBody, setNotificationBody)}
                >
                  Insert client name
                </button>
              </div>
            </Field>
          ) : (
            <>
              <Field label={actionType === "SEND_EMAIL" ? "Subject" : "Title"}>
                <Input
                  value={toFriendlyTemplate(notificationTitle)}
                  onChange={(event) => setNotificationTitle(toFriendlyTemplate(event.target.value))}
                />
              </Field>
              <Field
                label="Message"
                hint="Adds the client's name at the cursor."
              >
                <Textarea
                  value={toFriendlyTemplate(notificationBody)}
                  onChange={(event) => setNotificationBody(toFriendlyTemplate(event.target.value))}
                  className="ui-automation-dialog__message"
                  {...tokenFieldProps("notificationBody")}
                />
                <div className="ui-token-chip">
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertClientName("notificationBody", notificationBody, setNotificationBody)}
                  >
                    Insert client name
                  </button>
                </div>
              </Field>
            </>
          )}
        </div>
      ) : null}

      {step === "scope" ? (
        <div className="ui-rule-scope">
          <p className="ui-rule-step__label">Apply to</p>
          <div className="ui-rule-scope__options">
            <label className={`ui-rule-scope__option${clientScope === "ALL" ? " is-active" : ""}`}>
              <input type="radio" name="clientScope" checked={clientScope === "ALL"} onChange={() => setClientScope("ALL")} />
              <span>
                <strong>All clients</strong>
                <span className="ui-muted">Runs for every matching client in the clinic</span>
              </span>
            </label>
            <label className={`ui-rule-scope__option${clientScope === "SELECTED" ? " is-active" : ""}`}>
              <input
                type="radio"
                name="clientScope"
                checked={clientScope === "SELECTED"}
                onChange={() => setClientScope("SELECTED")}
              />
              <span>
                <strong>Selected clients</strong>
                <span className="ui-muted">Limit this rule to one or more people</span>
              </span>
            </label>
          </div>
          {clientScope === "SELECTED" ? (
            <div className="ui-rule-scope__picker">
              <div className="ui-rule-scope__picker-toolbar">
                <Input
                  value={clientFilter}
                  onChange={(event) => setClientFilter(event.target.value)}
                  placeholder="Search clients…"
                  aria-label="Search clients"
                />
                <span className="ui-muted ui-rule-scope__count">{selectedClientIds.length} selected</span>
              </div>
              {clients.length === 0 ? (
                <p className="ui-muted" style={{ margin: 0 }}>
                  No clients yet. Invite or create a client first.
                </p>
              ) : filteredClients.length === 0 ? (
                <p className="ui-muted" style={{ margin: 0 }}>
                  No clients match that search.
                </p>
              ) : (
                <ul className="ui-rule-scope__list">
                  {filteredClients.map((client) => (
                    <li key={client.id}>
                      <Checkbox
                        label={clientLabel(client)}
                        checked={selectedClientIds.includes(client.id)}
                        onChange={() => toggleClient(client.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {step === "review" ? (
        <div className="ui-automation-dialog__fields">
          <Field label="Rule name">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Inactive client follow-up"
            />
          </Field>
          <p className="ui-automation-dialog__preview">{preview}</p>
        </div>
      ) : null}

      <div className="ui-row ui-automation-dialog__actions">
        {stepIndex > 0 ? (
          <Button variant="ghost" disabled={saving} onClick={goBack}>
            Back
          </Button>
        ) : (
          <Button variant="ghost" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
        )}
        <span className="ui-automation-dialog__actions-spacer" />
        {step === "when" ? null : step !== "review" ? (
          <Button disabled={saving} onClick={goNext}>
            Continue
          </Button>
        ) : mode === "create" ? (
          <>
            <Button disabled={saving} variant="secondary" onClick={() => void save(false)}>
              {saving ? "Saving…" : "Save paused"}
            </Button>
            <Button disabled={saving} onClick={() => void save(true)}>
              {saving ? "Saving…" : "Save & activate"}
            </Button>
          </>
        ) : (
          <Button disabled={saving} onClick={() => void save(rule?.status === "ACTIVE")}>
            {saving ? "Saving…" : "Save"}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
