"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Alert,
  Button,
  EmptyState,
  LoadingState,
  PageHeader,
  Section,
} from "@nutrition-saas/ui";
import { api, apiUrl } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";

interface DocumentRow {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

function typeLabel(mimeType: string, filename: string): string {
  if (mimeType.includes("pdf") || filename.toLowerCase().endsWith(".pdf")) return "PDF";
  if (mimeType.startsWith("image/")) return "Image";
  if (filename.toLowerCase().endsWith(".docx")) return "Document";
  return "File";
}

export default function ClientDocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRow[] | null>(null);
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
    setError(null);
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
    <section>
      <PageHeader
        eyebrow="Library"
        title="Documents"
        description="Files shared with you by your dietitian — and anything you upload."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="ui-client-stack">
        <Section title="Upload" description="Share a file with your dietitian." tone="muted">
          <form onSubmit={(event) => void upload(event)} className="ui-client-upload">
            <input
              type="file"
              name="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,application/pdf,image/*"
              aria-label="Choose a file"
            />
            <Button type="submit" disabled={uploading}>
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </form>
        </Section>

        {documents === null ? <LoadingState>Loading documents…</LoadingState> : null}
        {documents && documents.length === 0 ? (
          <Section title="Your files">
            <EmptyState title="No documents yet">
              Shared files from your dietitian will appear here.
            </EmptyState>
          </Section>
        ) : null}
        {documents && documents.length > 0 ? (
          <Section title="Your files">
            <ul className="ui-client-doc-list">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <div>
                    <strong>{doc.filename}</strong>
                    <div className="ui-muted">
                      {typeLabel(doc.mimeType, doc.filename)} · {(doc.sizeBytes / 1024).toFixed(1)} KB ·{" "}
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <a className="ui-btn ui-btn--secondary ui-btn--sm" href={downloadUrl(doc.id)}>
                    Download
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
    </section>
  );
}
