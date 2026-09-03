"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input, Select } from "@nutrition-saas/ui";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";

interface PlanRow {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export function ProvisionClinicForm({
  submitLabel = "Create clinic",
}: {
  submitLabel?: string;
}) {
  const router = useRouter();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [professionalTitle, setProfessionalTitle] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [clientLimit, setClientLimit] = useState("");
  const [planId, setPlanId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<PlanRow[]>("/api/v1/admin/plans")
      .then((list) => setPlans(list.filter((plan) => plan.status === "ACTIVE")))
      .catch(() => setPlans([]));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const limit = clientLimit.trim() ? Number(clientLimit) : undefined;
      const result = await api<{ dietitianAccount: { id: string } }>("/api/v1/admin/dietitians", {
        method: "POST",
        body: JSON.stringify({
          email,
          displayName,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          phone: phone || undefined,
          professionalTitle: professionalTitle || undefined,
          specialization: specialization || undefined,
          planId: planId || undefined,
          clientLimit: Number.isFinite(limit) ? limit : undefined,
        }),
      });
      router.push(`/admin/dietitians/${result.dietitianAccount.id}`);
    } catch (err) {
      setError(errorMessage(err, "Unable to create clinic"));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="ui-stack" style={{ maxWidth: 480 }}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Owner email">
        <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </Field>
      <Field label="Clinic name">
        <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
      </Field>
      <Field label="First name">
        <Input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
      </Field>
      <Field label="Last name">
        <Input value={lastName} onChange={(event) => setLastName(event.target.value)} />
      </Field>
      <Field label="Phone (optional)">
        <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
      </Field>
      <Field label="Professional title (optional)">
        <Input value={professionalTitle} onChange={(event) => setProfessionalTitle(event.target.value)} />
      </Field>
      <Field label="Specialization (optional)">
        <Input value={specialization} onChange={(event) => setSpecialization(event.target.value)} />
      </Field>
      <Field label="Plan (optional)">
        <Select value={planId} onChange={(event) => setPlanId(event.target.value)}>
          <option value="">No subscription yet</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Client limit override (optional)">
        <Input
          type="number"
          min={0}
          value={clientLimit}
          onChange={(event) => setClientLimit(event.target.value)}
          placeholder="Uses plan limit when empty"
        />
      </Field>
      <Button type="submit" disabled={busy}>
        {busy ? "Creating…" : submitLabel}
      </Button>
    </form>
  );
}
