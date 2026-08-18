"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../../../../lib/api";
import { buttonStyle, fieldStyle, inputStyle } from "../../practice-shell";

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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [assignedMemberId, setAssignedMemberId] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [invitePortal, setInvitePortal] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      api<Member[]>(`/api/v1/organizations/${organizationId}/members`),
      api<Tag[]>(`/api/v1/organizations/${organizationId}/tags`),
    ]).then(([memberRows, tagRows]) => {
      setMembers(memberRows.filter((row) => row.status === "ACTIVE"));
      setTags(tagRows);
    });
  }, [organizationId]);

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
          invitePortal,
        }),
      });
      router.push(`/orgs/${organizationId}/clients/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <section style={{ maxWidth: 520 }}>
      <h1>New client</h1>
      <p style={{ color: "var(--color-muted)" }}>
        Portal invitation is optional. Clients are not organization members.
      </p>
      <form onSubmit={(event) => void onSubmit(event)}>
        <label style={fieldStyle}>
          First name
          <input style={inputStyle} value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
        </label>
        <label style={fieldStyle}>
          Last name
          <input style={inputStyle} value={lastName} onChange={(event) => setLastName(event.target.value)} required />
        </label>
        <label style={fieldStyle}>
          Email
          <input style={inputStyle} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label style={fieldStyle}>
          Phone
          <input style={inputStyle} value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
        <label style={fieldStyle}>
          Status
          <select style={inputStyle} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="PENDING">Pending</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
        <label style={fieldStyle}>
          Assign to
          <select
            style={inputStyle}
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
        <label style={{ display: "block", marginBottom: 16 }}>
          <input
            type="checkbox"
            checked={invitePortal}
            onChange={(event) => setInvitePortal(event.target.checked)}
          />{" "}
          Create portal account and send invitation
        </label>
        <button type="submit" style={buttonStyle}>
          Create client
        </button>
      </form>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
    </section>
  );
}
