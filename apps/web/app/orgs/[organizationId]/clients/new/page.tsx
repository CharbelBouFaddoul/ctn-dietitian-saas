"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { ApiError, api } from "../../../../../lib/api";
import { errorMessage } from "../../../../../lib/humanize-error";
import { canManageClients } from "../../../../../lib/practice-access";
import { usePractice } from "../../practice-shell";

interface Member {
  id: string;
  email: string;
  role: string;
  status: string;
}

interface Tag {
  id: string;
  name: string;
}

export default function NewClientPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const router = useRouter();
  const practice = usePractice();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [assignedMemberId, setAssignedMemberId] = useState(practice.membershipId);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canManageClients(practice.role)) {
      router.replace(`/orgs/${organizationId}/clients`);
      return;
    }
    void Promise.all([
      api<Member[]>(`/api/v1/organizations/${organizationId}/members`),
      api<Tag[]>(`/api/v1/organizations/${organizationId}/tags`),
    ]).then(([memberRows, tagRows]) => {
      setMembers(memberRows.filter((row) => row.status === "ACTIVE"));
      setTags(tagRows);
    });
  }, [organizationId, practice.role, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const created = await api<{ id: string }>(`/api/v1/organizations/${organizationId}/clients`, {
        method: "POST",
        body: JSON.stringify({
          firstName,
          lastName,
          email: email || undefined,
          phone: phone || undefined,
          status,
          assignedMemberId: assignedMemberId || undefined,
          tagIds,
        }),
      });
      try {
        await api(`/api/v1/organizations/${organizationId}/clients/${created.id}`);
        router.push(`/orgs/${organizationId}/clients/${created.id}`);
      } catch (accessErr) {
        if (accessErr instanceof ApiError && accessErr.status === 403) {
          router.push(`/orgs/${organizationId}/clients`);
          return;
        }
        throw accessErr;
      }
    } catch (err) {
      setError(errorMessage(err, "Create failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ maxWidth: 560 }}>
      <PageHeader
        eyebrow="Clients"
        title="Add a client chart"
        description="Use this for existing clients you already work with. New clients should create their own account and join using the practice code from the Clients page."
      />

      {error ? (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <Card>
        <form onSubmit={(event) => void onSubmit(event)}>
          <div className="ui-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="First name">
              <Input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                required
                autoFocus
                placeholder="Jane"
              />
            </Field>
            <Field label="Last name">
              <Input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                required
                placeholder="Smith"
              />
            </Field>
          </div>

          <Field label="Email" hint="Optional — used for notifications">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="jane@example.com"
            />
          </Field>

          <Field label="Phone" hint="Optional">
            <Input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+1 555 000 0000"
            />
          </Field>

          <Field label="Status">
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="PENDING">Pending</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </Field>

          <Field label="Assign to">
            <Select
              value={assignedMemberId}
              onChange={(event) => setAssignedMemberId(event.target.value)}
            >
              <option value="">Unassigned (owner can still access)</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.email} ({humanizeLabel(member.role)})
                </option>
              ))}
            </Select>
          </Field>

          {tags.length > 0 ? (
            <Field label="Tags">
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  padding: "8px 0",
                }}
              >
                {tags.map((tag) => {
                  const checked = tagIds.includes(tag.id);
                  return (
                    <label
                      key={tag.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 12px",
                        borderRadius: 20,
                        border: `1px solid ${checked ? "var(--color-accent)" : "var(--color-border)"}`,
                        background: checked ? "var(--color-accent-subtle, #e8f4ff)" : "transparent",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                        fontWeight: checked ? 500 : 400,
                        transition: "all 0.15s",
                      }}
                    >
                      <input
                        type="checkbox"
                        style={{ display: "none" }}
                        checked={checked}
                        onChange={(event) => {
                          setTagIds(
                            event.target.checked
                              ? [...tagIds, tag.id]
                              : tagIds.filter((id) => id !== tag.id),
                          );
                        }}
                      />
                      {tag.name}
                    </label>
                  );
                })}
              </div>
            </Field>
          ) : null}

          <div style={{ marginTop: 8 }}>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create client"}
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}
