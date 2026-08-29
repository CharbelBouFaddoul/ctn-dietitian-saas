"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Dialog, EmptyState, Field, Input, LoadingState } from "@nutrition-saas/ui";
import { api } from "../lib/api";
import { errorMessage } from "../lib/humanize-error";
import { ClientMealPlanWorkspace, type MealPlanView } from "./client-meal-plan-workspace";

type PlanRow = {
  id: string;
  name: string;
  status: string;
};

type Props = {
  dietitianAccountId: string;
  clientId: string;
  clientName: string;
  allowManage: boolean;
  initialPlanId?: string | null;
  initialView?: MealPlanView;
  hideViewToggle?: boolean;
  onPlanChange?: (planId: string) => void;
  onViewChange?: (view: MealPlanView) => void;
  onError: (message: string) => void;
};

export function ClientNutritionPanel({
  dietitianAccountId,
  clientId,
  clientName,
  allowManage,
  initialPlanId,
  initialView = "plan",
  hideViewToggle = false,
  onPlanChange,
  onViewChange,
  onError,
}: Props) {
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [planId, setPlanId] = useState(initialPlanId ?? "");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [weekCount, setWeekCount] = useState("1");
  const [daysPerWeek, setDaysPerWeek] = useState("7");
  const [dayLabelMode, setDayLabelMode] = useState<"NUMBERED" | "WEEKDAY">("WEEKDAY");

  const orgBase = `/api/v1/dietitian/${dietitianAccountId}`;
  const allPlansHref = `/practice/${dietitianAccountId}/meal-plans?clientId=${encodeURIComponent(clientId)}`;

  async function loadPlans(preferId?: string) {
    const rows = await api<{ items: PlanRow[] }>(`${orgBase}/meal-plans?clientId=${encodeURIComponent(clientId)}`);
    const items = rows.items.filter((row) => row.status !== "ARCHIVED");
    setPlans(items);
    const next =
      (preferId && items.some((p) => p.id === preferId) ? preferId : null) ??
      (planId && items.some((p) => p.id === planId) ? planId : null) ??
      (initialPlanId && items.some((p) => p.id === initialPlanId) ? initialPlanId : null) ??
      items.find((p) => p.status === "ACTIVE")?.id ??
      items[0]?.id ??
      "";
    setPlanId(next);
    if (next) onPlanChange?.(next);
  }

  useEffect(() => {
    void loadPlans().catch((err) => onError(errorMessage(err, "Unable to load meal plans")));
  }, [dietitianAccountId, clientId]);

  useEffect(() => {
    if (initialPlanId && initialPlanId !== planId) {
      setPlanId(initialPlanId);
    }
  }, [initialPlanId]);

  function openCreate() {
    setNewName(`${clientName} meal plan`);
    setWeekCount("1");
    setDaysPerWeek("7");
    setDayLabelMode("WEEKDAY");
    setShowCreate(true);
  }

  function selectPlan(id: string) {
    setPlanId(id);
    onPlanChange?.(id);
  }

  async function createPlan(event?: FormEvent) {
    event?.preventDefault();
    setCreating(true);
    try {
      const weeks = Math.min(12, Math.max(1, Number(weekCount) || 1));
      const days = Math.min(7, Math.max(1, Number(daysPerWeek) || 7));
      const created = await api<{ id: string }>(`${orgBase}/meal-plans`, {
        method: "POST",
        body: JSON.stringify({
          clientId,
          name: newName.trim() || `${clientName} meal plan`,
          dayLabelMode,
          weekCount: weeks,
          daysPerWeek: days,
        }),
      });
      setShowCreate(false);
      await loadPlans(created.id);
      onPlanChange?.(created.id);
    } catch (err) {
      onError(errorMessage(err, "Could not create meal plan"));
    } finally {
      setCreating(false);
    }
  }

  if (!plans) {
    return <LoadingState>Loading nutrition…</LoadingState>;
  }

  return (
    <div className="ui-mp-host">
      {planId ? (
        <ClientMealPlanWorkspace
          key={planId}
          dietitianAccountId={dietitianAccountId}
          planId={planId}
          clientId={clientId}
          compact
          allowManage={allowManage}
          initialView={initialView}
          hideViewToggle={hideViewToggle}
          plans={plans}
          allPlansHref={allPlansHref}
          onViewChange={onViewChange}
          onArchived={() => void loadPlans()}
          onCreateRequest={allowManage ? openCreate : undefined}
          onSelectPlan={selectPlan}
        />
      ) : (
        <div className="ui-mp">
          <header className="ui-mp__top">
            <div className="ui-mp__identity">
              <h2 className="ui-mp__title">Meal plan</h2>
            </div>
            {allowManage ? (
              <div className="ui-mp__toolbar">
                <button type="button" className="ui-mp__icon-btn" aria-label="New meal plan" onClick={openCreate}>
                  +
                </button>
              </div>
            ) : null}
          </header>
          <EmptyState
            title="No meal plan yet"
            action={
              allowManage ? (
                <Button onClick={openCreate} disabled={creating}>
                  Create meal plan
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      <Dialog open={showCreate} title="New meal plan" onClose={() => setShowCreate(false)}>
        <form className="ui-stack" style={{ gap: 14, width: "100%" }} onSubmit={(e) => void createPlan(e)}>
          <Field label="Title">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} required autoFocus />
          </Field>
          <div>
            <p className="ui-mp__settings-label">Day labels</p>
            <div className="ui-mp__choice">
              <button
                type="button"
                className={dayLabelMode === "WEEKDAY" ? "is-active" : undefined}
                onClick={() => setDayLabelMode("WEEKDAY")}
              >
                <strong>Weekdays</strong>
                <span>Monday – Sunday</span>
              </button>
              <button
                type="button"
                className={dayLabelMode === "NUMBERED" ? "is-active" : undefined}
                onClick={() => setDayLabelMode("NUMBERED")}
              >
                <strong>Numbered</strong>
                <span>Day 1 – Day 7</span>
              </button>
            </div>
          </div>
          <div className="ui-grid">
            <Field label="Weeks" hint="1–12">
              <Input
                type="number"
                min={1}
                max={12}
                value={weekCount}
                onChange={(e) => setWeekCount(e.target.value)}
              />
            </Field>
            <Field label="Days per week" hint="1–7">
              <Input
                type="number"
                min={1}
                max={7}
                value={daysPerWeek}
                onChange={(e) => setDaysPerWeek(e.target.value)}
              />
            </Field>
          </div>
          <div className="ui-row" style={{ justifyContent: "flex-end", gap: 10 }}>
            <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create plan"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
