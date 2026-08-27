"use client";

import { FormEvent, useState } from "react";
import { Button, ConfirmDialog, Input } from "@nutrition-saas/ui";
import { api } from "../lib/api";
import { errorMessage } from "../lib/humanize-error";

export interface ClinicTag {
  id: string;
  name: string;
  color?: string | null;
}

type Props = {
  dietitianAccountId: string;
  tags: ClinicTag[];
  onChange: (tags: ClinicTag[]) => void;
  disabled?: boolean;
  compact?: boolean;
  assignedIds?: string[];
  onToggleAssigned?: (id: string) => void;
  assignBusy?: boolean;
};

const IconPencil = (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path
      d="M11.2 2.8a1.3 1.3 0 0 1 1.8 1.8L6.2 11.4 3.5 12l.6-2.7z"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinejoin="round"
    />
  </svg>
);

const IconTrash = (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path
      d="M3 4h10M6 4V3h4v1M5 4l.6 9h4.8L11 4"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function ClinicTagsManager({
  dietitianAccountId,
  tags,
  onChange,
  disabled = false,
  compact = false,
  assignedIds,
  onToggleAssigned,
  assignBusy = false,
}: Props) {
  const base = `/api/v1/dietitian/${dietitianAccountId}/tags`;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const selectable = typeof onToggleAssigned === "function";
  const locked = disabled || busy || assignBusy;

  async function refresh() {
    const next = await api<ClinicTag[]>(base);
    onChange(next);
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || disabled) return;
    setBusy(true);
    setError(null);
    try {
      await api(base, { method: "POST", body: JSON.stringify({ name: trimmed }) });
      setName("");
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Unable to create tag"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(tagId: string) {
    const trimmed = editName.trim();
    if (!trimmed || disabled) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/${tagId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: trimmed }),
      });
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Unable to rename tag"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleteId || disabled) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/${deleteId}`, { method: "DELETE" });
      setDeleteId(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Unable to delete tag"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`ui-clinic-tags${compact ? " ui-clinic-tags--compact" : ""}${selectable ? " ui-clinic-tags--assign" : ""}`}>
      {error ? <p className="ui-clinic-tags__error">{error}</p> : null}

      {selectable ? (
        <p className="ui-clinic-tags__hint">Tap a tag to assign it to this client. Add, rename, or remove tags here.</p>
      ) : null}

      <form className="ui-clinic-tags__add" onSubmit={(event) => void handleCreate(event)}>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New tag name…"
          maxLength={40}
          aria-label="New tag name"
          disabled={locked}
        />
        <Button type="submit" size="sm" variant="secondary" disabled={locked || !name.trim()}>
          Add
        </Button>
      </form>

      {tags.length === 0 ? (
        <p className="ui-muted ui-clinic-tags__empty">No clinic tags yet. Add one above.</p>
      ) : (
        <ul className="ui-clinic-tags__list">
          {tags.map((tag) => {
            const assigned = assignedIds?.includes(tag.id) ?? false;
            return (
              <li
                key={tag.id}
                className={`ui-clinic-tags__row${assigned ? " is-on" : ""}${selectable ? " is-pick" : ""}`}
              >
                {editingId === tag.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      maxLength={40}
                      aria-label={`Rename ${tag.name}`}
                      disabled={locked}
                      autoFocus
                    />
                    <div className="ui-clinic-tags__row-actions">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={locked || !editName.trim()}
                        onClick={() => void handleRename(tag.id)}
                      >
                        Save
                      </Button>
                      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    {selectable ? (
                      <button
                        type="button"
                        className="ui-clinic-tags__pick"
                        disabled={locked}
                        aria-pressed={assigned}
                        onClick={() => onToggleAssigned(tag.id)}
                      >
                        <span className="ui-clinic-tags__check" aria-hidden>
                          {assigned ? "✓" : ""}
                        </span>
                        <span className="ui-clinic-tags__name">{tag.name}</span>
                        {assigned ? <span className="ui-clinic-tags__flag">Assigned</span> : null}
                      </button>
                    ) : (
                      <span className="ui-clinic-tags__name">{tag.name}</span>
                    )}
                    <div className="ui-clinic-tags__row-actions">
                      <button
                        type="button"
                        className="ui-clinic-tags__icon-btn"
                        disabled={locked}
                        aria-label={`Rename ${tag.name}`}
                        title="Rename"
                        onClick={() => {
                          setEditingId(tag.id);
                          setEditName(tag.name);
                        }}
                      >
                        {IconPencil}
                      </button>
                      <button
                        type="button"
                        className="ui-clinic-tags__icon-btn ui-clinic-tags__icon-btn--danger"
                        disabled={locked}
                        aria-label={`Remove ${tag.name}`}
                        title="Remove"
                        onClick={() => setDeleteId(tag.id)}
                      >
                        {IconTrash}
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Remove this tag?"
        description="It will be removed from your clinic library and from every client who has it."
        confirmLabel="Remove tag"
        pending={busy}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
