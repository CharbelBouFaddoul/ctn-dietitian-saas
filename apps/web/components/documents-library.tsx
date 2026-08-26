"use client";

import { FormEvent, useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  Badge,
  Button,
  ConfirmDialog,
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
  deletingId?: string | null;
  onUpload: (file: File, visibility: Visibility) => Promise<void>;
  onDownload: (doc: DocumentsLibraryItem) => Promise<void>;
  onDelete?: (doc: DocumentsLibraryItem) => Promise<void>;
  /** Portal uses a page header; clinic embeds under chart tabs. */
  pageHeader?: boolean;
  accept?: string;
  uploadHint?: string;
  assertFile?: (file: File) => void;
  title?: string;
  description?: string;
  compact?: boolean;
  hideUpload?: boolean;
  hideToolbar?: boolean;
  startOpen?: boolean;
  uploadOnly?: boolean;
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
  accept,
  uploadHint,
  assertFile,
  hideCancel = false,
}: {
  variant: "portal" | "clinic";
  uploading: boolean;
  onCancel: () => void;
  onUpload: (file: File, visibility: Visibility) => Promise<void>;
  accept: string;
  uploadHint: string;
  assertFile: (file: File) => void;
  hideCancel?: boolean;
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
      assertFile(next);
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
          accept={accept}
          className="ui-docs-dropzone__input"
          onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
        />
        <span className="ui-docs-dropzone__title">
          {file ? file.name : "Drop a file here, or click to browse"}
        </span>
        <span className="ui-docs-dropzone__hint">{uploadHint}</span>
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
          {hideCancel ? null : (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={uploading}>
              Cancel
            </Button>
          )}
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
  deletingId = null,
  onUpload,
  onDownload,
  onDelete,
  pageHeader = false,
  accept = DOCUMENT_ACCEPT,
  uploadHint = DOCUMENT_UPLOAD_HINT,
  assertFile = assertDocumentFileSize,
  title = "Documents",
  description = "Upload internal notes or share files with this client.",
  compact = false,
  hideUpload = false,
  hideToolbar = false,
  startOpen = false,
  uploadOnly = false,
}: DocumentsLibraryProps) {
  const [showUpload, setShowUpload] = useState(startOpen || uploadOnly);
  const [pendingDelete, setPendingDelete] = useState<DocumentsLibraryItem | null>(null);

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

  const header: ReactNode =
    hideToolbar || hideUpload || uploadOnly ? null : pageHeader ? (
    <PageHeader
      eyebrow="Library"
      title="Documents"
      description="Files shared with you by your dietitian — and anything you upload."
      actions={uploadButton}
    />
  ) : compact ? (
    <div className="ui-docs-toolbar ui-docs-toolbar--compact">{uploadButton}</div>
  ) : (
    <div className="ui-docs-toolbar">
      <div>
        <h2 className="ui-docs-toolbar__title">{title}</h2>
        <p className="ui-muted ui-docs-toolbar__desc">{description}</p>
      </div>
      {uploadButton}
    </div>
  );

  const uploadBlock = showUpload || uploadOnly ? (
    <Section tone="mint" className="ui-docs-upload-section">
      <UploadPanel
        variant={variant}
        uploading={uploading}
        onCancel={() => {
          if (!uploadOnly) setShowUpload(false);
        }}
        onUpload={handleUpload}
        accept={accept}
        uploadHint={uploadHint}
        assertFile={assertFile}
        hideCancel={uploadOnly}
      />
    </Section>
  ) : null;

  if (uploadOnly) {
    return <div className="ui-docs">{uploadBlock}</div>;
  }

  let body: ReactNode;
  if (documents === null) {
    body = <LoadingState>Loading documents…</LoadingState>;
  } else if (documents.length === 0) {
    body = (
      <Section title={variant === "portal" ? "Your files" : compact ? undefined : "All documents"} tone="muted">
        <EmptyState
          title="No documents yet"
          action={
            hideUpload || showUpload ? undefined : (
              <Button type="button" size="sm" onClick={() => setShowUpload(true)}>
                Upload a file
              </Button>
            )
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
        title={variant === "portal" ? "Your files" : compact ? undefined : "All documents"}
        description={compact ? undefined : `${documents.length} file${documents.length === 1 ? "" : "s"}`}
      >
        <ul className="ui-docs-list">
          {documents.map((doc) => {
            const type = documentTypeLabel(doc.mimeType, doc.filename);
            const busy = downloadingId === doc.id || deletingId === doc.id;
            return (
              <li key={doc.id}>
                <div className="ui-docs-list__main">
                  <FileTypeIcon label={type} />
                  <div className="ui-docs-list__text">
                    <span className="ui-docs-list__name">{doc.filename}</span>
                    <span className="ui-docs-list__meta-row">
                      <span className="ui-muted ui-docs-list__meta">{documentMeta(doc)}</span>
                      {variant === "clinic" && doc.visibility ? (
                        <Badge tone={doc.visibility === "SHARED" ? "info" : "neutral"}>
                          {humanizeLabel(doc.visibility)}
                        </Badge>
                      ) : null}
                    </span>
                  </div>
                </div>
                <div className="ui-docs-list__actions">
                  {compact ? (
                    <>
                      <button
                        type="button"
                        className="ui-docs-icon-btn"
                        disabled={busy}
                        aria-label={downloadingId === doc.id ? "Downloading" : "Download"}
                        title={downloadingId === doc.id ? "Downloading…" : "Download"}
                        onClick={() => void onDownload(doc)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      {onDelete ? (
                        <button
                          type="button"
                          className="ui-docs-icon-btn ui-docs-icon-btn--danger"
                          disabled={busy}
                          aria-label={deletingId === doc.id ? "Deleting" : "Delete"}
                          title={deletingId === doc.id ? "Deleting…" : "Delete"}
                          onClick={() => setPendingDelete(doc)}
                        >
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                            <path
                              d="M3 4h10M6 4V3h4v1M5 4l.6 9h4.8L11 4"
                              stroke="currentColor"
                              strokeWidth="1.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => void onDownload(doc)}
                      >
                        {downloadingId === doc.id ? "Downloading…" : "Download"}
                      </Button>
                      {onDelete ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => setPendingDelete(doc)}
                        >
                          {deletingId === doc.id ? "Deleting…" : "Delete"}
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
    );
  }

  return (
    <div className={compact ? "ui-docs ui-docs--compact" : "ui-docs"}>
      {header}
      {uploadBlock}
      {body}
      <ConfirmDialog
        open={pendingDelete != null}
        title="Delete this document?"
        description={
          pendingDelete
            ? `“${pendingDelete.filename}” will be removed. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        pending={deletingId != null && pendingDelete != null && deletingId === pendingDelete.id}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete || !onDelete) return;
          void onDelete(pendingDelete).finally(() => setPendingDelete(null));
        }}
      />
    </div>
  );
}
