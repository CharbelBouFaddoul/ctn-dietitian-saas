"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
    }
  }

  return (
    <section style={{ maxWidth: 520 }}>
      <h1>New client</h1>
      <p style={{ color: "var(--color-muted)" }}>
        Add a chart yourself when you already work with this person. New clients should create their own account, then
        enter the practice join code from the Clients page.
      </p>
      <form onSubmit={(event) => void onSubmit(event)}>
        <label className="ui-field">
          First name
          <input className="ui-input" value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
        </label>
        <label className="ui-field">
          Last name
          <input className="ui-input" value={lastName} onChange={(event) => setLastName(event.target.value)} required />
        </label>
        <label className="ui-field">
          Email
          <input className="ui-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="ui-field">
          Phone
          <input className="ui-input" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
        <label className="ui-field">
          Status
          <select className="ui-input" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="PENDING">Pending</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
        <label className="ui-field">
          Assign to
          <select
            className="ui-input"
            value={assignedMemberId}
            onChange={(event) => setAssignedMemberId(event.target.value)}
          >
            <option value="">Unassigned (OWNER can still access)</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.email} ({member.role})
              </option>
            ))}
          </select>
        </label>
        <fieldset style={{ border: "1px solid var(--color-border)", borderRadius: 8, marginBottom: 12 }}>
          <legend>Tags</legend>
          {tags.map((tag) => (
            <label key={tag.id} style={{ display: "block", marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={tagIds.includes(tag.id)}
                onChange={(event) => {
                  setTagIds(
                    event.target.checked ? [...tagIds, tag.id] : tagIds.filter((id) => id !== tag.id),
                  );
                }}
              />{" "}
              {tag.name}
            </label>
          ))}
          {tags.length === 0 ? <p>No tags yet.</p> : null}
        </fieldset>
        <button type="submit" className="ui-btn ui-btn--primary">
          Create client
        </button>
      </form>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
    </section>
  );
}
