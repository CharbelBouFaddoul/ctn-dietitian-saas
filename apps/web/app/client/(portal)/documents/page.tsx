"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { api, apiUrl } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";

interface DocumentRow {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export default function ClientDocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function load() {
    setDocuments(await api<DocumentRow[]>("/api/v1/portal/documents"));
  }

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load documents")));
  }, []);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(apiUrl("/api/v1/portal/documents"), {
        method: "POST",
        body,
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      fileInput.value = "";
      await load();
    } catch (err) {
      setError(errorMessage(err, "Upload failed"));
    } finally {
      setUploading(false);
    }
  }

  function downloadUrl(id: string) {
    return apiUrl(`/api/v1/portal/documents/${id}/download`);
  }

  return (
    <div>
      <h1>Documents</h1>
      <p style={{ color: "var(--color-muted)" }}>Files shared with you by your dietitian.</p>
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
      <form onSubmit={(event) => void upload(event)} style={{ marginBottom: 20 }}>
        <input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,application/pdf,image/*" />
        <button type="submit" disabled={uploading} style={{ marginLeft: 8 }}>
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </form>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
        {documents.map((doc) => (
          <li key={doc.id} style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 12 }}>
            <strong>{doc.filename}</strong>
            <div style={{ fontSize: 13, color: "var(--color-muted)" }}>
              {(doc.sizeBytes / 1024).toFixed(1)} KB · {new Date(doc.createdAt).toLocaleDateString()}
            </div>
            <a href={downloadUrl(doc.id)} style={{ color: "var(--color-accent)" }}>
              Download
            </a>
          </li>
        ))}
      </ul>
      {documents.length === 0 ? <p style={{ color: "var(--color-muted)" }}>No shared documents yet.</p> : null}
      <p style={{ marginTop: 16 }}>
        <Link href="/client">Back home</Link>
      </p>
    </div>
  );
}
