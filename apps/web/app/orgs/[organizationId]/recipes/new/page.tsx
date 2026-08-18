"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../../../../lib/api";
import { buttonStyle, fieldStyle, inputStyle } from "../../practice-shell";

export default function NewRecipePage() {
  const params = useParams<{ organizationId: string }>();
  const router = useRouter();
  const [name, setName] = useState("");
  const [servings, setServings] = useState("1");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const created = await api<{ id: string }>(`/api/v1/organizations/${params.organizationId}/recipes`, {
      method: "POST",
      body: JSON.stringify({ name, servings: Number(servings), description: description || null }),
    });
    router.push(`/orgs/${params.organizationId}/recipes/${created.id}`);
  }

  return (
    <section>
      <h1>New recipe</h1>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
      <form onSubmit={(event) => void onSubmit(event).catch((err) => setError(err instanceof Error ? err.message : "Save failed"))}>
        <label style={fieldStyle}>
          Name
          <input style={inputStyle} value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label style={fieldStyle}>
          Servings
          <input style={inputStyle} value={servings} onChange={(event) => setServings(event.target.value)} />
        </label>
        <label style={fieldStyle}>
          Description
          <textarea style={inputStyle} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <button type="submit" style={buttonStyle}>
          Create
        </button>
      </form>
    </section>
  );
}
