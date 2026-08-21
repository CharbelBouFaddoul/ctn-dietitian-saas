"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Section,
  Select,
  Tabs,
} from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { DietitianSearchSelect } from "../../_components/dietitian-search-select";

interface PlanRow {
  id: string;
  name: string;
  slug: string;
  status: string;
}

type ProvisionTab = "dietitian" | "patient";

function AddUserForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("type") === "patient" ? "patient" : "dietitian";
  const [tab, setTab] = useState<ProvisionTab>(initialTab);
  const [error, setError] = useState<string | null>(null);

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
  const [dietitianBusy, setDietitianBusy] = useState(false);

  const [patientDietitianId, setPatientDietitianId] = useState("");
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
  const [patientBusy, setPatientBusy] = useState(false);

  useEffect(() => {
    void api<PlanRow[]>("/api/v1/admin/plans")
      .then((list) => setPlans(list.filter((plan) => plan.status === "ACTIVE")))
      .catch(() => setPlans([]));
  }, []);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  async function onProvisionDietitian(event: FormEvent) {
    event.preventDefault();
    setDietitianBusy(true);
    setError(null);
    try {
      const limit = clientLimit.trim() ? Number(clientLimit) : undefined;
      await api("/api/v1/admin/dietitians", {
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
      router.push("/admin/users");
    } catch (err) {
      setError(errorMessage(err, "Unable to provision dietitian"));
      setDietitianBusy(false);
    }
  }

  async function onProvisionPatient(event: FormEvent) {
    event.preventDefault();
    setPatientBusy(true);
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
      router.push("/admin/users");
    } catch (err) {
      setError(errorMessage(err, "Unable to provision patient"));
      setPatientBusy(false);
    }
  }

  return (
    <section>
      <PageHeader
        eyebrow="Platform"
        title="Add user"
        description="Provision a dietitian practice account or a patient chart under an existing practice."
        actions={
          <Link href="/admin/users" className="ui-btn ui-btn--secondary ui-btn--sm">
            Back to users
          </Link>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Tabs
        items={[
          { id: "dietitian", label: "Dietitian" },
          { id: "patient", label: "Patient" },
        ]}
        value={tab}
        onChange={(id) => setTab(id as ProvisionTab)}
      />

      <div style={{ marginTop: 16 }}>
        {tab === "dietitian" ? (
          <Section title="Provision dietitian">
            <form
              onSubmit={(event) => void onProvisionDietitian(event)}
              className="ui-stack"
              style={{ maxWidth: 480 }}
            >
              <Field label="Email">
                <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </Field>
              <Field label="Practice name">
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
                <Input
                  value={professionalTitle}
                  onChange={(event) => setProfessionalTitle(event.target.value)}
                />
              </Field>
              <Field label="Specialization (optional)">
                <Input
                  value={specialization}
                  onChange={(event) => setSpecialization(event.target.value)}
                />
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
              <Button type="submit" disabled={dietitianBusy}>
                {dietitianBusy ? "Provisioning…" : "Provision dietitian"}
              </Button>
            </form>
          </Section>
        ) : (
          <Section title="Provision patient">
            <form
              onSubmit={(event) => void onProvisionPatient(event)}
              className="ui-stack"
              style={{ maxWidth: 480 }}
            >
              <Field label="Dietitian practice">
                <DietitianSearchSelect
                  value={patientDietitianId}
                  onChange={setPatientDietitianId}
                  required
                />
              </Field>
              <Field label="First name">
                <Input
                  value={patientFirstName}
                  onChange={(event) => setPatientFirstName(event.target.value)}
                  required
                />
              </Field>
              <Field label="Last name">
                <Input
                  value={patientLastName}
                  onChange={(event) => setPatientLastName(event.target.value)}
                  required
                />
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
                <Input
                  type="date"
                  value={patientDob}
                  onChange={(event) => setPatientDob(event.target.value)}
                />
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
              <Button type="submit" disabled={patientBusy || !patientDietitianId}>
                {patientBusy ? "Provisioning…" : "Provision patient"}
              </Button>
            </form>
          </Section>
        )}
      </div>
    </section>
  );
}

export default function AdminAddUserPage() {
  return (
    <Suspense fallback={<LoadingState>Loading…</LoadingState>}>
      <AddUserForm />
    </Suspense>
  );
}
