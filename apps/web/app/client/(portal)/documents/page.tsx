"use client";

import { useEffect, useState } from "react";
import { Alert } from "@nutrition-saas/ui";
import { DocumentsLibrary, type DocumentsLibraryItem } from "../../../../components/documents-library";
import { api, apiUrl } from "../../../../lib/api";
import { downloadAuthenticatedFile } from "../../../../lib/documents";
import { errorMessage } from "../../../../lib/humanize-error";

export default function ClientDocumentsPage() {
  const [documents, setDocuments] = useState<DocumentsLibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setDocuments(await api<DocumentsLibraryItem[]>("/api/v1/portal/documents"));
  }

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load documents")));
  }, []);

  return (
    <section className="ui-client-stack">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <DocumentsLibrary
        variant="portal"
        pageHeader
        documents={documents}
        uploading={uploading}
        downloadingId={downloadingId}
        deletingId={deletingId}
        onUpload={async (file) => {
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
              throw new Error(response.status === 413 ? "File exceeds the 20 MB limit" : "Upload failed");
            }
            await load();
          } catch (err) {
            setError(errorMessage(err, "Upload failed"));
            throw err;
          } finally {
            setUploading(false);
          }
        }}
        onDownload={async (doc) => {
          setDownloadingId(doc.id);
          setError(null);
          try {
            await downloadAuthenticatedFile(
              apiUrl(`/api/v1/portal/documents/${doc.id}/download`),
              doc.filename,
            );
          } catch (err) {
            setError(errorMessage(err, "Unable to download document"));
          } finally {
            setDownloadingId(null);
          }
        }}
        onDelete={async (doc) => {
          setDeletingId(doc.id);
          setError(null);
          try {
            await api(`/api/v1/portal/documents/${doc.id}/archive`, { method: "POST" });
            await load();
          } catch (err) {
            setError(errorMessage(err, "Unable to delete document"));
          } finally {
            setDeletingId(null);
          }
        }}
      />
    </section>
  );
}
