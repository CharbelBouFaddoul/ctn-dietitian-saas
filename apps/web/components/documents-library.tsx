"use client";

import { FormEvent, useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  Badge,
  Button,
  EmptyState,
  humanizeLabel,
  LoadingState,
  PageHeader,
  Section,
  Select,
} from "@nutrition-saas/ui";
import {
  assertDocumentFileSize,
  DOCUMENT_ACCEPT,
  DOCUMENT_UPLOAD_HINT,
  documentTypeLabel,
  formatDocumentSize,
} from "../lib/documents";

export type DocumentsLibraryItem = {
  id: string;
  filename: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt?: string;
  visibility?: string;
};

type Visibility = "INTERNAL" | "SHARED";

type DocumentsLibraryProps = {
  variant: "portal" | "clinic";
  documents: DocumentsLibraryItem[] | null;
  uploading?: boolean;
  downloadingId?: string | null;
  onUpload: (file: File, visibility: Visibility) => Promise<void>;
  onDownload: (doc: DocumentsLibraryItem) => Promise<void>;
  /** Portal uses a page header; clinic embeds under chart tabs. */
  pageHeader?: boolean;
};

function FileTypeIcon({ label }: { label: string }) {
  const tone =
    label === "PDF" ? "pdf" : label === "Image" ? "image" : label === "DOC" ? "doc" : "file";
  return (
    <span className={`ui-docs-icon ui-docs-icon--${tone}`} aria-hidden>
      {label === "Image" ? "IMG" : label}
    </span>
  );
}

function documentMeta(doc: DocumentsLibraryItem): string {
  const parts = [
    documentTypeLabel(doc.mimeType, doc.filename),
    formatDocumentSize(doc.sizeBytes),
    doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

function UploadPanel({
  variant,
  uploading,
  onCancel,
  onUpload,
}: {
  variant: "portal" | "clinic";
  uploading: boolean;
  onCancel: () => void;
  onUpload: (file: File, visibility: Visibility) => Promise<void>;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [visibility, setVisibility] = useState<Visibility>("INTERNAL");
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function pickFile(next: File | null) {
    setLocalError(null);
    if (!next) {
      setFile(null);
      return;
    }
    try {
      assertDocumentFileSize(next);
      setFile(next);
    } catch (err) {
      setFile(null);
      setLocalError(err instanceof Error ? err.message : "File is too large");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragOver(false);
    const dropped = event.dataTransfer.files?.[0] ?? null;
    pickFile(dropped);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setLocalError("Choose a file to upload");
      return;
    }
    setLocalError(null);
    await onUpload(file, visibility);
  }

  return (
    <form className="ui-docs-upload" onSubmit={(event) => void submit(event)}>
      <label
        htmlFor={inputId}
        className={`ui-docs-dropzone${dragOver ? " is-dragover" : ""}${file ? " has-file" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragOver(false);
        }}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          name="file"
          accept={DOCUMENT_ACCEPT}
          className="ui-docs-dropzone__input"
          onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
        />
        <span className="ui-docs-dropzone__title">
          {file ? file.name : "Drop a file here, or click to browse"}
        </span>
        <span className="ui-docs-dropzone__hint">{DOCUMENT_UPLOAD_HINT}</span>
      </label>

      <div className="ui-docs-upload__footer">
        {variant === "clinic" ? (
          <Select
            name="visibility"
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as Visibility)}
            aria-label="Document visibility"
            style={{ width: "auto", minWidth: "11rem" }}
          >
            <option value="INTERNAL">Internal only</option>
            <option value="SHARED">Shared with client</option>
          </Select>
        ) : (
          <p className="ui-muted ui-docs-upload__note">Shared with your dietitian when uploaded.</p>
        )}
        <div className="ui-row">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={uploading}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={uploading || !file}>
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </div>
      {localError ? <p className="ui-docs-upload__error">{localError}</p> : null}
    </form>
  );
}

export function DocumentsLibrary({
  variant,
  documents,
  uploading = false,
  downloadingId = null,
  onUpload,
  onDownload,
  pageHeader = false,
}: DocumentsLibraryProps) {
  const [showUpload, setShowUpload] = useState(false);

  async function handleUpload(file: File, visibility: Visibility) {
    try {
      await onUpload(file, visibility);
      setShowUpload(false);
    } catch {
      /* Parent surfaces the error alert; keep the upload panel open. */
    }
  }

  const uploadButton = (
    <Button
      type="button"
      size="sm"
      variant={showUpload ? "secondary" : "primary"}
      onClick={() => setShowUpload((open) => !open)}
    >
      {showUpload ? "Close" : "Upload"}
    </Button>
  );

  const header: ReactNode = pageHeader ? (
    <PageHeader
      eyebrow="Library"
      title="Documents"
      description="Files shared with you by your dietitian — and anything you upload."
      actions={uploadButton}
    />
  ) : (
    <div className="ui-docs-toolbar">
      <div>
        <h2 className="ui-docs-toolbar__title">Documents</h2>
        <p className="ui-muted ui-docs-toolbar__desc">
          Upload internal notes or share files with this client.
        </p>
      </div>
      {uploadButton}
    </div>
  );

  const uploadBlock = showUpload ? (
    <Section tone="mint" className="ui-docs-upload-section">
      <UploadPanel
        variant={variant}
        uploading={uploading}
        onCancel={() => setShowUpload(false)}
        onUpload={handleUpload}
      />
    </Section>
  ) : null;

  let body: ReactNode;
  if (documents === null) {
    body = <LoadingState>Loading documents…</LoadingState>;
  } else if (documents.length === 0) {
    body = (
      <Section title={variant === "portal" ? "Your files" : "All documents"} tone="muted">
        <EmptyState
          title="No documents yet"
          action={
            !showUpload ? (
              <Button type="button" size="sm" onClick={() => setShowUpload(true)}>
                Upload a file
              </Button>
            ) : undefined
          }
        >
          {variant === "portal"
            ? "Shared files from your dietitian will appear here."
            : "Upload a file to keep it on this client chart."}
        </EmptyState>
      </Section>
    );
  } else {
    body = (
      <Section
        title={variant === "portal" ? "Your files" : "All documents"}
        description={`${documents.length} file${documents.length === 1 ? "" : "s"}`}
      >
        <ul className="ui-docs-list">
          {documents.map((doc) => {
            const type = documentTypeLabel(doc.mimeType, doc.filename);
            return (
              <li key={doc.id}>
                <div className="ui-docs-list__main">
                  <FileTypeIcon label={type} />
                  <div className="ui-docs-list__text">
                    <span className="ui-docs-list__name">{doc.filename}</span>
                    <span className="ui-muted ui-docs-list__meta">{documentMeta(doc)}</span>
                  </div>
                </div>
                <div className="ui-docs-list__actions">
                  {variant === "clinic" && doc.visibility ? (
                    <Badge tone={doc.visibility === "SHARED" ? "info" : "neutral"}>
                      {humanizeLabel(doc.visibility)}
                    </Badge>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={downloadingId === doc.id}
                    onClick={() => void onDownload(doc)}
                  >
                    {downloadingId === doc.id ? "Downloading…" : "Download"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
    );
  }

  return (
    <div className="ui-docs">
      {header}
      {uploadBlock}
      {body}
    </div>
  );
}
