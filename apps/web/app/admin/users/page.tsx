"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Section,
  Select,
  StatusBadge,
  Table,
  Td,
} from "@nutrition-saas/ui";
import { roleLabel, statusLabel } from "../../../lib/admin-labels";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";

interface UserRow {
  id: string;
  email: string;
  status: string;
  platformRole: string | null;
}

interface PlanRow {
  id: string;
  name: string;
  slug: string;
  status: string;
}

interface DietitianRow {
  id: string;
  name: string;
  status: string;
}

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [dietitians, setDietitians] = useState<DietitianRow[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [professionalTitle, setProfessionalTitle] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [clientLimit, setClientLimit] = useState("");
  const [planId, setPlanId] = useState("");
  const [provisionBusy, setProvisionBusy] = useState(false);

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

  async function load(search = q) {
    try {
      const path = search ? `/api/v1/admin/users?q=${encodeURIComponent(search)}` : "/api/v1/admin/users";
      setRows(await api<UserRow[]>(path));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to load users"));
    }
  }

  async function loadDietitians() {
    try {
      const list = await api<DietitianRow[]>("/api/v1/admin/dietitians");
      setDietitians(list.filter((row) => row.status === "ACTIVE"));
    } catch {
      setDietitians([]);
    }
  }

  useEffect(() => {
    void load("");
    void loadDietitians();
    void api<PlanRow[]>("/api/v1/admin/plans")
      .then((list) => setPlans(list.filter((plan) => plan.status === "ACTIVE")))
      .catch(() => setPlans([]));
  }, []);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    void load(q);
  }

  async function onProvision(event: FormEvent) {
    event.preventDefault();
    setProvisionBusy(true);
    setError(null);
    setMessage(null);
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
      setMessage(`Provisioned ${email}. Activation email sent.`);
      setEmail("");
      setDisplayName("");
      setFirstName("");
      setLastName("");
      setPhone("");
      setProfessionalTitle("");
      setSpecialization("");
      setClientLimit("");
      setPlanId("");
      await load(q);
      await loadDietitians();
    } catch (err) {
      setError(errorMessage(err, "Unable to provision dietitian"));
    } finally {
      setProvisionBusy(false);
    }
  }

  async function onProvisionPatient(event: FormEvent) {
    event.preventDefault();
    setPatientBusy(true);
    setError(null);
    setMessage(null);
    try {
      const heightCm = patientHeight.trim() ? Number(patientHeight) : undefined;
      const weightKg = patientWeight.trim() ? Number(patientWeight) : undefined;
      const result = await api<{ invitationSent: boolean; client: { email: string | null } }>(
        "/api/v1/admin/patients",
        {
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
        },
      );
      setMessage(
        result.invitationSent
          ? `Patient provisioned for ${result.client.email}. Portal invite sent.`
          : "Patient chart created (no portal invite).",
      );
      setPatientFirstName("");
      setPatientLastName("");
      setPatientEmail("");
      setPatientPhone("");
      setPatientDob("");
      setPatientSex("");
      setPatientActivity("");
      setPatientHeight("");
      setPatientWeight("");
      setInviteToPortal(false);
    } catch (err) {
      setError(errorMessage(err, "Unable to provision patient"));
    } finally {
      setPatientBusy(false);
    }
  }

  return (
    <section>
      <PageHeader
        eyebrow="Platform"
        title="Users"
        description="Platform accounts and roles across the SaaS."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      <Section title="Provision dietitian">
        <form onSubmit={(event) => void onProvision(event)} className="ui-stack" style={{ maxWidth: 480 }}>
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
          <Button type="submit" disabled={provisionBusy}>
            {provisionBusy ? "Provisioning…" : "Provision dietitian"}
          </Button>
        </form>
      </Section>

      <Section title="Provision patient">
        <form
          onSubmit={(event) => void onProvisionPatient(event)}
          className="ui-stack"
          style={{ maxWidth: 480 }}
        >
          <Field label="Dietitian practice">
            <Select
              value={patientDietitianId}
              onChange={(event) => setPatientDietitianId(event.target.value)}
              required
            >
              <option value="">Select practice</option>
              {dietitians.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </Select>
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

      <Section title="All users">
        <form onSubmit={onSearch} className="ui-admin-toolbar">
          <Field label="Search">
            <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Email" />
          </Field>
          <Button type="submit">Search</Button>
        </form>

        {rows === null ? <LoadingState>Loading users…</LoadingState> : null}
        {rows && rows.length === 0 ? <EmptyState title="No users found">Try another email search.</EmptyState> : null}
        {rows && rows.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Status</th>
                <th>Platform role</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td>
                    <Link href={`/admin/users/${row.id}`} className="ui-link">
                      {row.email}
                    </Link>
                  </Td>
                  <Td>
                    <StatusBadge status={row.status} label={statusLabel(row.status)} />
                  </Td>
                  <Td>{roleLabel(row.platformRole)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Section>
    </section>
  );
}
