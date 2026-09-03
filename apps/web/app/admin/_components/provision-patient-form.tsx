"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Field, Input, Select } from "@nutrition-saas/ui";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";
import { DietitianSearchSelect } from "./dietitian-search-select";

export function ProvisionPatientForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedClinicId = searchParams.get("dietitianAccountId") ?? "";
  const [patientDietitianId, setPatientDietitianId] = useState(preselectedClinicId);
  const [patientFirstName, setPatientFirstName] = useState("");
  const [patientLastName, setPatientLastName] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientDob, setPatientDob] = useState("");
  const [patientSex, setPatientSex] = useState("");
  const [patientActivity, setPatientActivity] = useState("");
  const [patientHeight, setPatientHeight] = useState("");
  const [patientWeight, setPatientWeight] = useState("");
  const [inviteToPortal, setInviteToPortal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const heightCm = patientHeight.trim() ? Number(patientHeight) : undefined;
      const weightKg = patientWeight.trim() ? Number(patientWeight) : undefined;
      await api("/api/v1/admin/patients", {
        method: "POST",
        body: JSON.stringify({
          dietitianAccountId: patientDietitianId,
          firstName: patientFirstName,
          lastName: patientLastName,
          email: patientEmail || undefined,
          phone: patientPhone || undefined,
          dateOfBirth: patientDob || undefined,
          sex: patientSex || undefined,
          activityLevel: patientActivity || undefined,
          heightCm: Number.isFinite(heightCm) ? heightCm : undefined,
          weightKg: Number.isFinite(weightKg) ? weightKg : undefined,
          inviteToPortal: patientEmail ? inviteToPortal : false,
        }),
      });
      router.push(
        patientDietitianId
          ? `/admin/dietitians/${patientDietitianId}?tab=patients`
          : "/admin/users",
      );
    } catch (err) {
      setError(errorMessage(err, "Unable to add patient"));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="ui-stack" style={{ maxWidth: 480 }}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Clinic">
        <DietitianSearchSelect value={patientDietitianId} onChange={setPatientDietitianId} required />
      </Field>
      <Field label="First name">
        <Input value={patientFirstName} onChange={(event) => setPatientFirstName(event.target.value)} required />
      </Field>
      <Field label="Last name">
        <Input value={patientLastName} onChange={(event) => setPatientLastName(event.target.value)} required />
      </Field>
      <Field label="Email (optional)">
        <Input
          type="email"
          value={patientEmail}
          onChange={(event) => {
            const next = event.target.value;
            setPatientEmail(next);
            setInviteToPortal(Boolean(next.trim()));
          }}
        />
      </Field>
      <Field label="Phone (optional)">
        <Input value={patientPhone} onChange={(event) => setPatientPhone(event.target.value)} />
      </Field>
      <Field label="Date of birth (optional)">
        <Input type="date" value={patientDob} onChange={(event) => setPatientDob(event.target.value)} />
      </Field>
      <Field label="Sex (optional)">
        <Select value={patientSex} onChange={(event) => setPatientSex(event.target.value)}>
          <option value="">Unspecified</option>
          <option value="FEMALE">Female</option>
          <option value="MALE">Male</option>
          <option value="OTHER">Other</option>
          <option value="UNSPECIFIED">Unspecified</option>
        </Select>
      </Field>
      <Field label="Activity level (optional)">
        <Input
          value={patientActivity}
          onChange={(event) => setPatientActivity(event.target.value)}
          placeholder="Stored as profile lifestyle"
        />
      </Field>
      <Field label="Height cm (optional)">
        <Input
          type="number"
          min={0}
          step="0.1"
          value={patientHeight}
          onChange={(event) => setPatientHeight(event.target.value)}
        />
      </Field>
      <Field label="Weight kg (optional)">
        <Input
          type="number"
          min={0}
          step="0.1"
          value={patientWeight}
          onChange={(event) => setPatientWeight(event.target.value)}
        />
      </Field>
      <label className="ui-stack" style={{ gap: 6 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={inviteToPortal}
            disabled={!patientEmail.trim()}
            onChange={(event) => setInviteToPortal(event.target.checked)}
          />
          Invite to portal (requires email; on by default when email is set)
        </span>
      </label>
      <Button type="submit" disabled={busy || !patientDietitianId}>
        {busy ? "Creating…" : "Add patient"}
      </Button>
    </form>
  );
}
